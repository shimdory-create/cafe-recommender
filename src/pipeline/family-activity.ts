/**
 * 위시리스트·리뷰·다녀왔어요·개인 블랙리스트처럼 가족이 직접 남긴 기록의
 * id를 하나의 집합으로 합친다.
 *
 * 대량 재분류 명령(spot-declassify-food, restaurant-declassify-cafe)이
 * 분류만 보고 자동으로 배제하기 전에, 그 장소에 가족 기록이 있으면
 * 건너뛰고 사람이 보게 하려고 만들었다 — 카테고리는 기계적으로 맞는데
 * 가족이 이미 다녀왔거나 담아둔 곳을 조용히 지우는 사고를 막는다.
 */
export function familyActivityIds(sources: { kakaoPlaceId: string }[][]): Set<string> {
  const out = new Set<string>()
  for (const rows of sources) {
    for (const r of rows) out.add(r.kakaoPlaceId)
  }
  return out
}
