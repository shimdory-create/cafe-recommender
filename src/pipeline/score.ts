const DAY = 86_400_000
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export interface HotInput {
  precision: number
  postsPer30: number
  acceleration: number
  latestPostDate: string | null
  firstPostDate: string | null
}

/**
 * 스펙 v3 8.1. precision 을 전체에 곱하는 것이 핵심 변경이다.
 *
 * 컷으로만 쓰면 경계선 바로 위의 오염된 카페가 만점을 받는다. 승수로
 * 쓰면 검색으로 식별되지 않는 카페는 다른 지표가 좋아도 내려간다.
 * 실존 카페의 정밀도 상한이 약 0.8 이라 일괄 축소되지만 상대 순위는
 * 보존된다.
 */
export function hotScore(m: HotInput, now: Date): number {
  const t = now.getTime()
  const daysSince = m.latestPostDate ? (t - new Date(m.latestPostDate).getTime()) / DAY : 999
  const ageDays = m.firstPostDate ? (t - new Date(m.firstPostDate).getTime()) / DAY : 9999

  const accel = clamp(Math.log2(Math.max(m.acceleration, 0.01)) / 2, 0, 1)
  // 월 200건이면 1.0
  const volume = clamp(Math.log10(Math.max(m.postsPer30, 0) + 1) / 2.3, 0, 1)
  const freshness = 1 / (1 + Math.max(daysSince, 0) / 30)
  const novelty = ageDays <= 180 ? 1 : ageDays <= 365 ? 0.5 : 0

  const raw = 0.45 * accel + 0.30 * volume + 0.15 * freshness + 0.10 * novelty
  return clamp(100 * clamp(m.precision, 0, 1) * raw, 0, 100)
}

export interface FitInput {
  driveMinutes: number
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  menuLevel: number
  lastVisitedOn: string | null
  outdoorOnly: boolean
  teenAppeal: number
}

const PARKING_MULT: Record<FitInput['parkingGrade'], number> = {
  A: 1.0,
  B: 0.85,
  C: 0.4,
  D: 0,
  '?': 0.7,
}

/**
 * 스펙 8.2. 취향 학습(taste_mult)은 v2 에서 제거했다 — 평점 입력이 없다.
 */
export function familyFit(i: FitInput, now: Date): number {
  const distance = Math.exp(-Math.max(i.driveMinutes, 0) / 70) // 70분에서 약 0.37
  const parking = PARKING_MULT[i.parkingGrade]
  const menu = i.menuLevel >= 3 ? 1.0 : i.menuLevel === 2 ? 0.95 : 0.75

  let unvisited = 1.0
  if (i.lastVisitedOn) {
    const days = (now.getTime() - new Date(i.lastVisitedOn).getTime()) / DAY
    // 0 으로 두지 않는 이유는 "거기 또 가고 싶다"를 허용하기 위함이다.
    unvisited = days <= 180 ? 0.15 : days <= 365 ? 0.5 : 0.8
  }

  const month = now.getUTCMonth() + 1
  const harsh = (month >= 7 && month <= 8) || month === 12 || month <= 2
  const season = i.outdoorOnly ? (harsh ? 0.5 : 1.2) : 1.0

  const teen = 0.85 + 0.03 * clamp(i.teenAppeal, 0, 5)

  return distance * parking * menu * unvisited * season * teen
}

export const finalScore = (hot: number, fit: number) => hot * fit

export interface Scored {
  id: string
  score: number
  tags: string[]
}

/**
 * 주말 후보 선정. 태그 다양성 제약: 상위 3곳이 전부 "정원·마당형"이면
 * 리스트의 의미가 없으므로 새 태그를 가진 후보를 우선한다 (스펙 8.4).
 * 다양성을 만들 수 없으면 점수 순으로 채운다.
 */
export function pickWeekendCandidates<T extends Scored>(all: T[], n = 3): T[] {
  const sorted = [...all].sort((a, b) => b.score - a.score)
  const picked: T[] = []
  const used = new Set<string>()

  for (const c of sorted) {
    if (picked.length >= n) break
    const fresh = c.tags.some((t) => !used.has(t))
    if (picked.length > 0 && !fresh) continue
    picked.push(c)
    c.tags.forEach((t) => used.add(t))
  }
  // 다양성 제약으로 자리가 남으면 점수 순으로 채운다
  for (const c of sorted) {
    if (picked.length >= n) break
    if (!picked.includes(c)) picked.push(c)
  }
  return picked.slice(0, n)
}
