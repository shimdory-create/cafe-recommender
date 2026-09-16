import { payload as cafePayload } from './site'
import { restaurantPayload } from './restaurant-site'
import { spotPayload } from './spot-site'
import type { NearbyCard } from './nearby-types'

export type Domain = 'cafe' | 'restaurant' | 'spot'

export interface NearbyRelation {
  id: string
  distanceKm: number
  driveMinutes: number | null
}

interface ResolvedPoint {
  id: string
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
  lat: number
  lng: number
}

/**
 * 도메인별 id -> 표시 필드 색인. 모듈 로드 시 한 번만 만든다 — site 빌드가
 * 정적 페이지를 수천 장 찍어내는 동안 이 조회가 페이지마다 반복되므로,
 * `nearby-drive-cache.ts`의 `buildPairIndex`와 같은 이유로 선형 탐색을
 * 피한다(기존 `byId`/`restaurantById`/`spotById`는 `.find()`라서 여기선
 * 안 쓴다).
 *
 * 순환 import 를 회피하려고 lazy 초기화를 쓴다 — site/restaurant-site/spot-site 에서
 * nearby-resolve 를 import 하면, 이 모듈이 로드할 때 아직 payload 가 정의되지
 * 않기 때문이다.
 */
let cafeIndex: Map<string, ResolvedPoint> | undefined
let restaurantIndex: Map<string, ResolvedPoint> | undefined
let spotIndex: Map<string, ResolvedPoint> | undefined

function getCafeIndex(): Map<string, ResolvedPoint> {
  if (!cafeIndex) {
    cafeIndex = new Map(cafePayload.cafes.map((c) => [c.id, c]))
  }
  return cafeIndex
}

function getRestaurantIndex(): Map<string, ResolvedPoint> {
  if (!restaurantIndex) {
    restaurantIndex = new Map(restaurantPayload.restaurants.map((r) => [r.id, r]))
  }
  return restaurantIndex
}

function getSpotIndex(): Map<string, ResolvedPoint> {
  if (!spotIndex) {
    spotIndex = new Map(spotPayload.spots.map((s) => [s.id, s]))
  }
  return spotIndex
}

function indexOf(domain: Domain): Map<string, ResolvedPoint> {
  if (domain === 'cafe') return getCafeIndex()
  if (domain === 'restaurant') return getRestaurantIndex()
  return getSpotIndex()
}

/**
 * 두 지점 간 네이버지도 자동차 길찾기 웹 URL.
 *
 * `src/site/nearby-payload.ts`에 있던 것과 **동일한 공식**이다 — build
 * 시점 계산을 여기(read 시점)로 옮기면서 그대로 복사했다. 웹은 `src/`를
 * import할 수 없어서(zod 의존성 때문에 Vercel 배포가 실패한 전례가
 * 있다) 공유하지 않고 각자 갖는다. 형식 자체를 다시 바꿔야 하면 두 곳
 * 다 고쳐야 한다는 뜻이다.
 */
function directionsUrl(anchor: ResolvedPoint, dest: ResolvedPoint): string {
  const seg = (p: ResolvedPoint) => `${p.lng},${p.lat},${encodeURIComponent(p.name)}`
  return `https://map.naver.com/p/directions/${seg(anchor)}/${seg(dest)}/-/car`
}

export function resolveNearbyCards(
  anchorDomain: Domain,
  anchorId: string,
  candidateDomain: Domain,
  relations: NearbyRelation[],
): NearbyCard[] {
  const anchor = indexOf(anchorDomain).get(anchorId)
  if (!anchor) return []
  const candIndex = indexOf(candidateDomain)
  return relations.flatMap((rel) => {
    const c = candIndex.get(rel.id)
    if (!c) return []
    return [{
      id: c.id, name: c.name, imageUrl: c.imageUrl, tags: c.tags, sigungu: c.sigungu,
      ratingAvg: c.ratingAvg, ratingCount: c.ratingCount,
      distanceKm: rel.distanceKm, driveMinutes: rel.driveMinutes,
      directionsUrl: directionsUrl(anchor, c),
    }]
  })
}
