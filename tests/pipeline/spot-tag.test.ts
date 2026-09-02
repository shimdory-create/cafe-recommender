import { describe, it, expect } from 'vitest'
import { assignSpotTags } from '../../src/pipeline/spot-tag.js'
import { passesHardGate } from '../../src/pipeline/gate.js'
import type { SpotAttributes } from '../../src/spot-schema.js'

const base: SpotAttributes = {
  tags: ['자연/공원'], evidence: 'e', parkingGrade: 'A', parkingEvidence: 'p',
  stayDuration: null, indoorOutdoor: null, season: null, teenAppeal: null,
  confidence: 0.5, extractedAt: '2026-09-02T00:00:00.000Z', modelVersion: 'test',
}

describe('assignSpotTags', () => {
  it('추출된 태그를 그대로 낸다', () => {
    expect(assignSpotTags(base)).toEqual(['자연/공원'])
  })

  it('여러 태그를 동시에 가질 수 있다 (다중 선택)', () => {
    const multi = { ...base, tags: ['자연/공원', '아이와 가기 좋은 곳'] }
    const tags = assignSpotTags(multi as SpotAttributes)
    expect(tags).toContain('자연/공원')
    expect(tags).toContain('아이와 가기 좋은 곳')
    expect(tags).toHaveLength(2)
  })

  it('태그를 하나도 못 고르면 빈 배열이고, 그러면 기존 게이트가 배제한다', () => {
    const tags = assignSpotTags({ ...base, tags: [] })
    expect(tags).toEqual([])
    expect(passesHardGate({ tags, parkingGrade: 'A' }).pass).toBe(false)
  })
})
