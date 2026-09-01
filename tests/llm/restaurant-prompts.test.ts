import { describe, it, expect } from 'vitest'
import { buildRestaurantExtractPrompt } from '../../src/llm/prompts.js'

describe('buildRestaurantExtractPrompt', () => {
  it('식당 이름과 음식종류 규칙을 포함한다', () => {
    const p = buildRestaurantExtractPrompt({
      name: '소문난식당', sigungu: '부평구', categoryName: '음식점 > 한식',
      snippets: ['맛있었어요'], parkingSnippets: [],
    })
    expect(p).toContain('소문난식당')
    expect(p).toContain('cuisineType')
    expect(p).toContain('한식')
  })
})
