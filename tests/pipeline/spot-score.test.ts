import { describe, it, expect } from 'vitest'
import { spotFamilyFit } from '../../src/pipeline/spot-score.js'

const base = {
  driveMinutes: 30, parkingGrade: 'A' as const, hasKidsTag: false,
  lastVisitedOn: null, outdoorOnly: false, teenAppeal: 2,
}

describe('spotFamilyFit', () => {
  it('"아이와 가기 좋은 곳" 태그가 있으면 점수가 오른다', () => {
    const now = new Date('2026-09-02')
    const withKids = spotFamilyFit({ ...base, hasKidsTag: true }, now)
    const without = spotFamilyFit(base, now)
    expect(withKids).toBeGreaterThan(without)
  })

  it('주차 D 는 0점 — 카페·식당과 같은 규칙', () => {
    const now = new Date('2026-09-02')
    expect(spotFamilyFit({ ...base, parkingGrade: 'D' }, now)).toBe(0)
  })

  it('실외 전용은 혹서기에 점수가 깎인다', () => {
    const summer = new Date('2026-08-01')
    const outdoor = spotFamilyFit({ ...base, outdoorOnly: true }, summer)
    const indoor = spotFamilyFit({ ...base, outdoorOnly: false }, summer)
    expect(outdoor).toBeLessThan(indoor)
  })
})
