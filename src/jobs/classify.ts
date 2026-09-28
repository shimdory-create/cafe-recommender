import { PROMPT_VERSION } from '../llm/prompts.js'
import { passesLayer2 } from '../pipeline/buzz.js'
import { extractAttributes } from '../pipeline/extract.js'
import { assignTags } from '../pipeline/tag.js'
import { passesHardGate } from '../pipeline/gate.js'
import { recordFailure, recordQuotaError, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
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
  /** LLM 쿼터가 소진돼 중단했는가 */
  quotaExhausted: boolean
}

/**
 * 이만큼 연속으로 쿼터 오류가 나면 그날은 포기한다.
 *
 * 무료 티어 일일 한도를 넘기면 남은 카페 전부가 같은 오류로 실패한다.
 * 그런데 판정은 카페당 블로그를 2회 부른 **뒤에** LLM 을 타므로, 계속 돌면
 * 400번의 헛된 블로그 호출과 200건의 실패 기록만 남는다 (실측: 연속 실패
 * 220회). 일찍 멈추는 것이 쿼터도 로그도 아낀다.
 */
const QUOTA_GIVE_UP = 3

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
/**
 * 하루 판정 몫 중 **가까운 순**으로 채우는 비율.
 *
 * 화제량 순으로만 돌렸더니 집 근처가 몇 주째 판정 대기에 남았다. 실측:
 *
 * ```
 * 송도 75곳 수집 -> 판정 완료 10곳 (대기 59)
 * 영종 92곳 수집 -> 판정 완료  7곳 (대기 76)
 * 인천 대기분 화제량 중앙값 1.0 / 그날의 판정 컷 8.1
 * ```
 *
 * 블로그 글은 **멀리 나들이 간 곳**에 많이 쓰인다. 집에서 25분 거리 카페는
 * 콘텐츠가 안 되니 글이 적고, 화제량 순 줄에서 영원히 뒤로 밀린다. 그런데
 * 가족이 실제로 가장 자주 가는 곳이 거기다.
 *
 * 그래서 하루 몫의 일부를 거리순에 떼어 준다. 화제량 순의 목적(첫날부터
 * 추천 상단이 채워진다)은 나머지 70% 가 그대로 지킨다.
 */
const NEAR_SHARE = 0.3

const driveOf = (c: Cafe): number =>
  c.driveMinutes ?? c.driveMinutesEst ?? Number.POSITIVE_INFINITY

/**
 * 오늘 처리할 순서를 정한다.
 *
 *   mixed  기본. 화제량 70% + 거리 30%
 *   hot    화제량만 (예전 동작)
 *   near   거리만 — 특정 지역을 몰아서 메울 때 손으로 쓴다
 *   file   손대지 않는다 (발굴 순서)
 */
export function orderPending(
  pending: Cafe[],
  latest: Map<string, BuzzSnapshot>,
  opts: { order: 'hot' | 'near' | 'file' | 'mixed'; limit?: number },
): Cafe[] {
  const { order, limit } = opts
  if (order === 'file') return pending

  const rate = (c: Cafe) => latest.get(c.kakaoPlaceId)?.postsPer30 ?? -1
  const byHot = [...pending].sort((a, b) => rate(b) - rate(a) || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId))
  if (order === 'hot') return byHot

  const byNear = [...pending].sort((a, b) => driveOf(a) - driveOf(b) || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId))
  if (order === 'near') return byNear

  // 상한이 없으면 전량을 처리하므로 순서가 결과를 바꾸지 않는다
  if (!limit || limit >= pending.length) return byHot

  const nearQuota = Math.floor(limit * NEAR_SHARE)
  const picked = new Set<string>()
  const out: Cafe[] = []
  for (const c of byNear) {
    if (out.length >= nearQuota) break
    picked.add(c.kakaoPlaceId)
    out.push(c)
  }
  for (const c of byHot) {
    if (picked.has(c.kakaoPlaceId)) continue
    out.push(c)
  }
  return out
}

export async function runClassify(
  deps: ClassifyDeps,
  opts: { limit?: number; redoStale?: boolean; order?: 'hot' | 'near' | 'file' | 'mixed' } = {},
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

  const pending = cafes.filter((c) => c.status === 'pending_extraction')
  const ordered = orderPending(pending, latest, {
    order: opts.order ?? 'mixed',
    limit: opts.limit,
  })

  const targets: Cafe[] = [...stale, ...ordered].slice(0, opts.limit ?? Infinity)

  let classified = 0
  let excluded = 0
  let skipped = 0
  let failed = 0
  let quotaErrors = 0
  let quotaExhausted = false

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
      const l2 = passesLayer2(b, { now, driveMinutes: driveOf(c) })
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

      // --- Layer 5 (되돌릴 수 없는 배제만) ---
      // 주차 C 는 여기서 굳히지 않는다. 도심 모드로 볼 길이 막힌다.
      const gate = passesHardGate({ tags: c.tags, parkingGrade: attributes.parkingGrade })
      if (!gate.pass) {
        c.status = 'excluded_auto'
        c.excludeReason = gate.reason ?? 'Layer 5 탈락'
        excluded++
      } else {
        c.status = 'active'
        c.excludeReason = null
        classified++
      }
      // 한 곳이라도 통과했으면 쿼터가 살아 있다는 뜻이다
      quotaErrors = 0
    } catch (e) {
      // 한 카페가 실패해도 나머지를 계속한다. pending_extraction 으로
      // 남으므로 다음 회차에 자동 재시도된다.
      failed++
      await recordFailure(store, 'classify', e, now)

      // 쿼터 소진은 카페 문제가 아니라 그날의 한도 문제다. 계속 시도해도
      // 전부 같은 오류이므로 멈춘다.
      if (e instanceof SourceError && e.status === 429) {
        // 뒤에 통과하는 곳이 하나라도 있으면 recordSuccess 가 lastError를
        // 지운다 — 이 카운터는 그것과 무관하게 오늘 있었다는 사실을 남긴다.
        await recordQuotaError(store, 'classify', now)
        if (++quotaErrors >= QUOTA_GIVE_UP) {
          quotaExhausted = true
          break
        }
      } else {
        quotaErrors = 0
      }
    }
  }

  await store.writeCafes(cafes)
  // targets 가 0곳이면 판정 대기 큐가 실제로 비어 있는 정상 상태다 — 통과 0곳과
  // 구분 못 하면(2026-09) 큐가 빈 채로 며칠만 지나도 daily-watch 의 36시간
  // source_stale 경보가 오탐으로 울린다.
  if (targets.length === 0 || classified + excluded > 0) {
    await recordSuccess(store, 'classify', now)
  }
  return { classified, excluded, skipped, failed, quotaExhausted }
}
