import { nearestByDomain, type GeoPoint } from './nearby.js'
import { pairKeyOf } from './nearby-drive-cache.js'
import type { Cafe } from '../schema.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { Spot } from '../spot-schema.js'
import type { NearbyDrivePair } from '../schema.js'

export interface PlannedFetch {
  anchorId: string
  candidateId: string
}

export interface PlanInput {
  cafes: Cafe[]
  restaurants: Restaurant[]
  spots: Spot[]
  cacheIndex: Map<string, NearbyDrivePair>
  preLimit: number
  budget: number
}

interface RawPoint extends GeoPoint {
  cityOnly: boolean
}

type RawRow = { kakaoPlaceId: string; lat: number; lng: number; status: string; attributes: { parkingGrade?: string } | null | undefined }

/**
 * status active 만 남기고 원본 좌표로 변환한다. cityOnly는
 * parkingGrade === 'C' 로 직접 계산한다(payload.ts 세 곳과 같은 규칙) —
 * 이 잡은 site 최종 페이로드가 없으므로 원본에서 바로 판단한다.
 */
function toRawPoints(rows: RawRow[]): RawPoint[] {
  return rows
    .filter((r) => r.status === 'active')
    .map((r) => ({
      id: r.kakaoPlaceId, lat: r.lat, lng: r.lng,
      cityOnly: r.attributes?.parkingGrade === 'C',
    }))
}

export function planNearbyDriveFetches(input: PlanInput): PlannedFetch[] {
  const { cafes, restaurants, spots, cacheIndex, preLimit, budget } = input

  const cafeAll = toRawPoints(cafes as RawRow[])
  const restAll = toRawPoints(restaurants as RawRow[])
  const spotAll = toRawPoints(spots as RawRow[])
  const cands = (all: RawPoint[]) => all.filter((p) => !p.cityOnly)

  const directionPairs: [RawPoint[], RawPoint[]][] = [
    [cafeAll, cands(restAll)], [cafeAll, cands(spotAll)],
    [restAll, cands(cafeAll)], [restAll, cands(spotAll)],
    [spotAll, cands(cafeAll)], [spotAll, cands(restAll)],
  ]

  const seen = new Set(cacheIndex.keys())
  const out: PlannedFetch[] = []
  for (const [anchors, candidates] of directionPairs) {
    const matches = nearestByDomain(anchors, candidates, preLimit)
    for (const [anchorId, list] of matches) {
      for (const m of list) {
        if (out.length >= budget) return out
        const key = pairKeyOf(anchorId, m.id)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ anchorId, candidateId: m.id })
      }
    }
  }
  return out
}
