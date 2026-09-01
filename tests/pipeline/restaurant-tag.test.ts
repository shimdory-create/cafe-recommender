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

  it('음식종류를 몰라도 룸·예약 같은 편의 태그만으로 게이트를 통과시키지 않는다', () => {
    // 회귀 테스트: cuisineType 이 null 이면 hasRoom/reservable 이 true 여도
    // 태그가 비어야 한다 (Fix 1 — 게이트 누수).
    const withRoom = assignRestaurantTags({ ...base, cuisineType: null, hasRoom: true })
    expect(withRoom).toEqual([])
    expect(passesHardGate({ tags: withRoom, parkingGrade: 'A' }).pass).toBe(false)

    const withReservable = assignRestaurantTags({ ...base, cuisineType: null, reservable: true })
    expect(withReservable).toEqual([])
    expect(passesHardGate({ tags: withReservable, parkingGrade: 'A' }).pass).toBe(false)
  })
})
