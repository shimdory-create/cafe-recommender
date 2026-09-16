import { describe, it, expect } from 'vitest'
import {
  SpotSchema, SpotAttributesSchema, SPOT_TAGS, SiteSpotSchema, SpotSitePayloadSchema,
} from '../src/spot-schema.js'

describe('SPOT_TAGS', () => {
  it('10개다', () => {
    expect(SPOT_TAGS).toHaveLength(10)
  })
})

describe('SpotAttributesSchema', () => {
  const base = {
    tags: ['자연/공원'], evidence: 'e', parkingGrade: 'A', parkingEvidence: 'p',
    stayDuration: null, indoorOutdoor: null, season: null, teenAppeal: null,
    confidence: 0.5, extractedAt: '2026-09-02T00:00:00.000Z', modelVersion: 'test',
  }

  it('정해진 태그만 받는다', () => {
    expect(SpotAttributesSchema.safeParse(base).success).toBe(true)
    expect(SpotAttributesSchema.safeParse({ ...base, tags: ['아무거나'] }).success).toBe(false)
  })

  it('태그를 여러 개 동시에 가질 수 있다', () => {
    const multi = { ...base, tags: ['자연/공원', '아이와 가기 좋은 곳'] }
    expect(SpotAttributesSchema.safeParse(multi).success).toBe(true)
  })

  it('태그를 하나도 못 찾으면 빈 배열이다', () => {
    expect(SpotAttributesSchema.safeParse({ ...base, tags: [] }).success).toBe(true)
  })
})

describe('SpotSchema', () => {
  it('신규 발굴 최소 필드로 파싱된다', () => {
    const s = {
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'pending_extraction',
      ambiguousName: false, tags: [],
    }
    expect(SpotSchema.safeParse(s).success).toBe(true)
  })
})

describe('SiteSpotSchema (2단계 웹 표시용)', () => {
  it('가볼 곳 표시용 필드를 검증한다', () => {
    const row = {
      id: '1', name: '아무개공원', sigungu: '부평구', zone: 'near', area: '인천',
      driveMinutes: 20, lat: 37.5, lng: 127.0, tags: ['자연/공원', '아이와 가기 좋은 곳'],
      parkingGrade: 'A', evidence: '넓고 좋다', parkingEvidence: '주차장 넓음',
      stayDuration: '1~2시간', indoorOutdoor: 'outdoor', season: null, teenAppeal: null,
      naverMapUrl: 'https://map.naver.com/p/search/x', kakaoPlaceUrl: null, imageUrl: null,
      hotScore: 5, finalScore: 3, postsPer30: 5, posts30: 3, posts90: 8,
      acceleration: 1, trend: 'steady', ratingAvg: 0, ratingCount: 0,
      familyReviews: [], cityOnly: false, visitedOn: null,
      firstSeenAt: '2026-08-01T00:00:00.000Z', isNew: true, lastSeenAt: null,
    }
    expect(() => SiteSpotSchema.parse(row)).not.toThrow()
  })

  it('SpotSitePayloadSchema가 week/stats 구조를 검증한다', () => {
    const payload = {
      generatedAt: '2026-09-02T00:00:00.000Z', weekOf: '2026-08-31',
      week: [{ rank: 1, id: '1', finalScore: 3 }],
      spots: [], visited: [],
      stats: {
        discovered: 0, passed: 0, regions: 0, scannedRegions: 0,
        driveMeasured: 0, revisitDays: 180, cityOnly: 0, staleDays: 21,
      },
    }
    expect(() => SpotSitePayloadSchema.parse(payload)).not.toThrow()
  })
})
