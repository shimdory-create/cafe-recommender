/**
 * 폐업 의심(maybe_closed) 후보에서 방문 기록이 있는 곳을 뺀다.
 *
 * 가족이 실제로 다녀온 곳이면 존재를 직접 확인한 셈이라, 카카오 검색에
 * 21일 넘게 안 잡혀도 폐업 의심 목록(정보 탭 "지우기" 후보)에 절대 올리지
 * 않는다 — 사용자 요청.
 */
export function excludeVisited<T extends { kakaoPlaceId: string }>(
  rows: T[],
  visits: { kakaoPlaceId: string }[],
): T[] {
  const visited = new Set(visits.map((v) => v.kakaoPlaceId))
  return rows.filter((r) => !visited.has(r.kakaoPlaceId))
}
