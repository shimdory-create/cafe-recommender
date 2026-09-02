// src/site/nearby-payload.ts
import { nearestByDomain, type GeoPoint, type NearbyMatch } from './nearby.js'
import type { Cafe, SiteCafe } from '../schema.js'
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
}

export interface BuildNearbyInput {
  cafes: Cafe[]
  restaurants: Restaurant[]
  spots: Spot[]
  cafeSite: SiteCafe[]
  restaurantSite: SiteRestaurant[]
  spotSite: SiteSpot[]
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

function toCards(matches: NearbyMatch[], byId: Map<string, GeoCard>): NearbyCard[] {
  const out: NearbyCard[] = []
  for (const m of matches) {
    const c = byId.get(m.id)
    if (!c) continue
    out.push({
      id: c.id, name: c.name, imageUrl: c.imageUrl, tags: c.tags, sigungu: c.sigungu,
      ratingAvg: c.ratingAvg, ratingCount: c.ratingCount, distanceKm: m.distanceKm,
    })
  }
  return out
}

/** anchors 각 항목에 대해 candidates 중 가까운 순 카드 목록을 만든다 */
function nearbyMap(
  anchors: GeoCard[],
  candidates: GeoCard[],
  limit: number,
): Map<string, NearbyCard[]> {
  const matches = nearestByDomain(anchors, candidates, limit)
  const candidateById = new Map(candidates.map((c) => [c.id, c]))
  const result = new Map<string, NearbyCard[]>()
  for (const [anchorId, m] of matches) result.set(anchorId, toCards(m, candidateById))
  return result
}

export function buildNearbyPayloads(input: BuildNearbyInput): NearbyPayloads {
  const { cafes, restaurants, spots, cafeSite, restaurantSite, spotSite, limit } = input

  const cafeAnchors = toGeoCards(cafes, cafeSite, { excludeCityOnly: false })
  const cafeCands = toGeoCards(cafes, cafeSite, { excludeCityOnly: true })
  const restAnchors = toGeoCards(restaurants, restaurantSite, { excludeCityOnly: false })
  const restCands = toGeoCards(restaurants, restaurantSite, { excludeCityOnly: true })
  const spotAnchors = toGeoCards(spots, spotSite, { excludeCityOnly: false })
  const spotCands = toGeoCards(spots, spotSite, { excludeCityOnly: true })

  const cafeToRest = nearbyMap(cafeAnchors, restCands, limit)
  const cafeToSpot = nearbyMap(cafeAnchors, spotCands, limit)
  const restToCafe = nearbyMap(restAnchors, cafeCands, limit)
  const restToSpot = nearbyMap(restAnchors, spotCands, limit)
  const spotToCafe = nearbyMap(spotAnchors, cafeCands, limit)
  const spotToRest = nearbyMap(spotAnchors, restCands, limit)

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
