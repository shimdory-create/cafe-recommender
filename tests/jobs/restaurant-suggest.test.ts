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
})
