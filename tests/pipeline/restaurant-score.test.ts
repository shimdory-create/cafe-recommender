import { describe, it, expect } from 'vitest'
import { restaurantFamilyFit } from '../../src/pipeline/restaurant-score.js'

const base = {
  driveMinutes: 30, parkingGrade: 'A' as const, hasRoom: false, reservable: false,
  lastVisitedOn: null, outdoorOnly: false, teenAppeal: 2,
}

describe('restaurantFamilyFit', () => {
  it('룸이 있으면 점수가 오른다', () => {
    const now = new Date('2026-09-01')
    const withRoom = restaurantFamilyFit({ ...base, hasRoom: true }, now)
    const without = restaurantFamilyFit(base, now)
    expect(withRoom).toBeGreaterThan(without)
  })

  it('예약 가능하면 점수가 오른다', () => {
    const now = new Date('2026-09-01')
    const reservable = restaurantFamilyFit({ ...base, reservable: true }, now)
    const not = restaurantFamilyFit(base, now)
    expect(reservable).toBeGreaterThan(not)
  })

  it('주차 D 는 0점 — 카페와 같은 규칙', () => {
    const now = new Date('2026-09-01')
    expect(restaurantFamilyFit({ ...base, parkingGrade: 'D' }, now)).toBe(0)
  })
})
