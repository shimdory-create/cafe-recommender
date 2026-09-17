import { SPOT_SEARCH_KEYWORDS } from '../config/spot-keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { HOME, haversineKm, estimateDriveMinutes } from '../pipeline/geo.js'
import { belongsToRegion } from '../pipeline/region-match.js'
import { isAmbiguousSpotName, isFoodCategory } from '../pipeline/spot-relevance.js'
import { harvestCuratedSpots } from '../pipeline/spot-harvest.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
import { resolveSigungu } from '../pipeline/district.js'
import type { Spot } from '../spot-schema.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { LlmClient } from '../llm/types.js'
import type { SpotStore } from '../store/spot-json-store.js'

export interface SpotDiscoverDeps {
  store: Pick<SpotStore, 'readSpots' | 'writeSpots' | 'appendRaw' | 'readHealth' | 'writeHealth'>
  local: {
    searchKeyword: (
      q: string, page: number,
    ) => Promise<{ places: KakaoPlace[]; isEnd: boolean; payload: unknown }>
  }
  blog: {
    search: (
      q: string, o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  llm: LlmClient
  now?: Date
}

export interface SpotDiscoverResult {
  discovered: number
  offRegion: number
  /** 카카오 분류가 음식점(카페 포함)이라 저장 자체를 안 한 곳 수 */
  foodCategory: number
  total: number
  errors: string[]
  /** 하베스트(그물 C) LLM 쿼터가 소진돼 중단했는가 */
  quotaExhausted: boolean
}

/** weekly-discover.ts 의 QUOTA_GIVE_UP 과 같은 이유 */
const QUOTA_GIVE_UP = 3

export const spotNaverMapUrl = (sigungu: string, name: string) =>
  `https://map.naver.com/p/search/${encodeURIComponent(`${sigungu} ${name}`)}`

function toSpot(p: KakaoPlace, region: Region, now: Date): Spot {
  const straightKm = haversineKm(HOME, { lat: p.lat, lng: p.lng })
  const sigungu = resolveSigungu({
    roadAddress: p.roadAddressName, address: p.addressName, scanned: region.sigungu,
  })
  return {
    kakaoPlaceId: p.id, name: p.placeName, sigungu,
    roadAddress: p.roadAddressName || null, address: p.addressName || null,
    lat: p.lat, lng: p.lng, categoryName: p.categoryName || null,
    kakaoPlaceUrl: p.placeUrl || null, naverMapUrl: spotNaverMapUrl(sigungu, p.placeName),
    phone: p.phone || null, straightKm: Number(straightKm.toFixed(2)),
    driveMinutesEst: estimateDriveMinutes(straightKm), firstSeenAt: now.toISOString(),
    status: 'pending_extraction', excludeReason: null,
    ambiguousName: isAmbiguousSpotName(p.placeName), attributes: null, tags: [],
  }
}

export async function runSpotDiscover(
  deps: SpotDiscoverDeps,
  opts: { regions: Region[]; skipHarvest?: boolean },
): Promise<SpotDiscoverResult> {
  const { store, local, blog, llm, now = new Date() } = deps
  const errors: string[] = []
  const existing = await store.readSpots()
  const byId = new Map<string, Spot>(existing.map((s) => [s.kakaoPlaceId, s]))
  let discovered = 0
  const offRegionIds = new Set<string>()
  const foodCategoryIds = new Set<string>()
  let quotaErrors = 0
  let quotaExhausted = false

  const add = (p: KakaoPlace, region: Region) => {
    if (!p.id || byId.has(p.id)) return
    if (!belongsToRegion(p, region)) {
      offRegionIds.add(p.id)
      return
    }
    if (isFoodCategory(p.categoryName)) {
      foodCategoryIds.add(p.id)
      return
    }
    byId.set(p.id, toSpot(p, region, now))
    discovered++
  }

  for (const region of opts.regions) {
    try {
      for (const kw of SPOT_SEARCH_KEYWORDS) {
        const query = `${regionLabel(region)} ${kw}`
        for (let page = 1; page <= 3; page++) {
          const res = await local.searchKeyword(query, page)
          await store.appendRaw('kakao-local-spot', query, res.payload, now)
          res.places.forEach((p) => add(p, region))
          if (res.isEnd) break
        }
      }
      await recordSuccess(store, 'kakao-local-spot', now)
    } catch (e) {
      errors.push(`${region.sigungu}: ${(e as Error).message}`)
      await recordFailure(store, 'kakao-local-spot', e, now)
    }

    if (opts.skipHarvest) continue
    try {
      const harvested = await harvestCuratedSpots({ blog, local, llm, store }, region)
      harvested.places.forEach((p) => add(p, region))
      await recordSuccess(store, 'harvest-spot', now)
      quotaErrors = 0
    } catch (e) {
      errors.push(`${region.sigungu} 수확: ${(e as Error).message}`)
      await recordFailure(store, 'harvest-spot', e, now)

      if (e instanceof SourceError && e.status === 429) {
        if (++quotaErrors >= QUOTA_GIVE_UP) {
          quotaExhausted = true
          break
        }
      } else {
        quotaErrors = 0
      }
    }
  }

  await store.writeSpots([...byId.values()])
  return {
    discovered, offRegion: offRegionIds.size, foodCategory: foodCategoryIds.size,
    total: byId.size, errors, quotaExhausted,
  }
}
