import { HOME } from '../pipeline/geo.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { Coord, Route } from '../sources/kakao-directions.js'
import type { Cafe } from '../schema.js'
import type { Store } from '../store/types.js'

export interface DriveDeps {
  store: Pick<Store, 'readCafes' | 'writeCafes' | 'appendRaw' | 'readHealth' | 'writeHealth'>
  directions: {
    route: (o: Coord, d: Coord) => Promise<{ route: Route | null; payload: unknown }>
  }
  now?: Date
}

export interface DriveResult {
  measured: number
  /** 경로를 못 찾은 곳 (섬·신설 도로 등) */
  unroutable: number
  failed: number
}

const FLUSH_EVERY = 25

/**
 * 게이트 통과분의 실주행 시간을 재서 보관한다.
 *
 * 카페는 움직이지 않으므로 한 번 재면 끝이다. 이미 값이 있으면 건너뛰므로
 * 매주 돌려도 신규분만 호출한다. 무료 한도가 일 10,000건이라 여유가 크다.
 *
 * 재지 못한 곳은 `driveMinutes` 를 null 로 남긴다 — 근사값(`driveMinutesEst`)이
 * 그대로 폴백으로 쓰인다. 실패가 카페를 목록에서 떨어뜨리지 않는다.
 */
export async function runDriveTimes(
  deps: DriveDeps,
  opts: { limit?: number; force?: boolean } = {},
): Promise<DriveResult> {
  const { store, directions, now = new Date() } = deps
  const cafes = await store.readCafes()

  const targets = cafes
    .filter((c) => c.status === 'active')
    .filter((c) => opts.force || c.driveMinutes == null)
    .slice(0, opts.limit ?? Infinity)

  let measured = 0
  let unroutable = 0
  let failed = 0

  for (const [i, c] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeCafes(cafes)
    try {
      const { route, payload } = await directions.route(HOME, { lat: c.lat, lng: c.lng })
      await store.appendRaw('kakao-directions', `${c.sigungu} ${c.name}`, payload, now)
      if (!route) {
        unroutable++
        continue
      }
      c.driveMinutes = route.minutes
      c.driveKm = route.km
      c.tollWon = route.tollWon
      measured++
    } catch (e) {
      failed++
      await recordFailure(store, 'kakao-directions', e, now)
    }
  }

  await store.writeCafes(cafes)
  if (measured > 0) await recordSuccess(store, 'kakao-directions', now)
  return { measured, unroutable, failed }
}

/**
 * 표시·점수에 쓸 이동시간. 실측이 있으면 실측, 없으면 근사.
 *
 * 이 함수를 통하지 않고 `driveMinutesEst` 를 직접 읽는 곳이 남으면
 * 실측을 붙인 의미가 없어진다.
 */
export function driveMinutesOf(c: Pick<Cafe, 'driveMinutes' | 'driveMinutesEst'>): number | null {
  return c.driveMinutes ?? c.driveMinutesEst ?? null
}
