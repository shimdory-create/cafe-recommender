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
  /** 화제도 x 가족 적합도. 홈 피드와 목록의 정렬 기준 */
  finalScore: number
  postsPer30: number
  acceleration: number
  /** 'unknown' 은 50건 창이 잘려 비교 불가라는 뜻. 늘었다고 쓰지 않는다 */
  trend: 'rising' | 'steady' | 'unknown'
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

/**
 * 목록 화면이 쓰는 필드만 남긴 투영.
 *
 * 전체 리스트는 클라이언트 컴포넌트라 서버가 넘긴 props 가 그대로 브라우저로
 * 내려간다. 전체 페이로드를 넘기면 판정이 다 끝났을 때 1.5MB 가 모바일로
 * 간다 — 주차 근거·후기 원문·체류시간 같은 상세 전용 필드는 목록에 필요 없다.
 * 카드가 근거를 90자에서 자르므로 문자열도 그때 잘라 보낸다.
 */
export type ListRow = Pick<
  SiteCafe,
  'id' | 'name' | 'sigungu' | 'driveMinutes' | 'scale' | 'parkingGrade'
  | 'menuLevel' | 'tags' | 'evidence' | 'naverMapUrl' | 'hotScore' | 'finalScore'
  | 'cityOnly' | 'visitedOn'
>

const CARD_EVIDENCE_CHARS = 90

export function toListRow(c: SiteCafe): ListRow {
  return {
    id: c.id,
    name: c.name,
    sigungu: c.sigungu,
    driveMinutes: c.driveMinutes,
    scale: c.scale,
    parkingGrade: c.parkingGrade,
    menuLevel: c.menuLevel,
    tags: c.tags,
    evidence: c.evidence.length > CARD_EVIDENCE_CHARS
      ? c.evidence.slice(0, CARD_EVIDENCE_CHARS) + '…'
      : c.evidence,
    naverMapUrl: c.naverMapUrl,
    hotScore: c.hotScore,
    finalScore: c.finalScore,
    cityOnly: c.cityOnly,
    visitedOn: c.visitedOn,
  }
}

export const byId = (id: string): SiteCafe | undefined =>
  payload.cafes.find((c) => c.id === id)

/**
 * 홈 피드. 이번 주 추천을 앞에 두고 나머지를 종합점수 순으로 잇는다.
 *
 * 추천 10곳 안에서 못 고르면 다음 10곳으로 넘어갈 수 있어야 한다 —
 * 4인 가족이 취향을 맞추려면 폭이 필요하다. 그래서 "3곳 + 끝" 이 아니라
 * 끊기지 않는 피드로 만든다.
 */
export function homeFeed(): SiteCafe[] {
  const ranked = payload.week
    .map((w) => byId(w.id))
    .filter((c): c is SiteCafe => c !== undefined && !c.cityOnly)
  const seen = new Set(ranked.map((c) => c.id))
  const rest = payload.cafes.filter((c) => !c.cityOnly && !seen.has(c.id))
  // payload.cafes 는 이미 종합점수 내림차순이다
  return [...ranked, ...rest]
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
