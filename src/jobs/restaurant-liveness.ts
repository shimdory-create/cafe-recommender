import type { KakaoPlace } from '../sources/kakao-local.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'
import { placeQuery } from '../pipeline/place-query.js'
import { recordFailure, recordSuccess } from '../sources/health.js'

/**
 * 아직 있는 식당인가 — 폐업 감지.
 *
 * 카페의 `jobs/liveness.ts` 를 그대로 옮긴 얇은 복사본이다 (일부러
 * 공용화하지 않았다 — 카페 폐업 감지 로직을 건드리지 않기 위해).
 * 동작 설명은 `jobs/liveness.ts` 참고.
 */

/** watch 잡이 "이 소스가 조용하다" 를 판단할 때 쓰는 이름. WEEKLY_SOURCES 에도 같은 값이 있다 */
export const RESTAURANT_LIVENESS_SOURCE = 'kakao-local-liveness-restaurant'

export interface RestaurantLivenessDeps {
  store: Pick<RestaurantStore, 'readRestaurants' | 'writeRestaurants' | 'appendRaw'>
    & Pick<RestaurantStore, 'readHealth' | 'writeHealth'>
  local: { searchKeyword(query: string, page?: number): Promise<{ places: KakaoPlace[]; payload: unknown }> }
  now?: Date
}

export interface RestaurantLivenessResult {
  checked: number
  seen: number
  missing: number
  failed: number
  /** 오래 안 보이는 곳 (사람이 볼 목록) */
  stale: { name: string; sigungu: string; days: number }[]
}

/** 이 날수를 넘도록 카카오에서 안 보이면 폐업 의심으로 본다 */
export const STALE_DAYS = 21

/** 한 식당이 며칠째 안 보이는가. 한 번도 확인 못 했으면 null */
export function daysUnseen(r: Restaurant, now: Date): number | null {
  const at = r.lastSeenAt ?? null
  if (!at) return null
  return Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000)
}

/** 폐업 의심 목록. 첫 확인 전(lastSeenAt 없음)은 세지 않는다 */
export function staleRestaurants(rows: Restaurant[], now: Date, days = STALE_DAYS): Restaurant[] {
  return rows.filter((r) => {
    if (r.status !== 'active') return false
    const d = daysUnseen(r, now)
    return d !== null && d > days
  })
}

export async function runRestaurantLiveness(
  deps: RestaurantLivenessDeps,
  opts: { limit?: number } = {},
): Promise<RestaurantLivenessResult> {
  const { store, local, now = new Date() } = deps
  const restaurants = await store.readRestaurants()

  // 통과한 식당만 본다. 대기·배제는 화면에 안 나오므로 확인할 이유가 없다.
  // 오래 못 본 것부터 — 상한에 걸려도 위험한 쪽이 먼저 확인된다.
  const targets = restaurants
    .filter((r) => r.status === 'active')
    .sort((a, b) => (a.lastSeenAt ?? '').localeCompare(b.lastSeenAt ?? ''))
    .slice(0, opts.limit ?? Infinity)

  let seen = 0
  let missing = 0
  let failed = 0

  for (const r of targets) {
    const query = placeQuery(r)
    try {
      const res = await local.searchKeyword(query, 1)
      await store.appendRaw(RESTAURANT_LIVENESS_SOURCE, query, res.payload, now)
      if (res.places.some((p) => p.id === r.kakaoPlaceId)) {
        r.lastSeenAt = now.toISOString()
        seen++
      } else {
        missing++
      }
    } catch (e) {
      // 호출 실패는 "없다" 가 아니다. 날짜를 건드리지 않고 넘어간다
      failed++
      await recordFailure(store, RESTAURANT_LIVENESS_SOURCE, e, now)
    }
  }

  await store.writeRestaurants(restaurants)
  // watch 잡이 이 소스가 며칠째 조용한지 본다 — 잡 자체가 안 도는 것을
  // "폐업 의심 0곳" 과 구분해야 한다. 안 그러면 몇 주 밀려도 아무 신호가 없다
  if (seen > 0) await recordSuccess(store, RESTAURANT_LIVENESS_SOURCE, now)

  return {
    checked: targets.length,
    seen,
    missing,
    failed,
    stale: staleRestaurants(restaurants, now).map((r) => ({
      name: r.name,
      sigungu: r.sigungu,
      days: daysUnseen(r, now) ?? 0,
    })),
  }
}
