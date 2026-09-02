import { describe, it, expect } from 'vitest'
import { SpotSchema, SpotAttributesSchema, SPOT_TAGS } from '../src/spot-schema.js'

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
