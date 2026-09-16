// src/site/nearby-payload.ts
import { nearestByDomain, type GeoPoint, type NearbyMatch } from './nearby.js'
import { buildPairIndex, lookupPair } from './nearby-drive-cache.js'
import { estimateDriveMinutes } from '../pipeline/geo.js'
import type { SiteCafe, NearbyDrivePair } from '../schema.js'
import type { SiteRestaurant } from '../restaurant-schema.js'
import type { SiteSpot } from '../spot-schema.js'

/** 근처 추천 파일에 실제로 저장하는 것 — 관계 정보뿐이다. 표시 필드(이름·
 * 이미지·태그·평점)와 directionsUrl 은 read 시점(웹)에서 리스트 페이로드를
 * id 로 조회해 조립한다(용량 축소 스펙 참고). */
export interface NearbyRelation {
  id: string
  distanceKm: number
  /** 실측 있으면 분 단위, 없으면 null */
  driveMinutes: number | null
}

export interface BuildNearbyInput {
  cafeSite: SiteCafe[]
  restaurantSite: SiteRestaurant[]
  spotSite: SiteSpot[]
  driveCache: NearbyDrivePair[]
  /** 직선거리 1차 필터 개수(2단계 K). 그 안에서만 실측 기준 재정렬한다 */
  preLimit: number
  limit: number
}

export interface NearbyPayloads {
  cafe: Record<string, { restaurants: NearbyRelation[]; spots: NearbyRelation[] }>
  restaurant: Record<string, { cafes: NearbyRelation[]; spots: NearbyRelation[] }>
  spot: Record<string, { cafes: NearbyRelation[]; restaurants: NearbyRelation[] }>
}

/**
 * site 페이로드에서 좌표만 뽑는다. 이제 site 페이로드 자체에 위경도가
 * 있으므로(용량 축소 스펙) 원본 배열과의 join이 필요 없다.
 *
 * `opts.excludeCityOnly`: 후보(다른 곳에 추천되는 쪽)를 만들 때는 true —
 * 도심 모드를 한 번도 안 켠 사용자에게 주차 어려운 곳이 섞여 들어가면
 * 안 된다. 앵커(자기 자신의 상세 페이지)를 만들 때는 false.
 */
function toGeoPoints(
  site: { id: string; lat: number; lng: number; cityOnly: boolean }[],
  opts: { excludeCityOnly: boolean },
): GeoPoint[] {
  const points: GeoPoint[] = []
  for (const s of site) {
    if (opts.excludeCityOnly && s.cityOnly) continue
    points.push({ id: s.id, lat: s.lat, lng: s.lng })
  }
  return points
}

/**
 * `directionsUrl`은 이제 여기서 계산하지 않는다 — 위경도가 있어야
 * 계산할 수 있는데, 그 위경도를 쓸 대상(앵커의 이름 등 표시 필드)이
 * read 시점 조립으로 옮겨갔기 때문이다. 캐시 조회는 id 문자열 두 개만
 * 있으면 되므로(`lookupPair`), 앵커도 `GeoCard` 객체가 아니라 id
 * 문자열로만 받는다.
 */
function toCards(
  anchorId: string,
  matches: NearbyMatch[],
  driveIndex: Map<string, NearbyDrivePair>,
  finalLimit: number,
): NearbyRelation[] {
  const withRank = matches.map((m) => {
    const hit = lookupPair(driveIndex, anchorId, m.id)
    const rankMinutes = hit ? hit.minutes : estimateDriveMinutes(m.distanceKm)
    return {
      relation: { id: m.id, distanceKm: m.distanceKm, driveMinutes: hit ? hit.minutes : null },
      rankMinutes,
    }
  })
  withRank.sort((a, b) => a.rankMinutes - b.rankMinutes)
  return withRank.slice(0, finalLimit).map((x) => x.relation)
}

/** anchors 각 항목에 대해 candidates 중 가까운 순 관계 목록을 만든다 */
function nearbyMap(
  anchors: GeoPoint[],
  candidates: GeoPoint[],
  driveIndex: Map<string, NearbyDrivePair>,
  preLimit: number,
  finalLimit: number,
): Map<string, NearbyRelation[]> {
  const matches = nearestByDomain(anchors, candidates, preLimit)
  const result = new Map<string, NearbyRelation[]>()
  for (const [anchorId, m] of matches) {
    result.set(anchorId, toCards(anchorId, m, driveIndex, finalLimit))
  }
  return result
}

export function buildNearbyPayloads(input: BuildNearbyInput): NearbyPayloads {
  const { cafeSite, restaurantSite, spotSite, driveCache, preLimit, limit } = input
  const driveIndex = buildPairIndex(driveCache)

  const cafeAnchors = toGeoPoints(cafeSite, { excludeCityOnly: false })
  const cafeCands = toGeoPoints(cafeSite, { excludeCityOnly: true })
  const restAnchors = toGeoPoints(restaurantSite, { excludeCityOnly: false })
  const restCands = toGeoPoints(restaurantSite, { excludeCityOnly: true })
  const spotAnchors = toGeoPoints(spotSite, { excludeCityOnly: false })
  const spotCands = toGeoPoints(spotSite, { excludeCityOnly: true })

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
