/**
 * 주소에서 실제 행정구역을 뽑는다.
 *
 * **왜 필요한가.** `sigungu` 에 지금까지 "검색한 지역" 이 들어가 있었다.
 * 카카오 키워드 검색 `경기 양평군 대형카페` 는 경계 너머 남양주·광주의 카페도
 * 함께 준다. 그것을 양평군으로 저장하면 세 곳이 어긋난다.
 *
 *   카드      "양평군 · 61분"   -> 실제로는 남양주시
 *   지도 링크  `양평군 라온숨`    -> 엉뚱한 검색
 *   지역 묶음  양평군 그룹        -> 남양주 카페가 섞임
 *
 * 실측: active 299곳 중 20곳(6.7%)이 어긋났다.
 *
 * 그래서 주소를 진실로 삼는다. 주소가 없으면(카카오에 빈 껍데기로 올라온 곳)
 * 검색 지역을 그대로 쓴다 — 없는 것보다 낫다.
 */

/** `경기 남양주시 화도읍 ...` -> `남양주시` */
export function districtOf(address: string | null | undefined): string | null {
  if (!address) return null
  // 시도 다음의 첫 토큰이 시·군·구다. 세종시처럼 시도=시군구인 경우는 수도권에 없다.
  const m = /^(?:서울|서울특별시|인천|인천광역시|경기|경기도)\s+(\S+?[시군구])(?:\s|$)/.exec(
    address.trim(),
  )
  if (!m) return null
  const d = m[1]!
  // `성남시 분당구` 처럼 두 단계인 경우 앞쪽(시)만 쓴다 — REGIONS 가 시 단위다
  return d
}

/**
 * 저장할 행정구역. 주소가 있으면 주소를, 없으면 검색 지역을 쓴다.
 */
export function resolveSigungu(input: {
  roadAddress?: string | null
  address?: string | null
  scanned: string
}): string {
  return districtOf(input.roadAddress) ?? districtOf(input.address) ?? input.scanned
}
