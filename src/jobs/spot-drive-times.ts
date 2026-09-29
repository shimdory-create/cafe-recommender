import { recordFailure, recordSuccess } from '../sources/health.js'
import type { Coord, Route } from '../sources/kakao-directions.js'
import type { LatLng } from '../pipeline/geo.js'
import type { Spot } from '../spot-schema.js'
import type { SpotStore } from '../store/spot-json-store.js'

export interface SpotDriveDeps {
  store: Pick<SpotStore, 'readSpots' | 'writeSpots' | 'appendRaw'>
    & Pick<SpotStore, 'readHealth' | 'writeHealth'>
  directions: { route: (o: Coord, d: Coord) => Promise<{ route: Route | null; payload: unknown }> }
  now?: Date
  /** 출발지 — 주지 않으면 cli/context.ts 배선 전 기본값을 쓴다 */
  home?: LatLng
}

export interface SpotDriveResult {
  measured: number
  unroutable: number
  failed: number
}

const FLUSH_EVERY = 25
const SPOT_DIRECTIONS_SOURCE = 'kakao-directions-spot'

/**
 * 게이트 통과분의 실주행 시간을 재서 보관한다.
 *
 * 카페의 `jobs/drive-times.ts` 를 그대로 옮긴 얇은 복사본이다. 동작 설명은
 * `jobs/drive-times.ts` 참고.
 */
export async function runSpotDriveTimes(
  deps: SpotDriveDeps,
  opts: { limit?: number; force?: boolean } = {},
): Promise<SpotDriveResult> {
  const { store, directions, now = new Date(), home = { lat: 37.5151091, lng: 126.7398273 } } = deps
  const spots = await store.readSpots()

  const targets = spots
    .filter((s) => s.status === 'active')
    .filter((s) => opts.force || s.driveMinutes == null)
    .slice(0, opts.limit ?? Infinity)

  let measured = 0
  let unroutable = 0
  let failed = 0

  for (const [i, s] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeSpots(spots)
    try {
      const { route, payload } = await directions.route(home, { lat: s.lat, lng: s.lng })
      await store.appendRaw(SPOT_DIRECTIONS_SOURCE, `${s.sigungu} ${s.name}`, payload, now)
      if (!route) {
        unroutable++
        continue
      }
      s.driveMinutes = route.minutes
      s.driveKm = route.km
      s.tollWon = route.tollWon
      measured++
    } catch (e) {
      failed++
      await recordFailure(store, SPOT_DIRECTIONS_SOURCE, e, now)
    }
  }

  await store.writeSpots(spots)
  if (measured > 0) await recordSuccess(store, SPOT_DIRECTIONS_SOURCE, now)
  return { measured, unroutable, failed }
}

/**
 * 표시·점수에 쓸 이동시간. 실측이 있으면 실측, 없으면 근사.
 *
 * 이 함수를 통하지 않고 `driveMinutesEst` 를 직접 읽는 곳이 남으면
 * 실측을 붙인 의미가 없어진다.
 */
export function spotDriveMinutesOf(
  s: Pick<Spot, 'driveMinutes' | 'driveMinutesEst'>,
): number | null {
  return s.driveMinutes ?? s.driveMinutesEst ?? null
}
