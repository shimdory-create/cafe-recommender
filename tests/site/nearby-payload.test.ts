// tests/site/nearby-payload.test.ts
import { describe, it, expect } from 'vitest'
import { buildNearbyPayloads } from '../../src/site/nearby-payload.js'
import type { SiteCafe } from '../../src/schema.js'
import type { SiteRestaurant } from '../../src/restaurant-schema.js'
import type { SiteSpot } from '../../src/spot-schema.js'
import type { NearbyDrivePair } from '../../src/schema.js'

function siteCafe(over: Partial<{ id: string; lat: number; lng: number; cityOnly: boolean }> = {}) {
  return {
    id: over.id ?? 'c1', name: '카페', sigungu: '부평구', zone: 'near',
    area: '인천', driveMinutes: 10, lat: over.lat ?? 37.5, lng: over.lng ?? 126.9,
    scale: null, parkingGrade: 'A', menuLevel: 1,
    tags: [], evidence: '', parkingEvidence: '', signatureMenu: null,
    viewTypes: [], mealTypes: [], outdoorSeating: null, teenAppeal: null,
    stayDuration: null, naverMapUrl: '', kakaoPlaceUrl: null, imageUrl: null,
    hotScore: 0, finalScore: 0, postsPer30: 0, posts30: 0, posts90: 0,
    acceleration: 0, trend: 'unknown', ratingAvg: 0, ratingCount: 0,
    familyReviews: [], cityOnly: over.cityOnly ?? false, visitedOn: null,
    firstSeenAt: '2026-01-01', isNew: false, lastSeenAt: null,
  } as unknown as SiteCafe
}

function siteRestaurant(
  over: Partial<{ id: string; lat: number; lng: number; cityOnly: boolean }> = {},
) {
  return {
    id: over.id ?? 'r1', name: '식당', sigungu: '부평구',
    lat: over.lat ?? 37.501, lng: over.lng ?? 126.901,
    imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0,
    cityOnly: over.cityOnly ?? false,
  } as unknown as SiteRestaurant
}

function siteSpot(over: Partial<{ id: string; lat: number; lng: number; cityOnly: boolean }> = {}) {
  return {
    id: over.id ?? 's1', name: '가볼곳', sigungu: '부평구',
    lat: over.lat ?? 37.502, lng: over.lng ?? 126.902,
    imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0,
    cityOnly: over.cityOnly ?? false,
  } as unknown as SiteSpot
}

describe('buildNearbyPayloads', () => {
  it('카페 앵커 기준으로 가까운 식당·가볼곳을 관계 정보로 채운다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [siteRestaurant({ id: 'r1' })],
      spotSite: [siteSpot({ id: 's1' })],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toHaveLength(1)
    expect(result.cafe.c1!.restaurants[0]).toEqual({ id: 'r1', distanceKm: expect.any(Number), driveMinutes: null })
    expect(result.cafe.c1!.spots).toHaveLength(1)
    expect(result.restaurant.r1!.cafes[0]!.id).toBe('c1')
    expect(result.spot.s1!.cafes[0]!.id).toBe('c1')
  })

  it('cityOnly 후보는 제외한다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [siteRestaurant({ id: 'r1', cityOnly: true })],
      spotSite: [],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toEqual([])
  })

  it('cityOnly 앵커도 자기 키는 갖지만, 다른 곳의 후보에는 안 낀다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1', cityOnly: true })],
      restaurantSite: [siteRestaurant({ id: 'r1' })],
      spotSite: [],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1).toBeDefined()
    expect(result.cafe.c1!.restaurants).toHaveLength(1)
    expect(result.restaurant.r1!.cafes).toEqual([])
  })

  it('site 배열이 비어있으면 그 도메인 관련 결과가 빈 배열이다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [],
      spotSite: [],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toEqual([])
    expect(result.cafe.c1!.spots).toEqual([])
  })

  it('캐시에 실측이 있으면 driveMinutes를 채우고, 없으면 null이다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [siteRestaurant({ id: 'r1' })],
      spotSite: [],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1!.restaurants[0]).toEqual({ id: 'r1', distanceKm: expect.any(Number), driveMinutes: null })
  })

  it('실측 페어가 있으면 그 값 기준으로 재정렬한다(직선거리 순서와 달라도)', () => {
    const near = siteRestaurant({ id: 'near', lat: 37.501, lng: 126.901 })
    const far = siteRestaurant({ id: 'far', lat: 37.502, lng: 126.902 })
    const driveCache: NearbyDrivePair[] = [
      { pairKey: 'c1:far', minutes: 3, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
      { pairKey: 'c1:near', minutes: 30, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
    ]
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [near, far],
      spotSite: [],
      driveCache, preLimit: 10, limit: 5,
    })
    const ids = result.cafe.c1!.restaurants.map((r) => r.id)
    expect(ids[0]).toBe('far')
    expect(ids[1]).toBe('near')
    expect(result.cafe.c1!.restaurants[0]!.driveMinutes).toBe(3)
  })

  it('preLimit으로 직선거리 1차 후보를 좁힌 뒤에만 재정렬한다', () => {
    const near = siteRestaurant({ id: 'near', lat: 37.501, lng: 126.901 })
    const far = siteRestaurant({ id: 'far', lat: 38.5, lng: 127.9 })
    const driveCache: NearbyDrivePair[] = [
      { pairKey: 'c1:far', minutes: 1, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
    ]
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [near, far],
      spotSite: [],
      driveCache, preLimit: 1, limit: 5,
    })
    expect(result.cafe.c1!.restaurants.map((r) => r.id)).toEqual(['near'])
  })
})
