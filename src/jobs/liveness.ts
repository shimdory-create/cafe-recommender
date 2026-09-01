import type { KakaoPlace } from '../sources/kakao-local.js'
import type { Cafe } from '../schema.js'
import type { Store } from '../store/types.js'
import { placeQuery } from '../pipeline/place-query.js'
import { recordFailure, recordSuccess } from '../sources/health.js'

/**
 * 아직 있는 카페인가 — 폐업 감지.
 *
 * 발굴 잡(`weekly-discover`)은 **새 카페만 넣는다.** 기존 id 는 그대로
 * 지나가므로, 카페가 문을 닫아도 우리 목록에는 영원히 남는다. 화제량으로
 * 알아채기에는 너무 느리다 — 블로그 글은 폐업 뒤에도 몇 달 남아 있다.
 *
 * 카카오 장소 검색은 폐업하면 결과에서 빠진다. 그래서 **통과한 카페를 다시
 * 찾아보고** 마지막으로 확인된 날짜를 남긴다. 그 날짜가 오래되면 사람이
 * 확인한다.
 *
 * **자동으로 내리지 않는다.** 검색 순위 밖으로 밀리거나 상호가 바뀌어도
 * 안 보일 수 있다. 멀쩡한 카페를 조용히 지우는 것이 놓치는 것보다 나쁘다.
 */

/** watch 잡이 "이 소스가 조용하다" 를 판단할 때 쓰는 이름. WEEKLY_SOURCES 에도 같은 값이 있다 */
export const LIVENESS_SOURCE = 'kakao-local-liveness'

export interface LivenessDeps {
  store: Pick<Store, 'readHealth' | 'writeHealth'> & {
    readCafes(): Promise<Cafe[]>
    writeCafes(cafes: Cafe[]): Promise<void>
    appendRaw(source: string, query: string, payload: unknown, at: Date): Promise<string>
  }
  local: { searchKeyword(query: string, page?: number): Promise<{ places: KakaoPlace[]; payload: unknown }> }
  now?: Date
}

export interface LivenessResult {
  checked: number
  seen: number
  missing: number
  failed: number
  /** 오래 안 보이는 곳 (사람이 볼 목록) */
  stale: { name: string; sigungu: string; days: number }[]
}

/** 이 날수를 넘도록 카카오에서 안 보이면 폐업 의심으로 본다 */
export const STALE_DAYS = 21

/** 한 카페가 며칠째 안 보이는가. 한 번도 확인 못 했으면 null */
export function daysUnseen(c: Cafe, now: Date): number | null {
  const at = c.lastSeenAt ?? null
  if (!at) return null
  return Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000)
}

/** 폐업 의심 목록. 첫 확인 전(lastSeenAt 없음)은 세지 않는다 */
export function staleCafes(cafes: Cafe[], now: Date, days = STALE_DAYS): Cafe[] {
  return cafes.filter((c) => {
    if (c.status !== 'active') return false
    const d = daysUnseen(c, now)
    return d !== null && d > days
  })
}

export async function runLiveness(
  deps: LivenessDeps,
  opts: { limit?: number } = {},
): Promise<LivenessResult> {
  const { store, local, now = new Date() } = deps
  const cafes = await store.readCafes()

  // 통과한 카페만 본다. 대기·배제는 화면에 안 나오므로 확인할 이유가 없다.
  // 오래 못 본 것부터 — 상한에 걸려도 위험한 쪽이 먼저 확인된다.
  const targets = cafes
    .filter((c) => c.status === 'active')
    .sort((a, b) => (a.lastSeenAt ?? '').localeCompare(b.lastSeenAt ?? ''))
    .slice(0, opts.limit ?? Infinity)

  let seen = 0
  let missing = 0
  let failed = 0

  for (const c of targets) {
    // 시도를 붙인다. `광주시 카페숨` 은 전남 광주 결과를 준다 (실측)
    const query = placeQuery(c)
    try {
      const res = await local.searchKeyword(query, 1)
      await store.appendRaw(LIVENESS_SOURCE, query, res.payload, now)
      if (res.places.some((p) => p.id === c.kakaoPlaceId)) {
        c.lastSeenAt = now.toISOString()
        seen++
      } else {
        missing++
      }
    } catch (e) {
      // 호출 실패는 "없다" 가 아니다. 날짜를 건드리지 않고 넘어간다
      failed++
      await recordFailure(store, LIVENESS_SOURCE, e, now)
    }
  }

  await store.writeCafes(cafes)
  // watch 잡이 이 소스가 며칠째 조용한지 본다 — 잡 자체가 안 도는 것을
  // "폐업 의심 0곳" 과 구분해야 한다. 안 그러면 몇 주 밀려도 아무 신호가 없다
  if (seen > 0) await recordSuccess(store, LIVENESS_SOURCE, now)

  return {
    checked: targets.length,
    seen,
    missing,
    failed,
    stale: staleCafes(cafes, now).map((c) => ({
      name: c.name,
      sigungu: c.sigungu,
      days: daysUnseen(c, now) ?? 0,
    })),
  }
}
