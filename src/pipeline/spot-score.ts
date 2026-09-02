import { PARKING_MULT } from './score.js'

const DAY = 86_400_000
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export interface SpotFitInput {
  driveMinutes: number
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  /** "아이와 가기 좋은 곳" 태그 보유 여부 — 식당의 hasRoom/reservable 자리 */
  hasKidsTag: boolean
  lastVisitedOn: string | null
  outdoorOnly: boolean
  teenAppeal: number
}

/**
 * 식당의 hasRoom/reservable 보너스 자리를 "아이와 가기 좋은 곳" 태그
 * 보유 여부로 바꿨다 (설계 문서 3절 — 가족적합도 보너스는 주차+이동시간+
 * 이 태그).
 */
export function spotFamilyFit(i: SpotFitInput, now: Date): number {
  const distance = Math.exp(-Math.max(i.driveMinutes, 0) / 70)
  const parking = PARKING_MULT[i.parkingGrade]
  const kidsBonus = i.hasKidsTag ? 1.2 : 1.0

  let unvisited = 1.0
  if (i.lastVisitedOn) {
    const days = (now.getTime() - new Date(i.lastVisitedOn).getTime()) / DAY
    unvisited = days <= 180 ? 0.15 : days <= 365 ? 0.5 : 0.8
  }

  const month = now.getUTCMonth() + 1
  const harsh = (month >= 7 && month <= 8) || month === 12 || month <= 2
  const season = i.outdoorOnly ? (harsh ? 0.5 : 1.2) : 1.0

  const teen = 0.85 + 0.03 * clamp(i.teenAppeal, 0, 5)

  return distance * parking * kidsBonus * unvisited * season * teen
}
