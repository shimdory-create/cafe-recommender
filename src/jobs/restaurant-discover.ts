import { RESTAURANT_SEARCH_KEYWORDS } from '../config/restaurant-keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { HOME, haversineKm, estimateDriveMinutes } from '../pipeline/geo.js'
import { evaluateRestaurantExclusion } from '../pipeline/restaurant-exclude.js'
import { belongsToRegion } from '../pipeline/region-match.js'
import { isAmbiguousRestaurantName } from '../pipeline/restaurant-relevance.js'
import { harvestCuratedRestaurants } from '../pipeline/restaurant-harvest.js'
import { recordFailure, recordQuotaError, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
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
  /** 하베스트(그물 C) LLM 쿼터가 소진돼 중단했는가 */
  quotaExhausted: boolean
}

/** weekly-discover.ts 의 QUOTA_GIVE_UP 과 같은 이유 */
const QUOTA_GIVE_UP = 3

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
  let quotaErrors = 0
  let quotaExhausted = false
  // weekly-discover.ts 와 같은 이유(2026-09-29 감사) — 그물별로 지역을 다
  // 돈 뒤 한 번만 성공을 기록한다. 지역마다 즉시 기록하면 실패 뒤에 온
  // 성공이 그 실패 증거를 지운다.
  let localAttempted = 0
  let localSucceeded = 0
  let harvestAttempted = 0
  let harvestSucceeded = 0

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
    localAttempted++
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
      localSucceeded++
    } catch (e) {
      errors.push(`${region.sigungu}: ${(e as Error).message}`)
      await recordFailure(store, 'kakao-local-restaurant', e, now)
    }

    if (opts.skipHarvest) continue
    harvestAttempted++
    try {
      const harvested = await harvestCuratedRestaurants({ blog, local, llm, store }, region)
      harvested.places.forEach((p) => add(p, region))
      harvestSucceeded++
      quotaErrors = 0
    } catch (e) {
      errors.push(`${region.sigungu} 수확: ${(e as Error).message}`)
      await recordFailure(store, 'harvest-restaurant', e, now)

      if (e instanceof SourceError && e.status === 429) {
        await recordQuotaError(store, 'harvest-restaurant', now)
        if (++quotaErrors >= QUOTA_GIVE_UP) {
          quotaExhausted = true
          break
        }
      } else {
        quotaErrors = 0
      }
    }
  }

  // **전부** 성공했을 때만 기록한다 — weekly-discover.ts 참고(2026-09-29
  // 감사 + 실사 중 발견, "하나라도 성공하면 성공"은 한 지역만 빼고 항상
  // 실패해도 영원히 건강하다고 나오는 재발 버그였다).
  if (localAttempted === 0 || localSucceeded === localAttempted) {
    await recordSuccess(store, 'kakao-local-restaurant', now)
  }
  if (opts.skipHarvest || harvestAttempted === 0 || harvestSucceeded === harvestAttempted) {
    await recordSuccess(store, 'harvest-restaurant', now)
  }

  await store.writeRestaurants([...byId.values()])
  return {
    discovered, excluded, offRegion: offRegionIds.size, total: byId.size, errors, quotaExhausted,
  }
}
