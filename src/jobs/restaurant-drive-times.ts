import { recordFailure, recordSuccess } from '../sources/health.js'
import type { Coord, Route } from '../sources/kakao-directions.js'
import type { LatLng } from '../pipeline/geo.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export interface RestaurantDriveDeps {
  store: Pick<RestaurantStore, 'readRestaurants' | 'writeRestaurants' | 'appendRaw'>
    & Pick<RestaurantStore, 'readHealth' | 'writeHealth'>
  directions: {
    route: (o: Coord, d: Coord) => Promise<{ route: Route | null; payload: unknown }>
  }
  now?: Date
  /** 출발지 — 주지 않으면 cli/context.ts 배선 전 기본값을 쓴다 */
  home?: LatLng
}

export interface RestaurantDriveResult {
  measured: number
  /** 경로를 못 찾은 곳 (섬·신설 도로 등) */
  unroutable: number
  failed: number
}

const FLUSH_EVERY = 25
const RESTAURANT_DIRECTIONS_SOURCE = 'kakao-directions-restaurant'

/**
 * 게이트 통과분의 실주행 시간을 재서 보관한다.
 *
 * 카페의 `jobs/drive-times.ts` 를 그대로 옮긴 얇은 복사본이다. 동작 설명은
 * `jobs/drive-times.ts` 참고.
 */
export async function runRestaurantDriveTimes(
  deps: RestaurantDriveDeps,
  opts: { limit?: number; force?: boolean } = {},
): Promise<RestaurantDriveResult> {
  const { store, directions, now = new Date(), home = { lat: 37.5151091, lng: 126.7398273 } } = deps
  const restaurants = await store.readRestaurants()

  const targets = restaurants
    .filter((r) => r.status === 'active')
    .filter((r) => opts.force || r.driveMinutes == null)
    .slice(0, opts.limit ?? Infinity)

  let measured = 0
  let unroutable = 0
  let failed = 0

  for (const [i, r] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeRestaurants(restaurants)
    try {
      const { route, payload } = await directions.route(home, { lat: r.lat, lng: r.lng })
      await store.appendRaw(RESTAURANT_DIRECTIONS_SOURCE, `${r.sigungu} ${r.name}`, payload, now)
      if (!route) {
        unroutable++
        continue
      }
      r.driveMinutes = route.minutes
      r.driveKm = route.km
      r.tollWon = route.tollWon
      measured++
    } catch (e) {
      failed++
      await recordFailure(store, RESTAURANT_DIRECTIONS_SOURCE, e, now)
    }
  }

  await store.writeRestaurants(restaurants)
  if (measured > 0) await recordSuccess(store, RESTAURANT_DIRECTIONS_SOURCE, now)
  return { measured, unroutable, failed }
}

/**
 * 표시·점수에 쓸 이동시간. 실측이 있으면 실측, 없으면 근사.
 *
 * 이 함수를 통하지 않고 `driveMinutesEst` 를 직접 읽는 곳이 남으면
 * 실측을 붙인 의미가 없어진다.
 */
export function restaurantDriveMinutesOf(
  r: Pick<Restaurant, 'driveMinutes' | 'driveMinutesEst'>,
): number | null {
  return r.driveMinutes ?? r.driveMinutesEst ?? null
}
