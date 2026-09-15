import { describe, it, expect } from 'vitest'
import { planNearbyDriveFetches } from '../../src/site/nearby-drive-plan.js'
import { pairKeyOf, buildPairIndex } from '../../src/site/nearby-drive-cache.js'
import type { Cafe } from '../../src/schema.js'
import type { Restaurant } from '../../src/restaurant-schema.js'
import type { Spot } from '../../src/spot-schema.js'

function cafe(id: string, lat: number, lng: number, over: Partial<Cafe> = {}): Cafe {
  return {
    kakaoPlaceId: id, name: `카페${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
    ...over,
  } as Cafe
}

function restaurant(id: string, lat: number, lng: number, over: Partial<Restaurant> = {}): Restaurant {
  return {
    kakaoPlaceId: id, name: `식당${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
    ...over,
  } as Restaurant
}

function spot(id: string, lat: number, lng: number, over: Partial<Spot> = {}): Spot {
  return {
    kakaoPlaceId: id, name: `가볼곳${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
    ...over,
  } as Spot
}

describe('planNearbyDriveFetches', () => {
  it('preLimit 이내 미스만 계획한다', () => {
    const out = planNearbyDriveFetches({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901), restaurant('r2', 37.6, 127.0)],
      spots: [],
      cacheIndex: buildPairIndex([]),
      preLimit: 1,
      budget: 100,
    })
    // c1 -> 식당 방향에서 preLimit=1 이므로 더 가까운 r1만 계획된다
    expect(out.some((f) => f.anchorId === 'c1' && f.candidateId === 'r1')).toBe(true)
    expect(out.some((f) => f.anchorId === 'c1' && f.candidateId === 'r2')).toBe(false)
  })

  it('이미 캐시된 페어는 계획에서 뺀다', () => {
    const cache = buildPairIndex([{
      pairKey: pairKeyOf('c1', 'r1'), minutes: 5, km: 1, tollWon: 0,
      measuredAt: '2026-09-01T00:00:00.000Z',
    }])
    const out = planNearbyDriveFetches({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      spots: [],
      cacheIndex: cache,
      preLimit: 10,
      budget: 100,
    })
    expect(out.some((f) => f.anchorId === 'c1' && f.candidateId === 'r1')).toBe(false)
  })

  it('대칭 키라서 한 방향 계산 결과가 반대 방향 중복을 막는다', () => {
    // c1 -> r1 방향에서 이미 잡혔으면, r1 -> c1 방향에서 다시 안 나온다
    const out = planNearbyDriveFetches({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      spots: [],
      cacheIndex: buildPairIndex([]),
      preLimit: 10,
      budget: 100,
    })
    const c1ToR1 = out.filter((f) =>
      (f.anchorId === 'c1' && f.candidateId === 'r1')
      || (f.anchorId === 'r1' && f.candidateId === 'c1'))
    expect(c1ToR1).toHaveLength(1)
  })

  it('예산을 넘기면 그 자리에서 멈춘다', () => {
    const restaurants = Array.from({ length: 5 }, (_, i) =>
      restaurant(`r${i}`, 37.5 + i * 0.001, 126.9 + i * 0.001))
    const out = planNearbyDriveFetches({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants,
      spots: [],
      cacheIndex: buildPairIndex([]),
      preLimit: 10,
      budget: 2,
    })
    expect(out).toHaveLength(2)
  })

  it('parkingGrade C(cityOnly) 후보는 제외하지만 앵커로는 쓴다', () => {
    const cityOnlyCafe = cafe('c1', 37.5, 126.9, {
      attributes: { parkingGrade: 'C' } as never,
    })
    const out = planNearbyDriveFetches({
      cafes: [cityOnlyCafe],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      spots: [],
      cacheIndex: buildPairIndex([]),
      preLimit: 10,
      budget: 100,
    })
    // c1은 cityOnly 지만 앵커라서 근처 식당을 계획해야 한다
    expect(out.some((f) => f.anchorId === 'c1' && f.candidateId === 'r1')).toBe(true)
    // 반대로 c1이 후보(식당 r1의 근처 카페)로 쓰이는 건 없어야 한다
    expect(out.some((f) => f.anchorId === 'r1' && f.candidateId === 'c1')).toBe(false)
  })
})
