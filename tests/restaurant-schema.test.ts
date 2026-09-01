import { describe, it, expect } from 'vitest'
import { RestaurantSchema, RestaurantAttributesSchema } from '../src/restaurant-schema.js'

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
