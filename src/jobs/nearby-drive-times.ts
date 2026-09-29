import { planNearbyDriveFetches } from '../site/nearby-drive-plan.js'
import { buildPairIndex, pairKeyOf } from '../site/nearby-drive-cache.js'
import { recordFailure, recordQuotaError, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
import type { Coord, Route } from '../sources/kakao-directions.js'
import type { Cafe, Health, NearbyDrivePair } from '../schema.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { Spot } from '../spot-schema.js'

export const NEARBY_DRIVE_SOURCE = 'kakao-directions-nearby'
export const DAILY_BUDGET = 5000
export const PRE_LIMIT = 10
const QUOTA_GIVE_UP = 3
const FLUSH_EVERY = 25

export interface NearbyDriveDeps {
  store: {
    readCafes(): Promise<Cafe[]>
    readRestaurants(): Promise<Restaurant[]>
    readSpots(): Promise<Spot[]>
    readNearbyDriveCache(): Promise<NearbyDrivePair[]>
    writeNearbyDriveCache(rows: NearbyDrivePair[]): Promise<void>
    appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
    readHealth(): Promise<Health[]>
    writeHealth(rows: Health[]): Promise<void>
  }
  directions: { route(o: Coord, d: Coord): Promise<{ route: Route | null; payload: unknown }> }
  now?: Date
}

export interface NearbyDriveResult {
  measured: number
  unroutable: number
  failed: number
  quotaExhausted: boolean
  budgetExhausted: boolean
}

/**
 * 근처 추천 2단계 — 캐시에 없는 앵커↔후보 페어를 카카오 길찾기로 채운다.
 *
 * site 빌드(하루 여러 번)와 달리 이 잡은 **매일 한 번**만 돌아 오늘의
 * 예산만큼만 처리한다. 캐시가 다 채워지면 "오늘 할 일 0건"이 정상 상태가
 * 되고(classify.ts와 같은 이유), 남은 미스는 그날의 top-10 재계산에서
 * 자연히 다시 잡힌다 — 별도의 "밀린 작업 큐"를 유지하지 않는다.
 */
export async function runNearbyDriveTimes(
  deps: NearbyDriveDeps,
  opts: { budget?: number; preLimit?: number } = {},
): Promise<NearbyDriveResult> {
  const { store, directions, now = new Date() } = deps
  const budget = opts.budget ?? DAILY_BUDGET
  const preLimit = opts.preLimit ?? PRE_LIMIT

  const [cafes, restaurants, spots, cache] = await Promise.all([
    store.readCafes(), store.readRestaurants(), store.readSpots(), store.readNearbyDriveCache(),
  ])
  const cacheIndex = buildPairIndex(cache)

  // budget+1개까지 물어봐서, 오늘 미스가 예산을 넘었는지(budgetExhausted)를
  // 별도 카운트 없이 판단한다.
  const planned = planNearbyDriveFetches({
    cafes, restaurants, spots, cacheIndex, preLimit, budget: budget + 1,
  })
  const budgetExhausted = planned.length > budget
  const targets = planned.slice(0, budget)

  const byId = new Map<string, { lat: number; lng: number; name: string }>()
  for (const c of cafes) byId.set(c.kakaoPlaceId, c)
  for (const r of restaurants) byId.set(r.kakaoPlaceId, r)
  for (const s of spots) byId.set(s.kakaoPlaceId, s)

  let measured = 0
  let unroutable = 0
  let failed = 0
  let quotaErrors = 0
  let quotaExhausted = false
  const additions: NearbyDrivePair[] = []

  for (const [i, t] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) {
      await store.writeNearbyDriveCache([...cache, ...additions])
    }
    const anchor = byId.get(t.anchorId)
    const cand = byId.get(t.candidateId)
    if (!anchor || !cand) continue
    try {
      const { route, payload } = await directions.route(
        { lat: anchor.lat, lng: anchor.lng },
        { lat: cand.lat, lng: cand.lng },
      )
      await store.appendRaw(NEARBY_DRIVE_SOURCE, `${anchor.name} -> ${cand.name}`, payload, now)
      if (!route) {
        unroutable++
        continue
      }
      additions.push({
        pairKey: pairKeyOf(t.anchorId, t.candidateId),
        minutes: route.minutes,
        km: route.km,
        tollWon: route.tollWon,
        measuredAt: now.toISOString(),
      })
      measured++
      quotaErrors = 0
    } catch (e) {
      failed++
      await recordFailure(store, NEARBY_DRIVE_SOURCE, e, now)
      if (e instanceof SourceError && e.status === 429) {
        // classify.ts 와 같은 이유(2026-09-29) — 뒤에 성공한 건이 하나라도
        // 있으면 recordSuccess 가 lastError 를 지운다.
        await recordQuotaError(store, NEARBY_DRIVE_SOURCE, now)
        if (++quotaErrors >= QUOTA_GIVE_UP) {
          quotaExhausted = true
          break
        }
      } else {
        quotaErrors = 0
      }
    }
  }

  await store.writeNearbyDriveCache([...cache, ...additions])
  // targets 가 0곳(=오늘 처리할 미스가 없는 정상 상태)이거나, 처리한 것들이
  // 정상적인 결과(measured: 경로 찾음, unroutable: API는 성공했지만 경로가
  // 없는 정상 케이스 — 섬/오지 등)였다면 성공으로 기록한다 — classify.ts 의
  // classified + excluded 와 같은 원칙(daily-watch 오탐 방지). unroutable 을
  // 빼먹으면, 남은 미스가 전부 unroutable 인 날(백필 후반부에 흔함) measured
  // 가 0으로 남아 정상 상태인데도 성공이 기록되지 않는 버그가 재발한다.
  if (targets.length === 0 || measured + unroutable > 0) {
    await recordSuccess(store, NEARBY_DRIVE_SOURCE, now)
  }

  return { measured, unroutable, failed, quotaExhausted, budgetExhausted }
}
