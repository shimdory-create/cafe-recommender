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
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toEqual([])
  })

  it('출력 카드에 driveMinutes 필드가 없다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      spotSite: [],
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants[0]).not.toHaveProperty('driveMinutes')
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
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toEqual([])
    expect(result.cafe.c1!.spots).toEqual([])
  })
})
