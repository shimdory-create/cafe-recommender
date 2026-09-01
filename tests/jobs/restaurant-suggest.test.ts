import { describe, it, expect } from 'vitest'
import { runRestaurantWeeklySuggest } from '../../src/jobs/restaurant-suggest.js'

describe('runRestaurantWeeklySuggest', () => {
  it('게이트를 통과한 active 식당을 점수순으로 뽑는다', async () => {
    const now = new Date('2026-09-01')
    const restaurants = [{
      kakaoPlaceId: '1', name: '소문난식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      driveMinutes: 20, firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, tags: ['한식'],
      attributes: {
        cuisineType: '한식' as const, evidence: 'e', parkingGrade: 'A' as const,
        parkingEvidence: 'p', hasRoom: true, reservable: true, viewStrength: 0,
        viewTypes: [], outdoorSeating: null, teenAppeal: 3, confidence: 0.8,
        extractedAt: '2026-08-01T00:00:00.000Z', modelVersion: 'test',
      },
    }]
    const buzz = [{
      kakaoPlaceId: '1', capturedAt: '2026-08-30', receivedCount: 10, relevantCount: 8,
      precision: 0.8, spanDays: 20, postsPer30: 15, posts30d: 8, postsPrev: 4,
      firstPostDate: '2026-08-01', latestPostDate: '2026-08-30', acceleration: 1.5,
      suspectAmbiguous: false,
    }]
    const deps = {
      store: {
        readRestaurants: async () => restaurants,
        readRestaurantBuzz: async () => buzz,
        readVisits: async () => [],
        readRestaurantSuggestions: async () => [],
        writeRestaurantSuggestions: async () => {},
      },
      now,
    }
    const { picked } = await runRestaurantWeeklySuggest(deps as never)
    expect(picked).toHaveLength(1)
    expect(picked[0]!.kakaoPlaceId).toBe('1')
  })

  it('야외석이 있어도 계절(달)에 따라 점수가 바뀌지 않는다 (Fix 4 회귀)', async () => {
    // 카페는 menuLevel === 1(실내 식사 불가) 일 때만 야외석에 계절 배수를 준다.
    // 식당은 그 신호가 없으므로 restaurant-suggest.ts 는 outdoorOnly 를 늘
    // false 로 넘겨야 한다 — 그러지 않으면 야외석이 있는 식당이 혹서기/혹한기에
    // 0.5배, 그 외 시기에 1.2배로 요동친다.
    const restaurants = [{
      kakaoPlaceId: '1', name: '테라스식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      driveMinutes: 20, firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, tags: ['한식'],
      attributes: {
        cuisineType: '한식' as const, evidence: 'e', parkingGrade: 'A' as const,
        parkingEvidence: 'p', hasRoom: false, reservable: false, viewStrength: 0,
        viewTypes: [], outdoorSeating: true, teenAppeal: 3, confidence: 0.8,
        extractedAt: '2026-08-01T00:00:00.000Z', modelVersion: 'test',
      },
    }]
    const buzz = [{
      kakaoPlaceId: '1', capturedAt: '2026-08-30', receivedCount: 10, relevantCount: 8,
      precision: 0.8, spanDays: 20, postsPer30: 15, posts30d: 8, postsPrev: 4,
      firstPostDate: '2026-08-01', latestPostDate: '2026-08-30', acceleration: 1.5,
      suspectAmbiguous: false,
    }]
    const makeDeps = (now: Date) => ({
      store: {
        readRestaurants: async () => restaurants,
        readRestaurantBuzz: async () => buzz,
        readRestaurantSuggestions: async () => [],
        writeRestaurantSuggestions: async () => {},
      },
      now,
    })

    // 혹서기(8월, harsh) vs 평시(4월) — 계절 배수가 살아있었다면 서로 다른 점수가 나온다
    const harsh = await runRestaurantWeeklySuggest(makeDeps(new Date('2026-08-15')) as never)
    const normal = await runRestaurantWeeklySuggest(makeDeps(new Date('2026-04-15')) as never)
    expect(harsh.picked[0]!.finalScore).toBe(normal.picked[0]!.finalScore)
    const harshReason = harsh.picked[0]!.reason as { fit: number }
    const normalReason = normal.picked[0]!.reason as { fit: number }
    expect(harshReason.fit).toBe(normalReason.fit)
  })

  it('음식종류를 모르면(cuisineType null) 화제량이 좋아도 후보에서 빠진다 (Fix 1 회귀)', async () => {
    const restaurants = [{
      kakaoPlaceId: '2', name: '미분류식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      driveMinutes: 10, firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, tags: [], // cuisineType null -> assignRestaurantTags 가 [] 를 만든다
      attributes: {
        cuisineType: null, evidence: 'e', parkingGrade: 'A' as const,
        parkingEvidence: 'p', hasRoom: true, reservable: true, viewStrength: 0,
        viewTypes: [], outdoorSeating: null, teenAppeal: 5, confidence: 0.9,
        extractedAt: '2026-08-01T00:00:00.000Z', modelVersion: 'test',
      },
    }]
    const buzz = [{
      kakaoPlaceId: '2', capturedAt: '2026-08-30', receivedCount: 100, relevantCount: 95,
      precision: 0.95, spanDays: 20, postsPer30: 200, posts30d: 100, postsPrev: 20,
      firstPostDate: '2026-01-01', latestPostDate: '2026-08-30', acceleration: 5,
      suspectAmbiguous: false,
    }]
    const deps = {
      store: {
        readRestaurants: async () => restaurants,
        readRestaurantBuzz: async () => buzz,
        readRestaurantSuggestions: async () => [],
        writeRestaurantSuggestions: async () => {},
      },
      now: new Date('2026-09-01'),
    }
    const { picked } = await runRestaurantWeeklySuggest(deps as never)
    expect(picked).toHaveLength(0)
  })
})
