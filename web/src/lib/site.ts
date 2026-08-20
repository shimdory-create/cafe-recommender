import raw from '../generated/site.json'

/**
 * 표시용 페이로드 타입.
 *
 * **단일 진실 원천은 `src/schema.ts` 의 `SitePayloadSchema` 다.**
 * 생성기(`npm run site`)가 zod 로 검증한 뒤 JSON 을 쓰므로, 여기서 다시
 * 런타임 검증을 하지 않는다. 대신 아래 대입문이 **빌드 타임 드리프트
 * 검사** 역할을 한다 — 생성기가 필드를 바꾸면 타입 오류로 즉시 드러난다.
 */
export interface SiteCafe {
  id: string
  name: string
  sigungu: string
  driveMinutes: number | null
  scale: '대형' | '중형' | '소형' | null
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  menuLevel: number
  tags: string[]
  evidence: string
  parkingEvidence: string
  signatureMenu: string | null
  viewTypes: string[]
  mealTypes: string[]
  outdoorSeating: boolean | null
  teenAppeal: number | null
  stayDuration: string | null
  naverMapUrl: string
  kakaoPlaceUrl: string | null
  hotScore: number
  postsPer30: number
  acceleration: number
  cityOnly: boolean
  visitedOn: string | null
}

export interface SitePayload {
  generatedAt: string
  weekOf: string
  week: { rank: number; id: string; finalScore: number }[]
  cafes: SiteCafe[]
  stats: { discovered: number; passed: number; regions: number; cityOnly: number }
}

export const payload = raw as SitePayload

export const byId = (id: string): SiteCafe | undefined =>
  payload.cafes.find((c) => c.id === id)

/** 이번 주 추천 3곳. 추천 파일이 비었으면 화제도 상위로 대체한다 */
export function weekPicks(): SiteCafe[] {
  const picks = payload.week
    .map((w) => byId(w.id))
    .filter((c): c is SiteCafe => Boolean(c) && !c!.cityOnly)
  if (picks.length > 0) return picks
  // 우아한 저하 — 금요일 배치가 실패해도 빈 화면을 보여주지 않는다
  return payload.cafes.filter((c) => !c.cityOnly).slice(0, 3)
}

export const MENU_LABEL: Record<number, string> = {
  1: '음료 위주',
  2: '빵·디저트',
  3: '식사 가능',
}

export const PARKING_LABEL: Record<string, string> = {
  A: '주차 넉넉',
  B: '주차 보통',
  C: '주차 어려움',
  D: '주차 불가',
  '?': '주차 미확인',
}

export const ALL_TAGS = [
  '대형베이커리', '대형카페', '브런치카페', '뷰맛집',
  '정원마당형', '창고형', '전시복합문화', '디저트특화',
] as const

/** 방문 후 6개월이 지나지 않았는가 (카드 배지용) */
export function recentlyVisited(visitedOn: string | null, now = new Date()): boolean {
  if (!visitedOn) return false
  const days = (now.getTime() - new Date(visitedOn).getTime()) / 86_400_000
  return days >= 0 && days <= 180
}

export function driveLabel(min: number | null): string {
  if (min === null) return '거리 미확인'
  if (min < 60) return `차로 ${min}분`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `차로 ${h}시간` : `차로 ${h}시간 ${m}분`
}
