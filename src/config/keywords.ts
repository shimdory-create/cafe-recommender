/**
 * 그물 A — 카카오 키워드 검색어.
 * "{시도} {시군구} {키워드}" 로 조합한다 (동명 시군구 때문에 시도 필수).
 */
export const SEARCH_KEYWORDS = [
  '베이커리카페',
  '대형카페',
  '브런치카페',
  '루프탑카페',
  '정원카페',
  '뷰맛집카페',
] as const

/**
 * 그물 C — 블로그 큐레이션 수확용 검색어.
 *
 * 블로거가 이미 손으로 큐레이션한 "BEST N" 류 글을 노린다.
 * 동네 카페는 이런 글에 등장하지 않는다.
 *
 * 이 그물이 필요한 이유는 실측으로 확인됐다: "양평 베이커리카페" 로
 * 카카오 키워드 검색을 돌렸을 때 1위가 무관한 커피전문점이었다.
 * 카카오 키워드 검색은 상호명 매칭 위주라 상호에 "대형"이 없는
 * 대형카페를 놓친다.
 */
export function curationQueries(regionLabel: string): string[] {
  return [
    `${regionLabel} 대형카페 추천`,
    `${regionLabel} 베이커리카페 뷰`,
    `${regionLabel} 카페 베스트`,
  ]
}

/** 그물 B — 카카오 카테고리 그룹 코드. CE7 = 카페. */
export const CATEGORY_GROUP_CODES = ['CE7'] as const
