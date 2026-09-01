import { describe, it, expect } from 'vitest'
import { assignRestaurantTags } from '../../src/pipeline/restaurant-tag.js'
import { passesHardGate } from '../../src/pipeline/gate.js'
import type { RestaurantAttributes } from '../../src/restaurant-schema.js'

const base: RestaurantAttributes = {
  cuisineType: '한식', evidence: 'e', parkingGrade: 'A', parkingEvidence: 'p',
  hasRoom: null, reservable: null, viewStrength: 0, viewTypes: [],
  outdoorSeating: null, teenAppeal: null, confidence: 0.5,
  extractedAt: '2026-09-01T00:00:00.000Z', modelVersion: 'test',
}

describe('assignRestaurantTags', () => {
  it('음식 종류를 태그로 낸다', () => {
    expect(assignRestaurantTags(base)).toContain('한식')
  })

  it('룸이 있으면 룸 태그를 더한다', () => {
    expect(assignRestaurantTags({ ...base, hasRoom: true })).toContain('룸있음')
  })

  it('예약 가능이면 태그를 더한다', () => {
    expect(assignRestaurantTags({ ...base, reservable: true })).toContain('예약가능')
  })

  it('음식종류를 모르면 태그가 비고, 그러면 기존 게이트가 배제한다', () => {
    const tags = assignRestaurantTags({ ...base, cuisineType: null })
    expect(tags).toEqual([])
    expect(passesHardGate({ tags, parkingGrade: 'A' }).pass).toBe(false)
  })
})
