import { PROMPT_VERSION } from '../llm/prompts.js'
import { passesLayer2 } from '../pipeline/buzz.js'
import { extractAttributes } from '../pipeline/extract.js'
import { assignTags } from '../pipeline/tag.js'
import { passesGate } from '../pipeline/gate.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BuzzSnapshot, Cafe } from '../schema.js'
import type { LlmClient } from '../llm/types.js'
import type { Store } from '../store/types.js'

export interface ClassifyDeps {
  store: Pick<
    Store,
    'readCafes' | 'writeCafes' | 'readBuzz' | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: {
    search: (
      q: string,
      o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  llm: LlmClient
  now?: Date
}

export interface ClassifyResult {
  classified: number
  excluded: number
  skipped: number
  failed: number
}

/** 프롬프트 판본이 낡아 재추출해야 하는가 */
export function isStaleExtraction(c: Cafe): boolean {
  return c.attributes !== null && !c.attributes.modelVersion.endsWith(`+${PROMPT_VERSION}`)
}

/** 중간 저장 간격. 이만큼마다 쓰면 죽어도 이만큼만 잃는다 */
const FLUSH_EVERY = 20

/**
 * Layer 2~5 를 순서대로 적용해 카페 상태를 확정한다.
 *
 * 자체 검토에서 발견한 누락을 메우는 잡이다. 각 Layer 를 순수 함수로
 * 만들었지만 그것들을 순서대로 호출해 상태를 확정하는 코드가 없었다.
 * discover 는 pending_extraction 으로 넣기만 하고 buzz 는 숫자만 갱신한다.
 *
 * 비용 설계: Layer 2(화제량 컷)를 LLM 호출 **앞에** 둔다. 탈락할 카페에
 * Gemini 를 쓰지 않는다. 통과율이 약 20% 이므로 LLM 호출이 1/5로 줄어든다.
 */
export async function runClassify(
  deps: ClassifyDeps,
  opts: { limit?: number; redoStale?: boolean; order?: 'hot' | 'file' } = {},
): Promise<ClassifyResult> {
  const { store, blog, llm, now = new Date() } = deps
  const cafes = await store.readCafes()
  const buzz = await store.readBuzz()

  const latest = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latest.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latest.set(b.kakaoPlaceId, b)
  }

  // 재추출 대상을 먼저 처리한다. 프롬프트를 고친 직후에는 낡은 판정을
  // 갱신하는 것이 새 카페를 늘리는 것보다 급하다.
  const stale = opts.redoStale ? cafes.filter(isStaleExtraction) : []

  // 화제량이 많은 순으로 처리한다. 무료 티어 때문에 하루 200곳이 상한이고
  // 전량은 일주일이 걸리므로, 파일 순서(= 지역 발굴 순서)로 돌면 며칠 동안
  // 특정 지역만 판정된 목록을 보게 된다. 뜨거운 곳부터 처리하면 첫날부터
  // 추천 상단이 제대로 채워지고 지역도 자연히 섞인다.
  const pending = cafes.filter((c) => c.status === 'pending_extraction')
  if ((opts.order ?? 'hot') === 'hot') {
    pending.sort(
      (a, b) =>
        (latest.get(b.kakaoPlaceId)?.postsPer30 ?? -1)
        - (latest.get(a.kakaoPlaceId)?.postsPer30 ?? -1),
    )
  }

  const targets: Cafe[] = [...stale, ...pending].slice(0, opts.limit ?? Infinity)

  let classified = 0
  let excluded = 0
  let skipped = 0
  let failed = 0

  for (const [i, c] of targets.entries()) {
    // 200곳이면 30분 넘게 돈다. 끝에서 한 번만 쓰면 중간에 죽을 때
    // LLM 호출 전부를 잃는다.
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeCafes(cafes)
    try {
      const b = latest.get(c.kakaoPlaceId)
      if (!b) {
        // daily-buzz 가 아직 안 돌았다. 탈락시키지 않고 다음 회차로 미룬다.
        skipped++
        continue
      }

      // --- Layer 2 (LLM 앞에 둔다) ---
      const l2 = passesLayer2(b, { now })
      if (!l2.pass) {
        c.status = 'excluded_auto'
        c.excludeReason = l2.reason ?? 'Layer 2 탈락'
        excluded++
        continue
      }

      // --- 주차 전용 스니펫 (스펙 7.3) ---
      // 한국 블로거는 주차를 거의 항상 쓴다. 전용 검색 1회가 등급
      // 정확도를 크게 올린다.
      const parkingQuery = `${c.sigungu} ${c.name} 주차`
      const parkingRes = await blog.search(parkingQuery, { size: 10, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-parking', parkingQuery, parkingRes.payload, now)

      const mainQuery = `${c.sigungu} ${c.name}`
      const mainRes = await blog.search(mainQuery, { size: 15, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-extract', mainQuery, mainRes.payload, now)

      // --- Layer 3 ---
      const attributes = await extractAttributes(
        { llm, now },
        {
          name: c.name,
          sigungu: c.sigungu,
          categoryName: c.categoryName ?? '',
          snippets: mainRes.docs.map((d) => `${d.title} ${d.contents}`),
          parkingSnippets: parkingRes.docs.map((d) => `${d.title} ${d.contents}`),
        },
      )
      c.attributes = attributes

      // --- Layer 4 ---
      c.tags = assignTags(attributes)

      // --- Layer 5 ---
      const gate = passesGate({ tags: c.tags, parkingGrade: attributes.parkingGrade })
      if (!gate.pass) {
        c.status = 'excluded_auto'
        c.excludeReason = gate.reason ?? 'Layer 5 탈락'
        excluded++
      } else {
        c.status = 'active'
        c.excludeReason = null
        classified++
      }
    } catch (e) {
      // 한 카페가 실패해도 나머지를 계속한다. pending_extraction 으로
      // 남으므로 다음 회차에 자동 재시도된다.
      failed++
      await recordFailure(store, 'classify', e, now)
    }
  }

  await store.writeCafes(cafes)
  if (classified + excluded > 0) await recordSuccess(store, 'classify', now)
  return { classified, excluded, skipped, failed }
}
