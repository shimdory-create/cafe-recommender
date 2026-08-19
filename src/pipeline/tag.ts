import type { CafeAttributes } from '../schema.js'

/**
 * 성격 태그 8종 (스펙 7.1). 여기서 늘리지 않는다 — 10개를 넘으면
 * 태그의 의미가 사라진다.
 */
export const TAGS = [
  '대형베이커리', '대형카페', '브런치카페', '뷰맛집',
  '정원마당형', '창고형', '전시복합문화', '디저트특화',
] as const
export type Tag = (typeof TAGS)[number]

const SMALL_SEATS = 60
const GARDEN_WORDS = ['정원', '마당', '잔디', '산책', '수목', '텃밭']
const WAREHOUSE_WORDS = ['창고', '공장', '인더스트리얼', '층고', '노출콘크리트']
const GALLERY_WORDS = ['전시', '갤러리', '서점', '편집숍', '미술', '뮤지엄']
const DESSERT_WORDS = ['케이크', '타르트', '젤라토', '디저트', '마카롱', '푸딩']

/** seatsEstimate 가 없으면 scale 로 추정한다 */
function seatsOf(a: CafeAttributes): number {
  if (a.seatsEstimate != null) return a.seatsEstimate
  return a.scale === '대형' ? 120 : a.scale === '소형' ? 20 : 60
}

/**
 * Layer 4 — 성격 태그 부여. 중복 허용.
 *
 * 소형(좌석 60석 미만)은 임계값이 올라간다: "작을수록 더 압도적이어야
 * 통과한다" (스펙 7.5). 그냥 열어두면 20석 동네 카페가 뷰 태그 하나로
 * 밀려 들어온다.
 *
 * 태그가 하나도 안 붙으면 그것이 동네 카페다 (Layer 5).
 */
export function assignTags(a: CafeAttributes): string[] {
  const tags = new Set<string>()
  const seats = seatsOf(a)
  const isSmall = seats < SMALL_SEATS || a.scale === '소형'

  if (a.scale === '대형' && !isSmall) {
    tags.add('대형카페')
    if (a.hasBakery) tags.add('대형베이커리')
  }

  if (a.menuLevel === 3) tags.add('브런치카페')

  const viewCut = isSmall ? 4 : 3
  if (a.viewStrength >= viewCut) tags.add('뷰맛집')

  const haystack = [...(a.viewTypes ?? []), ...(a.mealTypes ?? []), a.evidence].join(' ')
  if (a.outdoorSeating && GARDEN_WORDS.some((w) => haystack.includes(w))) tags.add('정원마당형')
  if (WAREHOUSE_WORDS.some((w) => haystack.includes(w))) tags.add('창고형')
  if (GALLERY_WORDS.some((w) => haystack.includes(w))) tags.add('전시복합문화')
  if (DESSERT_WORDS.some((w) => haystack.includes(w))) tags.add('디저트특화')

  return [...tags]
}
