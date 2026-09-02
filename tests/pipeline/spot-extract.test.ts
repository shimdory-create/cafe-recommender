import { describe, it, expect } from 'vitest'
import { extractSpotAttributes } from '../../src/pipeline/spot-extract.js'

const fakeLlm = {
  modelVersion: 'fake-1',
  extract: async () => ({
    tags: ['자연/공원'], evidence: 'e', parkingGrade: 'A' as const, parkingEvidence: 'p',
    stayDuration: '1~2시간', indoorOutdoor: 'outdoor' as const, season: null,
    teenAppeal: 3, confidence: 0.8,
  }),
}

describe('extractSpotAttributes', () => {
  it('LLM 응답에 extractedAt·modelVersion 을 붙인다', async () => {
    const now = new Date('2026-09-02T00:00:00.000Z')
    const a = await extractSpotAttributes(
      { llm: fakeLlm as never, now },
      { name: '아무개공원', sigungu: '부평구', categoryName: '', snippets: [], parkingSnippets: [] },
    )
    expect(a.extractedAt).toBe('2026-09-02T00:00:00.000Z')
    expect(a.modelVersion).toContain('fake-1')
    expect(a.tags).toEqual(['자연/공원'])
  })
})
