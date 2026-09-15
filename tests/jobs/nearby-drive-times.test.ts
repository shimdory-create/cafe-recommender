import { describe, it, expect } from 'vitest'
import { runNearbyDriveTimes, type NearbyDriveDeps } from '../../src/jobs/nearby-drive-times.js'
import { pairKeyOf } from '../../src/site/nearby-drive-cache.js'
import { SourceError } from '../../src/sources/rate-limiter.js'
import type { Cafe, Health, NearbyDrivePair } from '../../src/schema.js'
import type { Restaurant } from '../../src/restaurant-schema.js'
import type { Coord, Route } from '../../src/sources/kakao-directions.js'

const NOW = new Date('2026-09-15T00:00:00.000Z')

function cafe(id: string, lat: number, lng: number): Cafe {
  return {
    kakaoPlaceId: id, name: `카페${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
  } as Cafe
}

function restaurant(id: string, lat: number, lng: number): Restaurant {
  return {
    kakaoPlaceId: id, name: `식당${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
  } as Restaurant
}

function harness(opts?: {
  cafes?: Cafe[]
  restaurants?: Restaurant[]
  cache?: NearbyDrivePair[]
  route?: (o: Coord, d: Coord) => Promise<{ route: Route | null; payload: unknown }>
}) {
  let cache = opts?.cache ?? []
  let health: Health[] = []
  let routeCalls = 0
  const deps: NearbyDriveDeps = {
    store: {
      readCafes: async () => opts?.cafes ?? [],
      readRestaurants: async () => opts?.restaurants ?? [],
      readSpots: async () => [],
      readNearbyDriveCache: async () => cache,
      writeNearbyDriveCache: async (r) => { cache = r },
      appendRaw: async () => 'p',
      readHealth: async () => health,
      writeHealth: async (r) => { health = r },
    },
    directions: {
      route: async (o, d) => {
        routeCalls++
        return opts?.route ? opts.route(o, d) : { route: { minutes: 10, km: 2, tollWon: 0 }, payload: {} }
      },
    },
    now: NOW,
  }
  return { deps, cache: () => cache, health: () => health, routeCalls: () => routeCalls }
}

describe('runNearbyDriveTimes', () => {
  it('캐시에 없는 페어만 API를 호출해서 채운다', async () => {
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.measured).toBe(1)
    expect(h.routeCalls()).toBe(1)
    expect(h.cache()).toHaveLength(1)
    expect(h.cache()[0]!.pairKey).toBe(pairKeyOf('c1', 'r1'))
  })

  it('이미 캐시된 페어는 재호출하지 않는다(대칭 근사)', async () => {
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      cache: [{
        pairKey: pairKeyOf('c1', 'r1'), minutes: 5, km: 1, tollWon: 0,
        measuredAt: '2026-09-01T00:00:00.000Z',
      }],
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.measured).toBe(0)
    expect(h.routeCalls()).toBe(0)
  })

  it('예산을 넘으면 budgetExhausted: true', async () => {
    const restaurants = Array.from({ length: 5 }, (_, i) =>
      restaurant(`r${i}`, 37.5 + i * 0.001, 126.9 + i * 0.001))
    const h = harness({ cafes: [cafe('c1', 37.5, 126.9)], restaurants })
    const r = await runNearbyDriveTimes(h.deps, { budget: 2 })
    expect(r.budgetExhausted).toBe(true)
    expect(r.measured).toBe(2)
  })

  it('처리할 미스가 0건이어도 health 성공을 기록한다', async () => {
    const h = harness({})
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.measured).toBe(0)
    const entry = h.health().find((x) => x.source === 'kakao-directions-nearby')
    expect(entry?.lastSuccessAt).toBe(NOW.toISOString())
  })

  it('미스가 있는데 전부 실패하면 health 성공을 기록하지 않는다', async () => {
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      route: async () => { throw new Error('네트워크 오류') },
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.failed).toBe(1)
    const entry = h.health().find((x) => x.source === 'kakao-directions-nearby')
    expect(entry?.lastSuccessAt).toBeFalsy()
  })

  it('쿼터 연속 3회 실패 시 조기 중단한다', async () => {
    const restaurants = Array.from({ length: 10 }, (_, i) =>
      restaurant(`r${i}`, 37.5 + i * 0.001, 126.9 + i * 0.001))
    let calls = 0
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants,
      route: async () => { calls++; throw new SourceError('429', 429) },
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.quotaExhausted).toBe(true)
    expect(calls).toBe(3)
  })

  it('경로를 못 찾은 페어는 캐시에 안 남긴다', async () => {
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      route: async () => ({ route: null, payload: {} }),
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.unroutable).toBe(1)
    expect(h.cache()).toHaveLength(0)
  })

  it('미스가 있어도 전부 unroutable(정상적으로 경로 없음)이면 health 성공을 기록한다', async () => {
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      route: async () => ({ route: null, payload: {} }),
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.measured).toBe(0)
    expect(r.unroutable).toBe(1)
    expect(r.failed).toBe(0)
    const entry = h.health().find((x) => x.source === 'kakao-directions-nearby')
    expect(entry?.lastSuccessAt).toBe(NOW.toISOString())
  })
})
