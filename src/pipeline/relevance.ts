import type { BlogDoc } from '../sources/kakao-blog.js'

/**
 * 카페 문맥어. 상호명만으로는 부족하다 — "가평 수목원" 은 상호명을
 * 포함하지만 카페 글이 아니다 (실측: 정밀도 100%, 월 634건).
 */
const CAFE_CONTEXT = ['카페', '까페', '베이커리', '커피', '빵', '디저트', '브런치'] as const

/** 일반명사 상호. 걸리면 골든셋 경계 구간으로 강제 편입한다. */
const AMBIGUOUS_NAMES = new Set([
  '수목원', '식물원', '농원', '공원', '정원', '마당', '숲', '뜰',
  '언덕', '호수', '바다', '하늘', '카페', '커피', '베이커리',
])

const squeeze = (s: string) => s.replace(/\s+/g, '')

/**
 * Layer 2 관련성 판정. 두 조건을 **모두** 요구한다 (Global Constraints).
 *   1) 제목·본문에 상호명 포함
 *   2) 카페 문맥어 하나 이상 포함
 */
export function isRelevant(doc: BlogDoc, cafeName: string): boolean {
  const hay = squeeze(`${doc.title} ${doc.contents}`)
  const needle = squeeze(cafeName)
  if (!needle || !hay.includes(needle)) return false
  return CAFE_CONTEXT.some((w) => hay.includes(w))
}

export function isAmbiguousName(name: string): boolean {
  const n = squeeze(name)
  return n.length <= 2 || AMBIGUOUS_NAMES.has(n)
}
