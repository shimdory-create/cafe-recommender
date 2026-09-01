import { describe, it, expect } from 'vitest'
import { buildRestaurantSitePayload, restaurantTrendOf, dedupeRestaurantListings } from '../../src/site/restaurant-payload.js'
import {
  RestaurantSitePayloadSchema,
  type RestaurantAttributes, type Restaurant, type SiteRestaurant,
} from '../../src/restaurant-schema.js'
import type { BuzzSnapshot, Visit, Review } from '../../src/schema.js'

const NOW = new Date('2026-08-20T00:00:00Z')

const attrs = (over: Partial<RestaurantAttributes> = {}): RestaurantAttributes => ({
  cuisineType: '한식', evidence: '룸이 넓다', parkingGrade: 'A', parkingEvidence: '주차장 넓음',
  hasRoom: true, reservable: true, viewStrength: 0, viewTypes: [], outdoorSeating: null,
  teenAppeal: 3, confidence: 0.9, extractedAt: NOW.toISOString(), modelVersion: 'v1',
  ...over,
})

const restaurant = (id: string, over: Partial<Restaurant> = {}): Restaurant => ({
  kakaoPlaceId: id, name: `식당${id}`, sigungu: '부평구', lat: 37.5, lng: 126.7,
  naverMapUrl: 'https://map.naver.com/p/search/x', kakaoPlaceUrl: 'http://place.map.kakao.com/1',
  firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active', ambiguousName: false,
  attributes: attrs(), tags: ['한식', '룸있음'],
  ...over,
})

const buzz = (id: string, over: Partial<BuzzSnapshot> = {}): BuzzSnapshot => ({
  kakaoPlaceId: id, capturedAt: '2026-08-19',
  receivedCount: 50, relevantCount: 40, precision: 0.8,
  spanDays: 20, postsPer30: 60, posts30d: 30, postsPrev: 15,
  firstPostDate: '2026-07-01', latestPostDate: '2026-08-19',
  acceleration: 1.6, suspectAmbiguous: false,
  ...over,
})

const build = (
  restaurants: Restaurant[], buzzRows: BuzzSnapshot[],
  over: Partial<Parameters<typeof buildRestaurantSitePayload>[0]> = {},
) => buildRestaurantSitePayload({
  restaurants, buzz: buzzRows, visits: [], suggestions: [], reviews: [],
  weekOf: '2026-08-17', now: NOW, ...over,
})

describe('buildRestaurantSitePayload', () => {
  it('스키마를 만족하는 페이로드를 만든다', () => {
    const p = build([restaurant('1')], [buzz('1')])
    expect(() => RestaurantSitePayloadSchema.parse(p)).not.toThrow()
    expect(p.restaurants).toHaveLength(1)
  })

  it('판정 전·숨김·태그 0개(음식종류 미분류)는 싣지 않는다', () => {
    const p = build(
      [
        restaurant('1'),
        restaurant('2', { status: 'pending_extraction', attributes: null }),
        restaurant('3', { status: 'hidden' }),
        restaurant('4', { attributes: attrs({ cuisineType: null }), tags: [] }),
      ],
      ['1', '2', '3', '4'].map((id) => buzz(id)),
    )
    expect(p.restaurants.map((r) => r.id)).toEqual(['1'])
  })

  it('같은 이름+시군구는 하나로 합친다 (도로명 주소 있는 쪽을 남긴다)', () => {
    const dupe = restaurant('2', { name: '식당1', roadAddress: '인천 부평구 1' })
    const p = build([restaurant('1'), dupe], [buzz('1'), buzz('2')])
    expect(p.restaurants).toHaveLength(1)
    expect(p.restaurants[0]!.id).toBe('2')
  })
})

describe('restaurantTrendOf', () => {
  it('90일 창을 못 채우면 unknown', () => {
    expect(restaurantTrendOf({ posts30d: 10, postsPrev: 5, spanDays: 40 })).toBe('unknown')
  })
})

describe('dedupeRestaurantListings', () => {
  it('빈 목록은 빈 목록', () => {
    expect(dedupeRestaurantListings([], new Map())).toEqual([])
  })
})
