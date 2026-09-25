import raw from '../generated/site-spot.json'
import nearbyRaw from '../generated/site-spot-nearby.json'
import { resolveNearbyCards, type NearbyRelation } from './nearby-resolve'
import { driveLabel, addedLabel } from './labels'
import type { SpotSitePayload, SiteSpot, SiteSpotVisited } from './spot-site-types'
import type { NearbyCard } from './nearby-types'

export type { SiteSpot, SpotSitePayload, SiteSpotVisited }
export { driveLabel, addedLabel }

export const spotPayload = raw as unknown as SpotSitePayload

export type SpotListRow = Pick<
  SiteSpot,
  'id' | 'name' | 'sigungu' | 'area' | 'driveMinutes' | 'tags' | 'parkingGrade'
  | 'stayDuration' | 'indoorOutdoor' | 'season' | 'evidence' | 'naverMapUrl' | 'imageUrl'
  | 'hotScore' | 'finalScore' | 'ratingAvg' | 'ratingCount' | 'cityOnly' | 'visitedOn'
  | 'isNew' | 'firstSeenAt' | 'lastSeenAt' | 'posts30' | 'posts90'
>

const CARD_EVIDENCE_CHARS = 90

export function toSpotListRow(s: SiteSpot): SpotListRow {
  return {
    id: s.id, name: s.name, sigungu: s.sigungu, area: s.area, driveMinutes: s.driveMinutes,
    tags: s.tags, parkingGrade: s.parkingGrade, stayDuration: s.stayDuration,
    indoorOutdoor: s.indoorOutdoor, season: s.season,
    evidence: s.evidence.length > CARD_EVIDENCE_CHARS
      ? s.evidence.slice(0, CARD_EVIDENCE_CHARS) + '…'
      : s.evidence,
    naverMapUrl: s.naverMapUrl, imageUrl: s.imageUrl, hotScore: s.hotScore, finalScore: s.finalScore,
    ratingAvg: s.ratingAvg, ratingCount: s.ratingCount, cityOnly: s.cityOnly, visitedOn: s.visitedOn,
    isNew: s.isNew, firstSeenAt: s.firstSeenAt, lastSeenAt: s.lastSeenAt,
    posts30: s.posts30, posts90: s.posts90,
  }
}

export const spotById = (id: string): SiteSpot | undefined =>
  spotPayload.spots.find((s) => s.id === id)

export type { NearbyCard }

const spotNearby = nearbyRaw as unknown as Record<string, { cafes: NearbyRelation[]; restaurants: NearbyRelation[] }>

export function nearbyForSpot(id: string) {
  const raw = spotNearby[id]
  if (!raw) return undefined
  return {
    cafes: resolveNearbyCards('spot', id, 'cafe', raw.cafes),
    restaurants: resolveNearbyCards('spot', id, 'restaurant', raw.restaurants),
  }
}

/**
 * 다녀온 적이 있는가 (카드 "다녀옴" 배지·추천 제외용). 2026-09-25 개정 —
 * 기간 없이 영구 제외다. `web/src/lib/site.ts` 의 `recentlyVisited`와 같다.
 */
export function spotRecentlyVisited(visitedOn: string | null): boolean {
  return visitedOn !== null
}

export const SPOT_STALE_DAYS = spotPayload.stats.staleDays

export function spotIsStale(lastSeenAt: string | null, now = new Date()): boolean {
  if (!lastSeenAt) return false
  const days = (now.getTime() - new Date(lastSeenAt).getTime()) / 86_400_000
  return days > SPOT_STALE_DAYS
}

/**
 * 실시간 방문 기록에서 **추천에서 내려가 있어야 할** 장소 id 만 고른다.
 * 다녀온 곳은 영구 제외라 기록에 있는 것 전부다.
 */
export function spotHiddenByVisit(
  visits: { kakaoPlaceId: string; visitedOn: string }[],
): Set<string> {
  return new Set(visits.map((v) => v.kakaoPlaceId))
}

/** 이번 주 추천. 카페·식당의 homeFeed와 동일한 로직 */
export function spotHomeFeed(): SiteSpot[] {
  const fresh = (s: SiteSpot) => !s.cityOnly && !spotRecentlyVisited(s.visitedOn)
  const ranked = spotPayload.week
    .map((w) => spotById(w.id))
    .filter((s): s is SiteSpot => s !== undefined && fresh(s))
  const seen = new Set(ranked.map((s) => s.id))
  const rest = spotPayload.spots.filter((s) => fresh(s) && !seen.has(s.id))
  return [...ranked, ...rest]
}

/** 10개 태그 라벨. 표시 문구가 필요할 때만 거친다 — 지금은 원문과 동일 */
export const SPOT_TAG_LABEL: Record<string, string> = {
  '자연/공원': '자연/공원', '관광지/명소': '관광지/명소', '시장/전통거리': '시장/전통거리',
  '쇼핑/아울렛': '쇼핑/아울렛', '전시/박물관': '전시/박물관', '소품샵/편집숍': '소품샵/편집숍',
  '드라이브': '드라이브', '체험': '체험', '계절명소': '계절명소', '아이와 가기 좋은 곳': '아이와 가기 좋은 곳',
}

export const PARKING_LABEL: Record<string, string> = {
  A: '주차 넉넉', B: '주차 보통', C: '주차 어려움', D: '주차 불가', '?': '주차 미확인',
}

export const INDOOR_OUTDOOR_LABEL: Record<string, string> = {
  indoor: '실내', outdoor: '실외', mixed: '실내+실외',
}
