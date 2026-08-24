import type { Cafe } from '../schema.js'

/**
 * 장소를 가리키는 검색어 — **시도를 붙인다.**
 *
 * `시군구 + 상호` 만 쓰면 동명 지역에 걸린다. 실측 (2026-08-25):
 *
 * ```
 * 광주시 카페숨      -> 전남 광주통합특별시 해남군 결과가 나온다
 * 경기 광주시 카페숨  -> 정확히 찾는다
 * ```
 *
 * 우리 목록에서 위험한 시군구는 강서구(서울·부산), 중구(여섯 곳),
 * 광주시(경기 vs 광주광역시)로 54곳이다. 지도 링크는 가족이 직접 누르는
 * 것이라 엉뚱한 지역이 열리면 바로 신뢰가 깨진다.
 *
 * 시도는 **주소에서** 읽는다. `sigungu` 는 주소 기준으로 정정돼 있고
 * (스펙 10.8) 주소 앞 두 글자가 곧 시도다.
 */
export function sidoOf(input: { roadAddress?: string | null; address?: string | null }): string {
  return (input.roadAddress ?? input.address ?? '').slice(0, 2)
}

/** `경기 광주시 카페숨`. 시도를 모르면 시군구부터 쓴다 */
export function placeQuery(
  input: { name: string; sigungu: string; roadAddress?: string | null; address?: string | null },
): string {
  const sido = sidoOf(input)
  return [sido, input.sigungu, input.name].filter(Boolean).join(' ')
}

/** 네이버지도 검색 링크 (스펙 10절 — place ID 없이 검색 URL 로 만든다) */
export function naverMapLink(cafe: Pick<Cafe, 'name' | 'sigungu' | 'roadAddress' | 'address'>): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(placeQuery(cafe))}`
}
