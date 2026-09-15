// src/site/nearby-payload.ts
import { nearestByDomain, type GeoPoint, type NearbyMatch } from './nearby.js'
import { buildPairIndex, lookupPair } from './nearby-drive-cache.js'
import { estimateDriveMinutes } from '../pipeline/geo.js'
import type { Cafe, SiteCafe, NearbyDrivePair } from '../schema.js'
import type { Restaurant, SiteRestaurant } from '../restaurant-schema.js'
import type { Spot, SiteSpot } from '../spot-schema.js'

export interface NearbyCard {
  id: string
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
  distanceKm: number
  /** 실측 있으면 분 단위, 없으면 null(카드는 이때 distanceKm으로 폴백 표시) */
  driveMinutes: number | null
  /** 앵커(지금 보는 곳)에서 이 카드로의 차량 길찾기 링크 */
  directionsUrl: string
}

export interface BuildNearbyInput {
  cafes: Cafe[]
  restaurants: Restaurant[]
  spots: Spot[]
  cafeSite: SiteCafe[]
  restaurantSite: SiteRestaurant[]
  spotSite: SiteSpot[]
  driveCache: NearbyDrivePair[]
  /** 직선거리 1차 필터 개수(2단계 K). 그 안에서만 실측 기준 재정렬한다 */
  preLimit: number
  limit: number
}

export interface NearbyPayloads {
  cafe: Record<string, { restaurants: NearbyCard[]; spots: NearbyCard[] }>
  restaurant: Record<string, { cafes: NearbyCard[]; spots: NearbyCard[] }>
  spot: Record<string, { cafes: NearbyCard[]; restaurants: NearbyCard[] }>
}

interface GeoCard extends GeoPoint {
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
}

/**
 * 원본 배열(좌표)과 최종 사이트 페이로드(카드 필드)를 id 로 조인해
 * GeoCard 목록을 만든다. 사이트 페이로드는 이미 판정 통과분만 담고
 * 있으므로 별도 status 필터가 필요 없다.
 *
 * `opts.excludeCityOnly`: 후보(다른 곳에 추천되는 쪽)를 만들 때는 true —
 * 도심 모드를 한 번도 안 켠 사용자에게 주차 어려운 곳이 섞여 들어가면
 * 안 된다. 앵커(자기 자신의 상세 페이지)를 만들 때는 false — cityOnly
 * 인 곳도 자기 페이지에서는 근처 추천을 정상적으로 받아야 한다. 스펙은
 * "후보에서 cityOnly 제외"라고만 했지 "cityOnly 인 곳은 근처 추천 자체를
 * 못 받는다"는 아니다.
 */
function toGeoCards<TRaw extends { kakaoPlaceId: string; lat: number; lng: number }>(
  raw: TRaw[],
  site: { id: string; name: string; imageUrl: string | null; tags: string[]; sigungu: string; ratingAvg: number; ratingCount: number; cityOnly: boolean }[],
  opts: { excludeCityOnly: boolean },
): GeoCard[] {
  const coordById = new Map(raw.map((r) => [r.kakaoPlaceId, r]))
  const cards: GeoCard[] = []
  for (const s of site) {
    if (opts.excludeCityOnly && s.cityOnly) continue
    const coord = coordById.get(s.id)
    if (!coord) continue
    cards.push({
      id: s.id, lat: coord.lat, lng: coord.lng, name: s.name, imageUrl: s.imageUrl,
      tags: s.tags, sigungu: s.sigungu, ratingAvg: s.ratingAvg, ratingCount: s.ratingCount,
    })
  }
  return cards
}

/**
 * 두 지점 간 네이버지도 자동차 길찾기 웹 URL.
 *
 * **여전히 완전히 확인된 형식은 아니다 — 3차 시도.**
 * - 1차(`p/directions/{lng},{lat}/{lng},{lat}/-/car`, 이름 없이 좌표만):
 *   데스크톱은 됐지만 폰은 네이버지도 앱만 열리고 도착지가 빈 채로 남음
 *   — 앱이 이름 없는 좌표를 못 읽은 것으로 보인다.
 * - 2차(`index.nhn?slat=...&stext=...&pathType=1`, 옛 쿼리스트링 형식,
 *   이름 포함): 이번엔 두 지점 다 제대로 잡혔지만 **대중교통이 기본
 *   탭으로 뜨고 자동차 탭을 한 번 더 눌러야 했다** — `pathType` 값이
 *   자동차/대중교통을 결정하는 파라미터가 아니었던 것 같다.
 * - 3차(지금): 네이버지도 앱 스킴(`nmap://route/car` vs `route/public`,
 *   공식 문서 확인됨)은 자동차/대중교통을 **경로의 일부**로 구분한다.
 *   1차에서 쓴 `/p/directions/.../-/car` 의 `/-/car` 접미사가 바로 그
 *   방식과 일치하므로, 1차 형식(데스크톱 확인됨 + 경로 기반 모드 지정)에
 *   2차에서 배운 것(이름 포함이 중요해 보임)을 더해 좌표 뒤에 이름을
 *   추가했다. 이번에도 안 되면 이 함수만 다시 고치면 된다.
 */
function directionsUrl(anchor: GeoCard, dest: GeoCard): string {
  const seg = (p: GeoCard) => `${p.lng},${p.lat},${encodeURIComponent(p.name)}`
  return `https://map.naver.com/p/directions/${seg(anchor)}/${seg(dest)}/-/car`
}

function toCards(
  anchor: GeoCard,
  matches: NearbyMatch[],
  byId: Map<string, GeoCard>,
  driveIndex: Map<string, NearbyDrivePair>,
  finalLimit: number,
): NearbyCard[] {
  const withRank = matches.flatMap((m) => {
    const c = byId.get(m.id)
    if (!c) return []
    const hit = lookupPair(driveIndex, anchor.id, c.id)
    const rankMinutes = hit ? hit.minutes : estimateDriveMinutes(m.distanceKm)
    return [{
      card: {
        id: c.id, name: c.name, imageUrl: c.imageUrl, tags: c.tags, sigungu: c.sigungu,
        ratingAvg: c.ratingAvg, ratingCount: c.ratingCount, distanceKm: m.distanceKm,
        driveMinutes: hit ? hit.minutes : null,
        directionsUrl: directionsUrl(anchor, c),
      },
      rankMinutes,
    }]
  })
  withRank.sort((a, b) => a.rankMinutes - b.rankMinutes)
  return withRank.slice(0, finalLimit).map((x) => x.card)
}

/** anchors 각 항목에 대해 candidates 중 가까운 순 카드 목록을 만든다 */
function nearbyMap(
  anchors: GeoCard[],
  candidates: GeoCard[],
  driveIndex: Map<string, NearbyDrivePair>,
  preLimit: number,
  finalLimit: number,
): Map<string, NearbyCard[]> {
  const matches = nearestByDomain(anchors, candidates, preLimit)
  const candidateById = new Map(candidates.map((c) => [c.id, c]))
  const anchorById = new Map(anchors.map((a) => [a.id, a]))
  const result = new Map<string, NearbyCard[]>()
  for (const [anchorId, m] of matches) {
    const anchor = anchorById.get(anchorId)
    if (!anchor) continue
    result.set(anchorId, toCards(anchor, m, candidateById, driveIndex, finalLimit))
  }
  return result
}

export function buildNearbyPayloads(input: BuildNearbyInput): NearbyPayloads {
  const {
    cafes, restaurants, spots, cafeSite, restaurantSite, spotSite,
    driveCache, preLimit, limit,
  } = input
  const driveIndex = buildPairIndex(driveCache)

  const cafeAnchors = toGeoCards(cafes, cafeSite, { excludeCityOnly: false })
  const cafeCands = toGeoCards(cafes, cafeSite, { excludeCityOnly: true })
  const restAnchors = toGeoCards(restaurants, restaurantSite, { excludeCityOnly: false })
  const restCands = toGeoCards(restaurants, restaurantSite, { excludeCityOnly: true })
  const spotAnchors = toGeoCards(spots, spotSite, { excludeCityOnly: false })
  const spotCands = toGeoCards(spots, spotSite, { excludeCityOnly: true })

  const cafeToRest = nearbyMap(cafeAnchors, restCands, driveIndex, preLimit, limit)
  const cafeToSpot = nearbyMap(cafeAnchors, spotCands, driveIndex, preLimit, limit)
  const restToCafe = nearbyMap(restAnchors, cafeCands, driveIndex, preLimit, limit)
  const restToSpot = nearbyMap(restAnchors, spotCands, driveIndex, preLimit, limit)
  const spotToCafe = nearbyMap(spotAnchors, cafeCands, driveIndex, preLimit, limit)
  const spotToRest = nearbyMap(spotAnchors, restCands, driveIndex, preLimit, limit)

  const cafe: NearbyPayloads['cafe'] = {}
  for (const c of cafeAnchors) {
    cafe[c.id] = { restaurants: cafeToRest.get(c.id) ?? [], spots: cafeToSpot.get(c.id) ?? [] }
  }
  const restaurant: NearbyPayloads['restaurant'] = {}
  for (const r of restAnchors) {
    restaurant[r.id] = { cafes: restToCafe.get(r.id) ?? [], spots: restToSpot.get(r.id) ?? [] }
  }
  const spot: NearbyPayloads['spot'] = {}
  for (const s of spotAnchors) {
    spot[s.id] = { cafes: spotToCafe.get(s.id) ?? [], restaurants: spotToRest.get(s.id) ?? [] }
  }

  return { cafe, restaurant, spot }
}
