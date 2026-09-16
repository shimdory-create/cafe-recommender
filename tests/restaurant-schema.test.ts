import { describe, it, expect } from 'vitest'
import { RestaurantSchema, RestaurantAttributesSchema, SiteRestaurantSchema, RestaurantSitePayloadSchema } from '../src/restaurant-schema.js'

describe('RestaurantAttributesSchema', () => {
  it('cuisineType 은 정해진 값만 받는다', () => {
    const base = {
      cuisineType: '한식', evidence: 'e', parkingGrade: 'A', parkingEvidence: 'p',
      hasRoom: null, reservable: null, viewStrength: 0, viewTypes: [],
      outdoorSeating: null, teenAppeal: null, confidence: 0.5,
      extractedAt: '2026-09-01T00:00:00.000Z', modelVersion: 'test',
    }
    expect(RestaurantAttributesSchema.safeParse(base).success).toBe(true)
    expect(RestaurantAttributesSchema.safeParse({ ...base, cuisineType: '아무거나' }).success)
      .toBe(false)
  })

  it('cuisineType 을 모르면 null 이다', () => {
    const base = {
      cuisineType: null, evidence: 'e', parkingGrade: '?', parkingEvidence: '',
      hasRoom: null, reservable: null, viewStrength: 0, viewTypes: [],
      outdoorSeating: null, teenAppeal: null, confidence: 0.2,
      extractedAt: '2026-09-01T00:00:00.000Z', modelVersion: 'test',
    }
    expect(RestaurantAttributesSchema.safeParse(base).success).toBe(true)
  })
})

describe('RestaurantSchema', () => {
  it('신규 발굴 카페와 같은 최소 필드로 파싱된다', () => {
    const r = {
      kakaoPlaceId: '1', name: '식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-01T00:00:00.000Z', status: 'pending_extraction',
      ambiguousName: false, tags: [],
    }
    expect(RestaurantSchema.safeParse(r).success).toBe(true)
  })
})

describe('SiteRestaurantSchema (2단계 웹 표시용)', () => {
  it('카페 SiteCafe와 동등한 필드를 검증한다', () => {
    const row = {
      id: '1', name: '식당', sigungu: '부평구', zone: 'near', area: '인천',
      driveMinutes: 20, lat: 37.5, lng: 127.0, cuisineType: '한식', hasRoom: true, reservable: false,
      parkingGrade: 'A', tags: ['한식', '룸있음'],
      evidence: '룸이 넓다', parkingEvidence: '주차장 넓음',
      viewTypes: [], outdoorSeating: null, teenAppeal: null,
      naverMapUrl: 'https://map.naver.com/p/search/x', kakaoPlaceUrl: null, imageUrl: null,
      hotScore: 5, finalScore: 3, postsPer30: 5, posts30: 3, posts90: 8,
      acceleration: 1, trend: 'steady', ratingAvg: 0, ratingCount: 0,
      familyReviews: [], cityOnly: false,
      visitedOn: null, firstSeenAt: '2026-08-01T00:00:00.000Z',
      isNew: true, lastSeenAt: null,
    }
    expect(() => SiteRestaurantSchema.parse(row)).not.toThrow()
  })

  it('RestaurantSitePayloadSchema가 week/stats 구조를 검증한다', () => {
    const payload = {
      generatedAt: '2026-09-01T00:00:00.000Z', weekOf: '2026-08-31',
      pipelineStatus: '자동수집 정상',
      week: [{ rank: 1, id: '1', finalScore: 3 }],
      restaurants: [], visited: [],
      stats: {
        discovered: 0, passed: 0, regions: 0, scannedRegions: 0,
        driveMeasured: 0, revisitDays: 180, cityOnly: 0, staleDays: 21,
      },
    }
    expect(() => RestaurantSitePayloadSchema.parse(payload)).not.toThrow()
  })
})
