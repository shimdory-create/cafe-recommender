import { PARKING_MULT } from './score.js'

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export interface RestaurantFitInput {
  driveMinutes: number
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  hasRoom: boolean | null
  reservable: boolean | null
  lastVisitedOn: string | null
  outdoorOnly: boolean
  teenAppeal: number
}

/**
 * 카페의 menuLevel(식사 가능 여부) 자리를 룸·예약 보너스로 바꿨다 — 식당은
 * 전부 식사가 되므로 그 축이 의미가 없다는 판단 (가족 요청, 설계 문서 2절).
 */
export function restaurantFamilyFit(i: RestaurantFitInput, now: Date): number {
  const distance = Math.exp(-Math.max(i.driveMinutes, 0) / 70)
  const parking = PARKING_MULT[i.parkingGrade]
  // 둘 다 있으면 더 후하게 — 부모님 모시고 가면서 안 기다리는 게 이상적
  const roomBonus = i.hasRoom ? 1.15 : 1.0
  const reserveBonus = i.reservable ? 1.15 : 1.0

  // 다녀온 곳은 추천에서 영구 제외다(2026-09-25 개정) — score.ts 참고
  const unvisited = i.lastVisitedOn ? 0 : 1.0

  const month = now.getUTCMonth() + 1
  const harsh = (month >= 7 && month <= 8) || month === 12 || month <= 2
  const season = i.outdoorOnly ? (harsh ? 0.5 : 1.2) : 1.0

  // 중간값(2.5) 기준 대칭 이동 — teenAppeal 이 높은 곳도 실제로 순위가
  // 오르게 한다. 예전 0.85~1.0 공식은 상한이 곧 "보너스 없음" 지점이라
  // 10대 취향이 아무리 높아도 절대 못 올라갔다(spot-score.ts 참고).
  const teen = 1.0 + 0.06 * (clamp(i.teenAppeal, 0, 5) - 2.5)

  return distance * parking * roomBonus * reserveBonus * unvisited * season * teen
}
