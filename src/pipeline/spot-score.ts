import { PARKING_MULT } from './score.js'

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
 *
 * kidsBonus 와 teen 보너스는 크기를 맞췄다 — 예전엔 "아이와 가기 좋은 곳"
 * 태그가 있으면 항상 +20%인데 teenAppeal 은 0~5점이 0.85~1.0배로만
 * 움직여서, 중고생 자녀 기준으로는 점수를 절대 못 올리고 깎이기만
 * 했다(집안 자녀가 중고생인데 이 비대칭이 실제로 체감됨). 이제 teenAppeal
 * 은 중간값(2.5) 기준 위아래로 대칭 이동해 중고생 취향 스팟도 실제로
 * 순위가 오를 수 있다.
 */
export function spotFamilyFit(i: SpotFitInput, now: Date): number {
  const distance = Math.exp(-Math.max(i.driveMinutes, 0) / 70)
  const parking = PARKING_MULT[i.parkingGrade]
  const kidsBonus = i.hasKidsTag ? 1.1 : 1.0

  // 다녀온 곳은 추천에서 영구 제외다(2026-09-25 개정) — score.ts 참고
  const unvisited = i.lastVisitedOn ? 0 : 1.0

  const month = now.getUTCMonth() + 1
  const harsh = (month >= 7 && month <= 8) || month === 12 || month <= 2
  const season = i.outdoorOnly ? (harsh ? 0.5 : 1.2) : 1.0

  const teen = 1.0 + 0.06 * (clamp(i.teenAppeal, 0, 5) - 2.5)

  return distance * parking * kidsBonus * unvisited * season * teen
}
