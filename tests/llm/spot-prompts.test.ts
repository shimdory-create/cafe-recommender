import { describe, it, expect } from 'vitest'
import { buildSpotExtractPrompt } from '../../src/llm/prompts.js'

describe('buildSpotExtractPrompt', () => {
  it('장소 이름과 태그 규칙을 포함한다', () => {
    const p = buildSpotExtractPrompt({
      name: '아무개공원', sigungu: '부평구', categoryName: '여가시설 > 공원',
      snippets: ['아이들이랑 산책하기 좋았어요'], parkingSnippets: [],
    })
    expect(p).toContain('아무개공원')
    expect(p).toContain('tags')
    expect(p).toContain('자연/공원')
  })
})
