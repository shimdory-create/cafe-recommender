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

  it('10대 적합도가 평균(2.5)보다 높으면 다른 요인과 무관하게 실제로 오른다', () => {
    const now = new Date('2026-09-01')
    // teenAppeal 외 조건을 고정하면 비율이 곧 teen 가중치 자체의 비율이다.
    // 예전 공식(0.85~1.0, 상한이 곧 무보너스 지점)은 이 비율이 1.1을 못 넘었다.
    const ratio = restaurantFamilyFit({ ...base, teenAppeal: 5 }, now)
      / restaurantFamilyFit({ ...base, teenAppeal: 2.5 }, now)
    expect(ratio).toBeGreaterThan(1.1)
  })
})
