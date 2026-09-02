export interface GeoPoint {
  id: string
  lat: number
  lng: number
}

export interface NearbyMatch {
  id: string
  distanceKm: number
}

const EARTH_RADIUS_KM = 6371

/** 두 좌표 사이의 직선거리(km), 소수 첫째 자리 반올림 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  if (a.lat === b.lat && a.lng === b.lng) return 0
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  const km = EARTH_RADIUS_KM * c
  return Math.round(km * 10) / 10
}

/**
 * anchors 각각에 대해 candidates 중 가장 가까운 limit개를 가까운 순으로
 * 반환한다. anchors 와 candidates 는 서로 다른 도메인이라는 전제 —
 * 같은 도메인끼리는 호출하지 않는다(자기 자신 제외 로직이 없다).
 */
export function nearestByDomain(
  anchors: GeoPoint[],
  candidates: GeoPoint[],
  limit: number,
): Map<string, NearbyMatch[]> {
  const result = new Map<string, NearbyMatch[]>()
  for (const anchor of anchors) {
    const matches = candidates
      .map((c): NearbyMatch => ({ id: c.id, distanceKm: haversineKm(anchor, c) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit)
    result.set(anchor.id, matches)
  }
  return result
}
