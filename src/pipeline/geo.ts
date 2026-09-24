export interface LatLng {
  lat: number
  lng: number
}

/**
 * 출발지: 인천 부평구 수변로 334 (실제 집주소, 카카오 주소 검색으로 확인 —
 * 2026-09-24). 이전 값(37.5074, 126.7218)은 실제 주소보다 약 1.8km
 * 남서쪽으로 치우쳐 있어 모든 실측·근사 거리가 그만큼 어긋나 있었다.
 */
export const HOME: LatLng = { lat: 37.5151091, lng: 126.7398273 }

const EARTH_RADIUS_KM = 6371

const toRad = (deg: number) => (deg * Math.PI) / 180

/** 두 좌표 사이 대권거리(km). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 우회계수. 실제 도로는 직선보다 길다. 수도권 평균 근사값. */
const DETOUR_FACTOR = 1.35
/** 평균 주행속도(km/h). 시내·외곽 혼합 기준. */
const AVG_SPEED_KMH = 60

/**
 * 직선거리에서 차량 소요시간(분)을 근사한다.
 *
 * 스펙 8.2절: 1차 범위에서는 실측 경로 API 를 쓰지 않는다.
 * 후보로 확정된 카페만 나중에 1회 실측해 영구 캐싱한다.
 *
 * 근사가 과대추정 쪽으로 치우치는 편이 안전하다 — 예상보다 가까운 것이
 * 예상보다 먼 것보다 낫다.
 *
 * 알려진 오차 (2026-08-20 실측 대조):
 *   양평 91분(실제 ~80) · 가평 106분(실제 ~90)   -> 과대추정. 안전한 방향
 *   강화 29분(실제 ~60) · 파주 43분(실제 ~60)     -> 과소추정. 주의
 * 강화도는 초지대교 하나뿐이어서 우회계수로 잡히지 않는다. 반경 대신
 * 이동시간을 쓰기로 한 스펙의 근거가 바로 이 왜곡이며, 후보로 확정된
 * 카페는 나중에 1회 실측해 이 근사를 대체한다.
 */
export function estimateDriveMinutes(straightKm: number): number {
  return Math.round(((straightKm * DETOUR_FACTOR) / AVG_SPEED_KMH) * 60)
}
