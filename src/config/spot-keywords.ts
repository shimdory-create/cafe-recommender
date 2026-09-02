/**
 * 그물 A — 카카오 키워드 검색어.
 * "{시도} {시군구} {키워드}" 로 조합한다 (동명 시군구 때문에 시도 필수).
 */
export const SPOT_SEARCH_KEYWORDS = [
  '관광명소', '공원', '전시관', '박물관', '테마파크', '체험학습장',
  '전통시장', '아울렛',
] as const

/**
 * 그물 C — 블로그 큐레이션 수확용 검색어.
 *
 * 블로거가 이미 손으로 큐레이션한 "BEST N" 류 글을 노린다.
 * 동네 가볼 곳은 이런 글에 등장하지 않는다.
 */
export function spotCurationQueries(regionLabel: string): string[] {
  return [
    `${regionLabel} 가볼만한곳`,
    `${regionLabel} 나들이 추천`,
    `${regionLabel} 아이와 가볼만한곳`,
  ]
}
