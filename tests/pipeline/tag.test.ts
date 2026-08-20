import { describe, it, expect } from 'vitest'
import { assignTags, TAGS } from '../../src/pipeline/tag.js'
import type { CafeAttributes } from '../../src/schema.js'

const base: CafeAttributes = {
  scale: '대형', seatsEstimate: 200, floors: 2,
  hasBakery: false, breadBakedOnsite: false, menuLevel: 1,
  mealTypes: [], viewStrength: 0, viewTypes: [], outdoorSeating: false,
  parkingGrade: 'A', parkingEvidence: '', photoSpot: 2, teenAppeal: 2,
  confidence: 0.9, evidence: 'e',
  extractedAt: '2026-08-20T00:00:00.000Z', modelVersion: 'v',
}

describe('assignTags', () => {
  it('태그는 8종으로 고정이다', () => {
    expect(TAGS).toHaveLength(8)
  })

  it('대형이면 대형카페 태그를 준다', () => {
    expect(assignTags(base)).toContain('대형카페')
  })

  it('대형 + 베이커리면 두 태그를 다 준다', () => {
    const t = assignTags({ ...base, hasBakery: true })
    expect(t).toContain('대형카페')
    expect(t).toContain('대형베이커리')
  })

  it('menuLevel 3 이면 브런치카페 태그를 준다', () => {
    expect(assignTags({ ...base, menuLevel: 3 })).toContain('브런치카페')
    expect(assignTags({ ...base, menuLevel: 2 })).not.toContain('브런치카페')
  })

  it('viewStrength 3 이상이면 뷰맛집이다', () => {
    expect(assignTags({ ...base, viewStrength: 3 })).toContain('뷰맛집')
    expect(assignTags({ ...base, viewStrength: 2 })).not.toContain('뷰맛집')
  })

  it('도심 뷰만 있으면 임계가 1 올라간다', () => {
    // 실측: 종로구 리제로가 뷰 언급 0 인데 viewStrength 3 · viewTypes ["도심"] 을
    // 받아 뷰맛집이 되었다. 창밖에 건물이 보이는 것은 뷰가 아니다.
    const city = { ...base, viewTypes: ['도심'] }
    expect(assignTags({ ...city, viewStrength: 3 })).not.toContain('뷰맛집')
    // 남산·한강 스카이라인처럼 진짜 도심 뷰는 후기가 압도적으로 쓴다
    expect(assignTags({ ...city, viewStrength: 4 })).toContain('뷰맛집')
  })

  it('도심에 다른 뷰가 하나라도 섞이면 임계는 그대로다', () => {
    const t = assignTags({ ...base, viewStrength: 3, viewTypes: ['도심', '산'] })
    expect(t).toContain('뷰맛집')
  })

  it('뷰 종류가 비어 있으면 임계를 올리지 않는다', () => {
    // 종류를 못 적었을 뿐 강도는 답한 경우를 벌하지 않는다
    expect(assignTags({ ...base, viewStrength: 3, viewTypes: [] })).toContain('뷰맛집')
  })

  it('소형은 뷰맛집 임계가 4로 올라간다', () => {
    // "작을수록 더 압도적이어야 통과" (스펙 7.5)
    const small = { ...base, scale: '소형' as const, seatsEstimate: 25 }
    expect(assignTags({ ...small, viewStrength: 3 })).not.toContain('뷰맛집')
    expect(assignTags({ ...small, viewStrength: 4 })).toContain('뷰맛집')
  })

  it('좌석 60석 미만이면 scale 과 무관하게 소형 규칙을 적용한다', () => {
    expect(assignTags({ ...base, seatsEstimate: 40, viewStrength: 3 })).not.toContain('뷰맛집')
  })

  it('소형은 대형카페 태그를 받지 못한다', () => {
    expect(assignTags({ ...base, seatsEstimate: 30 })).not.toContain('대형카페')
  })

  it('정원·창고형·전시·디저트 태그를 붙인다', () => {
    expect(assignTags({ ...base, outdoorSeating: true, viewTypes: ['정원'] }))
      .toContain('정원마당형')
    expect(assignTags({ ...base, viewTypes: ['창고형'] })).toContain('창고형')
    expect(assignTags({ ...base, viewTypes: ['전시'] })).toContain('전시복합문화')
    expect(assignTags({ ...base, mealTypes: ['케이크'] })).toContain('디저트특화')
  })

  it('정원 태그는 야외석을 요구한다', () => {
    expect(assignTags({ ...base, outdoorSeating: false, viewTypes: ['정원'] }))
      .not.toContain('정원마당형')
  })

  it('evidence 문장에서도 단서를 찾는다', () => {
    expect(assignTags({ ...base, evidence: '폐공장을 리모델링한 높은 층고' }))
      .toContain('창고형')
  })

  it('아무 조건도 못 맞추면 빈 배열이다 — 이것이 동네 카페다', () => {
    expect(assignTags({ ...base, scale: '중형', seatsEstimate: 50 })).toEqual([])
  })

  it('중복 없이 돌려준다', () => {
    const t = assignTags({ ...base, viewTypes: ['정원', '정원'], outdoorSeating: true })
    expect(new Set(t).size).toBe(t.length)
  })

  it('seatsEstimate 가 없으면 scale 로 추정한다', () => {
    expect(assignTags({ ...base, seatsEstimate: null })).toContain('대형카페')
    expect(assignTags({ ...base, scale: '소형', seatsEstimate: null, viewStrength: 3 }))
      .not.toContain('뷰맛집')
  })
})
