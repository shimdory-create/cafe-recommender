// tests/site/nearby-payload.test.ts
import { describe, it, expect } from 'vitest'
import { buildNearbyPayloads } from '../../src/site/nearby-payload.js'
import type { Cafe } from '../../src/schema.js'
import type { Restaurant } from '../../src/restaurant-schema.js'
import type { Spot } from '../../src/spot-schema.js'

// 좌표·id·status 만 있으면 되는 최소 필드. 나머지는 any 캐스팅 없이
// 실제 스키마 필드를 채운다 — 테스트 파일이라도 타입은 정확해야 한다.
function cafe(overrides: Partial<Cafe>): Cafe {
  return {
    kakaoPlaceId: 'c1', name: '카페', sigungu: '부평구', roadAddress: '',
    address: '', lat: 37.5, lng: 126.9, categoryName: '', kakaoPlaceUrl: null,
    naverMapUrl: null, phone: null, straightKm: 0, driveMinutesEst: null,
    firstSeenAt: '2026-01-01', status: 'active', excludeReason: null,
    ambiguousName: false, imageUrl: null, attributes: null, tags: [],
    ...overrides,
  } as Cafe
}

function siteCafe(overrides: Partial<{ id: string; cityOnly: boolean }>) {
  return {
    id: overrides.id ?? 'c1', name: '카페', sigungu: '부평구', zone: 'near',
    area: '인천', driveMinutes: 10, scale: null, parkingGrade: 'A', menuLevel: 1,
    tags: [], evidence: '', parkingEvidence: '', signatureMenu: null,
    viewTypes: [], mealTypes: [], outdoorSeating: null, teenAppeal: null,
    stayDuration: null, naverMapUrl: '', kakaoPlaceUrl: null, imageUrl: null,
    hotScore: 0, finalScore: 0, postsPer30: 0, posts30: 0, posts90: 0,
    acceleration: 0, trend: 'unknown', ratingAvg: 0, ratingCount: 0,
    familyReviews: [], cityOnly: overrides.cityOnly ?? false, visitedOn: null,
    firstSeenAt: '2026-01-01', isNew: false, lastSeenAt: null,
  }
}

describe('buildNearbyPayloads', () => {
  it('카페 앵커 기준으로 가까운 식당·가볼곳을 채운다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [{ kakaoPlaceId: 's1', lat: 37.502, lng: 126.902 } as Spot],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      spotSite: [{ id: 's1', name: '가볼곳', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      driveCache: [],
      preLimit: 10,
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toHaveLength(1)
    expect(result.cafe.c1!.restaurants[0]!.id).toBe('r1')
    expect(result.cafe.c1!.spots).toHaveLength(1)
    expect(result.restaurant.r1!.cafes[0]!.id).toBe('c1')
    expect(result.spot.s1!.cafes[0]!.id).toBe('c1')
  })

  it('cityOnly 후보는 제외한다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: true } as never],
      spotSite: [],
      driveCache: [],
      preLimit: 10,
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toEqual([])
  })

  it('캐시에 실측이 있으면 driveMinutes를 채우고, 없으면 null이다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      spotSite: [],
      driveCache: [],
      preLimit: 10,
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants[0]).toHaveProperty('driveMinutes', null)
    expect(result.cafe.c1!.restaurants[0]).toHaveProperty('distanceKm')
  })

  it('원본 배열이 비어있으면 그 도메인 관련 결과가 빈 배열이다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [],
      spotSite: [],
      driveCache: [],
      preLimit: 10,
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toEqual([])
    expect(result.cafe.c1!.spots).toEqual([])
  })

  it('길찾기 링크에 앵커가 먼저, 대상이 나중에 좌표·이름·자동차 모드로 들어간다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      spotSite: [],
      driveCache: [],
      preLimit: 10,
      limit: 5,
    })
    const url = result.cafe.c1!.restaurants[0]!.directionsUrl
    expect(url).toBe(
      'https://map.naver.com/p/directions/126.9,37.5,%EC%B9%B4%ED%8E%98/126.901,37.501,%EC%8B%9D%EB%8B%B9/-/car',
    )
  })

  it('cityOnly 앵커도 자기 키는 갖지만, 다른 곳의 후보에는 안 낀다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1', cityOnly: true }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      spotSite: [],
      driveCache: [],
      preLimit: 10,
      limit: 5,
    })
    // cityOnly인 c1도 자기 키(근처 식당 목록)는 갖는다
    expect(result.cafe.c1).toBeDefined()
    expect(result.cafe.c1!.restaurants).toHaveLength(1)
    // 하지만 식당 쪽에서 볼 때 c1(cityOnly)은 후보에서 빠진다
    expect(result.restaurant.r1!.cafes).toEqual([])
  })

  it('실측 페어가 있으면 그 값 기준으로 재정렬한다(직선거리 순서와 달라도)', () => {
    const near: Restaurant = { kakaoPlaceId: 'near', lat: 37.501, lng: 126.901 } as Restaurant
    const far: Restaurant = { kakaoPlaceId: 'far', lat: 37.502, lng: 126.902 } as Restaurant
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [near, far],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [
        { id: 'near', name: '가까운식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never,
        { id: 'far', name: '먼식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never,
      ],
      spotSite: [],
      // 직선거리로는 near가 더 가깝지만, 실측으로는 far가 더 빠르다고 캐시해둔다
      driveCache: [
        { pairKey: 'c1:far', minutes: 3, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
        { pairKey: 'c1:near', minutes: 30, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
      ],
      preLimit: 10,
      limit: 5,
    })
    const ids = result.cafe.c1!.restaurants.map((r) => r.id)
    expect(ids[0]).toBe('far')
    expect(ids[1]).toBe('near')
  })

  it('preLimit으로 직선거리 1차 후보를 좁힌 뒤에만 재정렬한다', () => {
    // preLimit=1이면 far는 애초에 1차 후보에도 못 들어간다(near가 더 가까움)
    const near: Restaurant = { kakaoPlaceId: 'near', lat: 37.501, lng: 126.901 } as Restaurant
    const far: Restaurant = { kakaoPlaceId: 'far', lat: 38.5, lng: 127.9 } as Restaurant
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [near, far],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [
        { id: 'near', name: '가까운식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never,
        { id: 'far', name: '먼식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never,
      ],
      spotSite: [],
      driveCache: [
        { pairKey: 'c1:far', minutes: 1, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
      ],
      preLimit: 1,
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants.map((r) => r.id)).toEqual(['near'])
  })
})
