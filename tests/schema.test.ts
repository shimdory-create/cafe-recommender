import { describe, it, expect } from 'vitest'
import { CafeSchema, CafeAttributesSchema } from '../src/schema.js'

const minimalCafe = {
  kakaoPlaceId: '12345',
  name: '테라로사 서종점',
  sigungu: '양평군',
  lat: 37.5,
  lng: 127.4,
  firstSeenAt: '2026-08-20T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  attributes: null,
  tags: [],
}

describe('CafeSchema', () => {
  it('최소 필드를 통과시킨다', () => {
    expect(CafeSchema.parse(minimalCafe).name).toBe('테라로사 서종점')
  })

  it('kakaoPlaceId 가 없으면 거부한다', () => {
    const { kakaoPlaceId: _o, ...rest } = minimalCafe
    expect(CafeSchema.safeParse(rest).success).toBe(false)
  })

  it('알 수 없는 status 를 거부한다', () => {
    expect(CafeSchema.safeParse({ ...minimalCafe, status: 'weird' }).success).toBe(false)
  })

  it('ambiguousName 과 tags 는 없으면 기본값이 채워진다', () => {
    const { ambiguousName: _a, tags: _t, ...rest } = minimalCafe
    const parsed = CafeSchema.parse(rest)
    expect(parsed.ambiguousName).toBe(false)
    expect(parsed.tags).toEqual([])
  })
})

describe('CafeAttributesSchema', () => {
  const attrs = {
    scale: '대형',
    seatsEstimate: 200,
    floors: 2,
    hasBakery: true,
    breadBakedOnsite: true,
    menuLevel: 3,
    mealTypes: ['파스타'],
    viewStrength: 3,
    viewTypes: ['강'],
    outdoorSeating: true,
    parkingGrade: 'A',
    parkingEvidence: '전용 주차장 50대',
    photoSpot: 4,
    teenAppeal: 3,
    confidence: 0.82,
    evidence: '2층 통창에 좌석 200석',
    extractedAt: '2026-08-20T00:00:00.000Z',
    modelVersion: 'gemini-3.1-flash-lite',
  }

  it('정상 속성을 통과시킨다', () => {
    expect(CafeAttributesSchema.parse(attrs).scale).toBe('대형')
  })

  it('evidence 가 빈 문자열이면 거부한다', () => {
    // 인용 없는 LLM 출력이 저장되는 것을 스키마 수준에서 막는다 (스펙 Layer 3)
    expect(CafeAttributesSchema.safeParse({ ...attrs, evidence: '' }).success).toBe(false)
  })

  it('evidence 가 아예 없으면 거부한다', () => {
    const { evidence: _e, ...rest } = attrs
    expect(CafeAttributesSchema.safeParse(rest).success).toBe(false)
  })

  it('modelVersion 이 없으면 거부한다', () => {
    // 프롬프트 개선 시 재처리 대상을 식별할 수 없게 된다
    const { modelVersion: _m, ...rest } = attrs
    expect(CafeAttributesSchema.safeParse(rest).success).toBe(false)
  })

  it('menuLevel 범위를 벗어나면 거부한다', () => {
    expect(CafeAttributesSchema.safeParse({ ...attrs, menuLevel: 4 }).success).toBe(false)
    expect(CafeAttributesSchema.safeParse({ ...attrs, menuLevel: 0 }).success).toBe(false)
  })

  it('parkingGrade 는 A~D 와 ? 만 허용한다', () => {
    expect(CafeAttributesSchema.safeParse({ ...attrs, parkingGrade: 'E' }).success).toBe(false)
    expect(CafeAttributesSchema.safeParse({ ...attrs, parkingGrade: '?' }).success).toBe(true)
  })

  it('viewStrength 는 0~5 범위다', () => {
    expect(CafeAttributesSchema.safeParse({ ...attrs, viewStrength: 6 }).success).toBe(false)
    expect(CafeAttributesSchema.safeParse({ ...attrs, viewStrength: 0 }).success).toBe(true)
  })

  it('알 수 없는 scale 을 거부한다', () => {
    expect(CafeAttributesSchema.safeParse({ ...attrs, scale: '초대형' }).success).toBe(false)
  })
})
