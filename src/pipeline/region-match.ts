import type { Region } from '../config/regions.js'

/** 수도권 좌표 범위. 주소가 비었을 때의 최후 방어선 */
const BOUNDS = { minLat: 36.8, maxLat: 38.4, minLng: 125.8, maxLng: 127.9 }

export interface PlaceLike {
  addressName?: string | null
  roadAddressName?: string | null
  lat: number
  lng: number
}

/**
 * 검색 결과가 정말 그 지역의 장소인지 확인한다.
 *
 * 카카오 키워드 검색은 시도명을 붙여도 **동명 시군구를 섞어서 준다.**
 * 실측 오염 18곳:
 *   "서울 강서구 베이커리카페" -> 부산 강서구 8곳
 *   "인천 중구/동구/서구"      -> 대구·대전 5곳
 *   "경기 광주시"              -> 전남광주 5곳 (카페숨: 추정 441분)
 *
 * **시군구까지 대조하지는 않는다.** 두 가지 이유가 있다.
 *   1. 카카오 키워드 검색은 인접 구의 카페를 함께 준다 (서대문구 검색에
 *      마포구 48곳). 차로 가는 가족에게 인접 구 카페는 버릴 이유가 없다.
 *   2. **인천 행정구역이 개편되었다.** 주소에는 제물포구·영종구·서해구·
 *      검단구가 나오는데 우리 지역 목록은 중구·동구·서구다. 시군구를
 *      대조하면 정상 카페 1,731곳이 잘못 걸린다 (실측).
 *
 * 즉 여기서 막는 것은 **범위 밖 시도**다 — 부산·대구·대전·전남·경남·강원·
 * 충청. 거리는 장소 자신의 좌표로 계산하므로 인접 구 오차의 영향이 없다.
 * 다만 카드에 표시되는 시군구 라벨은 검색한 지역 기준이라 인접 구가 섞일
 * 수 있다. v1 에서는 수용한다.
 */
export function belongsToRegion(p: PlaceLike, region: Region): boolean {
  const addr = (p.addressName || p.roadAddressName || '').trim()

  // 카카오 주소는 "경기 광주시 ...", "부산 강서구 ..." 처럼 짧은 시도명으로
  // 시작한다. 시도가 다르면 동명 시군구다.
  if (addr) return addr.startsWith(region.sido)

  return (
    p.lat >= BOUNDS.minLat && p.lat <= BOUNDS.maxLat
    && p.lng >= BOUNDS.minLng && p.lng <= BOUNDS.maxLng
  )
}

/** 이미 저장된 카페가 수도권 밖인지 (일회성 정리용) */
export function isOutOfMetroArea(c: { lat: number; lng: number }): boolean {
  return (
    c.lat < BOUNDS.minLat || c.lat > BOUNDS.maxLat
    || c.lng < BOUNDS.minLng || c.lng > BOUNDS.maxLng
  )
}
