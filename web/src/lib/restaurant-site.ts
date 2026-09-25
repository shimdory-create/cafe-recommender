import raw from '../generated/site-restaurant.json'
import nearbyRaw from '../generated/site-restaurant-nearby.json'
import { resolveNearbyCards, type NearbyRelation } from './nearby-resolve'
// 경계를 넘는 import 를 쓰지 않는다 — src/restaurant-schema.ts 는 web 밖이라
// 모듈 해석이 위로 올라가고, Vercel 은 web 에서만 설치하므로 zod 를 못 찾는다.
// 드리프트는 파이프라인 테스트(restaurant-types-conformance)가 잡는다.
import { driveLabel, addedLabel, postsLabel } from './labels'
import type { RestaurantSitePayload, SiteRestaurant, SiteRestaurantVisited } from './restaurant-site-types'
import type { NearbyCard } from './nearby-types'

export type { SiteRestaurant, RestaurantSitePayload, SiteRestaurantVisited }
export { driveLabel, addedLabel, postsLabel }

/**
 * JSON import 는 값에서 타입을 추론하므로(널이 없으면 non-null, 문자열은
 * string) 스키마 타입에 그대로 대입되지 않는다. 그래서 캐스트를 쓴다 —
 * **런타임 검증은 생성기가 이미 했다** (npm run site 가 zod 로 parse 한 뒤
 * 쓴다). 여기서 또 검증하면 매 빌드마다 페이로드만큼 파싱 비용을 낸다.
 */
export const restaurantPayload = raw as unknown as RestaurantSitePayload

/**
 * 목록 화면이 쓰는 필드만 남긴 투영. 카페의 ListRow 와 같은 이유 —
 * 클라이언트 컴포넌트라 서버가 넘긴 props 가 그대로 브라우저로 내려간다.
 */
export type RestaurantListRow = Pick<
  SiteRestaurant,
  'id' | 'name' | 'sigungu' | 'area' | 'driveMinutes' | 'cuisineType' | 'parkingGrade'
  | 'hasRoom' | 'reservable' | 'tags' | 'evidence' | 'naverMapUrl' | 'imageUrl' | 'hotScore'
  | 'finalScore' | 'ratingAvg' | 'ratingCount' | 'cityOnly' | 'visitedOn' | 'isNew'
  | 'firstSeenAt' | 'lastSeenAt' | 'posts30' | 'posts90'
>

const CARD_EVIDENCE_CHARS = 90

export function toRestaurantListRow(r: SiteRestaurant): RestaurantListRow {
  return {
    id: r.id,
    name: r.name,
    sigungu: r.sigungu,
    area: r.area,
    driveMinutes: r.driveMinutes,
    cuisineType: r.cuisineType,
    parkingGrade: r.parkingGrade,
    hasRoom: r.hasRoom,
    reservable: r.reservable,
    tags: r.tags,
    evidence: r.evidence.length > CARD_EVIDENCE_CHARS
      ? r.evidence.slice(0, CARD_EVIDENCE_CHARS) + '…'
      : r.evidence,
    naverMapUrl: r.naverMapUrl,
    imageUrl: r.imageUrl,
    hotScore: r.hotScore,
    finalScore: r.finalScore,
    ratingAvg: r.ratingAvg,
    ratingCount: r.ratingCount,
    cityOnly: r.cityOnly,
    visitedOn: r.visitedOn,
    isNew: r.isNew,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    posts30: r.posts30,
    posts90: r.posts90,
  }
}

export const restaurantById = (id: string): SiteRestaurant | undefined =>
  restaurantPayload.restaurants.find((r) => r.id === id)

export type { NearbyCard }

const restaurantNearby = nearbyRaw as unknown as Record<string, { cafes: NearbyRelation[]; spots: NearbyRelation[] }>

export function nearbyForRestaurant(id: string) {
  const raw = restaurantNearby[id]
  if (!raw) return undefined
  return {
    cafes: resolveNearbyCards('restaurant', id, 'cafe', raw.cafes),
    spots: resolveNearbyCards('restaurant', id, 'spot', raw.spots),
  }
}

/**
 * 다녀온 적이 있는가 (카드 "다녀옴" 배지·추천 제외용). 2026-09-25 개정 —
 * 기간 없이 영구 제외다. `web/src/lib/site.ts` 의 `recentlyVisited`와 같다.
 */
export function restaurantRecentlyVisited(visitedOn: string | null): boolean {
  return visitedOn !== null
}

/**
 * liveness 잡이 기준일보다 오래 못 본 식당인가 (폐업 의심 배지용).
 * 카페의 STALE_DAYS 와 같은 규칙이지만 restaurantPayload.stats.staleDays 를
 * 그대로 쓴다 — 값을 여기 새로 적지 않는다.
 */
export const RESTAURANT_STALE_DAYS = restaurantPayload.stats.staleDays

export function restaurantIsStale(lastSeenAt: string | null, now = new Date()): boolean {
  if (!lastSeenAt) return false
  const days = (now.getTime() - new Date(lastSeenAt).getTime()) / 86_400_000
  return days > RESTAURANT_STALE_DAYS
}

/**
 * 실시간 방문 기록에서 **추천에서 내려가 있어야 할** 식당 id 만 고른다.
 * 다녀온 곳은 영구 제외라 기록에 있는 것 전부다.
 */
export function restaurantHiddenByVisit(
  visits: { kakaoPlaceId: string; visitedOn: string }[],
): Set<string> {
  return new Set(visits.map((v) => v.kakaoPlaceId))
}

/** 이번 주 추천. 카페의 homeFeed와 동일한 로직 */
export function restaurantHomeFeed(): SiteRestaurant[] {
  const fresh = (r: SiteRestaurant) => !r.cityOnly && !restaurantRecentlyVisited(r.visitedOn)
  const ranked = restaurantPayload.week
    .map((w) => restaurantById(w.id))
    .filter((r): r is SiteRestaurant => r !== undefined && fresh(r))
  const seen = new Set(ranked.map((r) => r.id))
  const rest = restaurantPayload.restaurants.filter((r) => fresh(r) && !seen.has(r.id))
  return [...ranked, ...rest]
}

export const CUISINE_LABEL: Record<string, string> = {
  한식: '한식', 일식: '일식', 중식: '중식', 양식: '양식', 분식: '분식', 고기구이: '고기구이',
}

export const PARKING_LABEL: Record<string, string> = {
  A: '주차 넉넉', B: '주차 보통', C: '주차 어려움', D: '주차 불가', '?': '주차 미확인',
}
