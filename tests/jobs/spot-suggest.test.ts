import { describe, it, expect } from 'vitest'
import { runSpotWeeklySuggest } from '../../src/jobs/spot-suggest.js'

describe('runSpotWeeklySuggest', () => {
  it('게이트를 통과한 active 장소를 점수순으로 뽑는다', async () => {
    const now = new Date('2026-09-02')
    const spots = [{
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      driveMinutes: 20, firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, tags: ['자연/공원', '아이와 가기 좋은 곳'],
      attributes: {
        tags: ['자연/공원', '아이와 가기 좋은 곳'] as const, evidence: 'e',
        parkingGrade: 'A' as const, parkingEvidence: 'p', stayDuration: '1~2시간',
        indoorOutdoor: 'outdoor' as const, season: null, teenAppeal: 3, confidence: 0.8,
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
        readSpots: async () => spots,
        readSpotBuzz: async () => buzz,
        readVisits: async () => [],
        readSpotSuggestions: async () => [],
        writeSpotSuggestions: async () => {},
      },
      now,
    }
    const { picked } = await runSpotWeeklySuggest(deps as never)
    expect(picked).toHaveLength(1)
    expect(picked[0]!.kakaoPlaceId).toBe('1')
  })
})
