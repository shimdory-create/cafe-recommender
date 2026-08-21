import { SEARCH_KEYWORDS } from '../config/keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { HOME, haversineKm, estimateDriveMinutes } from '../pipeline/geo.js'
import { evaluateExclusion } from '../pipeline/exclude.js'
import { belongsToRegion } from '../pipeline/region-match.js'
import { isAmbiguousName } from '../pipeline/relevance.js'
import { harvestCurated } from '../pipeline/harvest.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { Cafe, BlacklistEntry } from '../schema.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { LlmClient } from '../llm/types.js'
import type { Store } from '../store/types.js'

export interface DiscoverDeps {
  store: Pick<
    Store,
    'readCafes' | 'writeCafes' | 'readBlacklist' | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  local: {
    searchKeyword: (
      q: string,
      page: number,
    ) => Promise<{ places: KakaoPlace[]; isEnd: boolean; payload: unknown }>
  }
  blog: {
    search: (
      q: string,
      o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  llm: LlmClient
  now?: Date
}

export interface DiscoverResult {
  discovered: number
  excluded: number
  /** 동명 시군구 오염으로 버린 수 */
  offRegion: number
  total: number
  errors: string[]
}

/** 네이버지도 링크는 place ID 없이 검색 URL 로 만든다 (스펙 10절) */
export const naverMapUrl = (sigungu: string, name: string) =>
  `https://map.naver.com/p/search/${encodeURIComponent(`${sigungu} ${name}`)}`

function toCafe(p: KakaoPlace, region: Region, now: Date): Cafe {
  const straightKm = haversineKm(HOME, { lat: p.lat, lng: p.lng })
  return {
    kakaoPlaceId: p.id,
    name: p.placeName,
    sigungu: region.sigungu,
    roadAddress: p.roadAddressName || null,
    address: p.addressName || null,
    lat: p.lat,
    lng: p.lng,
    categoryName: p.categoryName || null,
    kakaoPlaceUrl: p.placeUrl || null,
    naverMapUrl: naverMapUrl(region.sigungu, p.placeName),
    phone: p.phone || null,
    straightKm: Number(straightKm.toFixed(2)),
    driveMinutesEst: estimateDriveMinutes(straightKm),
    firstSeenAt: now.toISOString(),
    // 신규는 pending_extraction. Layer 3 는 비용이 있으므로 별도 잡(classify)에서 한다.
    status: 'pending_extraction',
    excludeReason: null,
    ambiguousName: isAmbiguousName(p.placeName),
    attributes: null,
    tags: [],
  }
}

/**
 * 발굴 잡 — 그물 A(카카오 키워드) + 그물 C(블로그 큐레이션) -> Layer 1.
 *
 * 지역 하나가 실패해도 나머지를 계속 처리한다. health 에 기록하고 넘어간다
 * (스펙 6.6 원칙 1). 배치 전체가 한 지역 때문에 멈추지 않는다.
 */
export async function runDiscover(
  deps: DiscoverDeps,
  opts: { regions: Region[]; skipHarvest?: boolean },
): Promise<DiscoverResult> {
  const { store, local, blog, llm, now = new Date() } = deps
  const errors: string[] = []
  const existing = await store.readCafes()
  const byId = new Map<string, Cafe>(existing.map((c) => [c.kakaoPlaceId, c]))
  const blacklist: BlacklistEntry[] = await store.readBlacklist()
  let discovered = 0
  let excluded = 0
  // 같은 장소가 6개 키워드에 반복 등장하므로 id 로 센다
  const offRegionIds = new Set<string>()

  const add = (p: KakaoPlace, region: Region) => {
    if (!p.id || byId.has(p.id)) return
    // 카카오는 시도명을 붙여도 동명 시군구를 섞어 준다. 저장하지 않는다 —
    // 부산 카페가 cafes.json 에 들어가면 그 다음 모든 계산이 오염된다.
    if (!belongsToRegion(p, region)) {
      offRegionIds.add(p.id)
      return
    }
    const cafe = toCafe(p, region, now)
    const reason = evaluateExclusion(
      { name: p.placeName, categoryName: p.categoryName },
      blacklist,
    )
    if (reason) {
      cafe.status = 'excluded_auto'
      cafe.excludeReason = reason
      excluded++
    } else {
      discovered++
    }
    byId.set(p.id, cafe)
  }

  // 그물마다 따로 기록한다. 한 덩어리로 묶었더니 **수확(그물 C)의 LLM 실패가
  // `kakao-local` 실패로 적혔다** — 실측: kakao-local 에 "gemini HTTP 429" 가
  // 64건. 어디가 아픈지 모르는 건강 기록은 없는 것보다 나쁘다.
  for (const region of opts.regions) {
    try {
      // --- 그물 A: 키워드 검색 (시도명 포함 — 동명 시군구 때문) ---
      for (const kw of SEARCH_KEYWORDS) {
        const query = `${regionLabel(region)} ${kw}`
        for (let page = 1; page <= 3; page++) {
          const res = await local.searchKeyword(query, page)
          await store.appendRaw('kakao-local', query, res.payload, now)
          res.places.forEach((p) => add(p, region))
          if (res.isEnd) break
        }
      }
      await recordSuccess(store, 'kakao-local', now)
    } catch (e) {
      errors.push(`${region.sigungu}: ${(e as Error).message}`)
      await recordFailure(store, 'kakao-local', e, now)
    }

    // --- 그물 C: 블로그 큐레이션 수확 (블로그 + LLM + 장소 정규화) ---
    if (opts.skipHarvest) continue
    try {
      const harvested = await harvestCurated({ blog, local, llm, store }, region)
      harvested.places.forEach((p) => add(p, region))
      await recordSuccess(store, 'harvest', now)
    } catch (e) {
      errors.push(`${region.sigungu} 수확: ${(e as Error).message}`)
      await recordFailure(store, 'harvest', e, now)
    }
  }

  await store.writeCafes([...byId.values()])
  return { discovered, excluded, offRegion: offRegionIds.size, total: byId.size, errors }
}
