import { RESTAURANT_SEARCH_KEYWORDS } from '../config/restaurant-keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { HOME, haversineKm, estimateDriveMinutes } from '../pipeline/geo.js'
import { evaluateRestaurantExclusion } from '../pipeline/restaurant-exclude.js'
import { belongsToRegion } from '../pipeline/region-match.js'
import { isAmbiguousRestaurantName } from '../pipeline/restaurant-relevance.js'
import { harvestCuratedRestaurants } from '../pipeline/restaurant-harvest.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import { resolveSigungu } from '../pipeline/district.js'
import type { Restaurant, BlacklistEntry } from '../restaurant-schema.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { LlmClient } from '../llm/types.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export interface RestaurantDiscoverDeps {
  store: Pick<
    RestaurantStore,
    'readRestaurants' | 'writeRestaurants' | 'readBlacklist' | 'appendRaw'
    | 'readHealth' | 'writeHealth'
  >
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

export interface RestaurantDiscoverResult {
  discovered: number
  excluded: number
  offRegion: number
  total: number
  errors: string[]
}

export const restaurantNaverMapUrl = (sigungu: string, name: string) =>
  `https://map.naver.com/p/search/${encodeURIComponent(`${sigungu} ${name}`)}`

function toRestaurant(p: KakaoPlace, region: Region, now: Date): Restaurant {
  const straightKm = haversineKm(HOME, { lat: p.lat, lng: p.lng })
  const sigungu = resolveSigungu({
    roadAddress: p.roadAddressName, address: p.addressName, scanned: region.sigungu,
  })
  return {
    kakaoPlaceId: p.id, name: p.placeName, sigungu,
    roadAddress: p.roadAddressName || null, address: p.addressName || null,
    lat: p.lat, lng: p.lng, categoryName: p.categoryName || null,
    kakaoPlaceUrl: p.placeUrl || null, naverMapUrl: restaurantNaverMapUrl(sigungu, p.placeName),
    phone: p.phone || null, straightKm: Number(straightKm.toFixed(2)),
    driveMinutesEst: estimateDriveMinutes(straightKm), firstSeenAt: now.toISOString(),
    status: 'pending_extraction', excludeReason: null,
    ambiguousName: isAmbiguousRestaurantName(p.placeName), attributes: null, tags: [],
  }
}

export async function runRestaurantDiscover(
  deps: RestaurantDiscoverDeps,
  opts: { regions: Region[]; skipHarvest?: boolean },
): Promise<RestaurantDiscoverResult> {
  const { store, local, blog, llm, now = new Date() } = deps
  const errors: string[] = []
  const existing = await store.readRestaurants()
  const byId = new Map<string, Restaurant>(existing.map((r) => [r.kakaoPlaceId, r]))
  const blacklist: BlacklistEntry[] = await store.readBlacklist()
  let discovered = 0
  let excluded = 0
  const offRegionIds = new Set<string>()

  const add = (p: KakaoPlace, region: Region) => {
    if (!p.id || byId.has(p.id)) return
    if (!belongsToRegion(p, region)) {
      offRegionIds.add(p.id)
      return
    }
    const restaurant = toRestaurant(p, region, now)
    const reason = evaluateRestaurantExclusion(
      { name: p.placeName, categoryName: p.categoryName }, blacklist,
    )
    if (reason) {
      restaurant.status = 'excluded_auto'
      restaurant.excludeReason = reason
      excluded++
    } else {
      discovered++
    }
    byId.set(p.id, restaurant)
  }

  for (const region of opts.regions) {
    try {
      for (const kw of RESTAURANT_SEARCH_KEYWORDS) {
        const query = `${regionLabel(region)} ${kw}`
        for (let page = 1; page <= 3; page++) {
          const res = await local.searchKeyword(query, page)
          await store.appendRaw('kakao-local-restaurant', query, res.payload, now)
          res.places.forEach((p) => add(p, region))
          if (res.isEnd) break
        }
      }
      await recordSuccess(store, 'kakao-local-restaurant', now)
    } catch (e) {
      errors.push(`${region.sigungu}: ${(e as Error).message}`)
      await recordFailure(store, 'kakao-local-restaurant', e, now)
    }

    if (opts.skipHarvest) continue
    try {
      const harvested = await harvestCuratedRestaurants({ blog, local, llm, store }, region)
      harvested.places.forEach((p) => add(p, region))
      await recordSuccess(store, 'harvest-restaurant', now)
    } catch (e) {
      errors.push(`${region.sigungu} 수확: ${(e as Error).message}`)
      await recordFailure(store, 'harvest-restaurant', e, now)
    }
  }

  await store.writeRestaurants([...byId.values()])
  return { discovered, excluded, offRegion: offRegionIds.size, total: byId.size, errors }
}
