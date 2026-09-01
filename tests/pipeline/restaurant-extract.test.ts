import { describe, it, expect } from 'vitest'
import { extractRestaurantAttributes } from '../../src/pipeline/restaurant-extract.js'

const fakeLlm = {
  modelVersion: 'fake-1',
  extract: async () => ({
    cuisineType: '한식', evidence: 'e', parkingGrade: 'A' as const, parkingEvidence: 'p',
    hasRoom: true, reservable: false, viewStrength: 0, viewTypes: [],
    outdoorSeating: null, teenAppeal: 3, confidence: 0.8,
  }),
}

describe('extractRestaurantAttributes', () => {
  it('LLM 응답에 extractedAt·modelVersion 을 붙인다', async () => {
    const now = new Date('2026-09-01T00:00:00.000Z')
    const a = await extractRestaurantAttributes(
      { llm: fakeLlm as never, now },
      { name: '소문난식당', sigungu: '부평구', categoryName: '', snippets: [], parkingSnippets: [] },
    )
    expect(a.extractedAt).toBe('2026-09-01T00:00:00.000Z')
    expect(a.modelVersion).toContain('fake-1')
    expect(a.cuisineType).toBe('한식')
  })
})
