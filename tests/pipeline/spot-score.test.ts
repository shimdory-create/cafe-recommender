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

  it('teenAppeal이 평균(2.5)보다 높으면 기준점보다 점수가 오른다', () => {
    const now = new Date('2026-09-02')
    const highTeen = spotFamilyFit({ ...base, hasKidsTag: false, teenAppeal: 5 }, now)
    const neutral = spotFamilyFit({ ...base, hasKidsTag: false, teenAppeal: 2.5 }, now)
    expect(highTeen).toBeGreaterThan(neutral)
  })

  it('teenAppeal이 평균보다 낮으면 기준점보다 점수가 낮아진다', () => {
    const now = new Date('2026-09-02')
    const lowTeen = spotFamilyFit({ ...base, hasKidsTag: false, teenAppeal: 0 }, now)
    const neutral = spotFamilyFit({ ...base, hasKidsTag: false, teenAppeal: 2.5 }, now)
    expect(lowTeen).toBeLessThan(neutral)
  })

  it('아이 태그 보너스와 최고 teenAppeal 보너스가 비슷한 크기다 (한쪽만 유리하지 않게)', () => {
    const now = new Date('2026-09-02')
    const kidsBoost = spotFamilyFit({ ...base, hasKidsTag: true, teenAppeal: 2.5 }, now)
      / spotFamilyFit({ ...base, hasKidsTag: false, teenAppeal: 2.5 }, now)
    const teenBoost = spotFamilyFit({ ...base, hasKidsTag: false, teenAppeal: 5 }, now)
      / spotFamilyFit({ ...base, hasKidsTag: false, teenAppeal: 2.5 }, now)
    expect(Math.abs(kidsBoost - teenBoost)).toBeLessThan(0.06)
  })
})
