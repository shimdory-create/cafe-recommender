/**
 * 그물 A — 카카오 키워드 검색어.
 * "{시도} {시군구} {키워드}" 로 조합한다 (동명 시군구 때문에 시도 필수).
 */
export const RESTAURANT_SEARCH_KEYWORDS = [
  '한식맛집',
  '일식맛집',
  '중식맛집',
  '양식맛집',
  '분식맛집',
  '고기맛집',
] as const

/**
 * 그물 C — 블로그 큐레이션 수확용 검색어.
 *
 * 블로거가 이미 손으로 큐레이션한 "BEST N" 류 글을 노린다.
 * 동네 식당은 이런 글에 등장하지 않는다.
 */
export function restaurantCurationQueries(regionLabel: string): string[] {
  return [
    `${regionLabel} 맛집 추천`,
    `${regionLabel} 맛집 베스트`,
    `${regionLabel} 가족 외식`,
  ]
}
