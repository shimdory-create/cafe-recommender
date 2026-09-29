import { SEARCH_KEYWORDS } from '../config/keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { haversineKm, estimateDriveMinutes, type LatLng } from '../pipeline/geo.js'
import { evaluateExclusion } from '../pipeline/exclude.js'
import { belongsToRegion } from '../pipeline/region-match.js'
import { isAmbiguousName } from '../pipeline/relevance.js'
import { harvestCurated } from '../pipeline/harvest.js'
import { recordFailure, recordQuotaError, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
import { resolveSigungu } from '../pipeline/district.js'
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
  /** 출발지 — 주지 않으면 cli/context.ts 배선 전 기본값을 쓴다 */
  home?: LatLng
}

export interface DiscoverResult {
  discovered: number
  excluded: number
  /** 동명 시군구 오염으로 버린 수 */
  offRegion: number
  total: number
  errors: string[]
  /** 하베스트(그물 C) LLM 쿼터가 소진돼 중단했는가 */
  quotaExhausted: boolean
}

/**
 * 하베스트(그물 C) 쿼터 오류가 이만큼 연속되면 그 회차는 포기한다.
 *
 * classify.ts 와 같은 이유 — 무료 티어 일일 한도를 넘기면 남은 지역 전부가
 * 같은 오류로 실패한다. 발굴은 지역 하나에도 여러 블로그 호출이 딸린
 * 38분짜리 잡이라, 계속 돌면 나머지 지역 전부가 그물 C 만 헛되이 실패하고
 * 그 시간만큼 러너를 붙잡아 둔다. 일찍 멈추는 것이 쿼터도 시간도 아낀다.
 */
const QUOTA_GIVE_UP = 3

/** 네이버지도 링크는 place ID 없이 검색 URL 로 만든다 (스펙 10절) */
export const naverMapUrl = (sigungu: string, name: string) =>
  `https://map.naver.com/p/search/${encodeURIComponent(`${sigungu} ${name}`)}`

function toCafe(p: KakaoPlace, region: Region, now: Date, home: LatLng): Cafe {
  const straightKm = haversineKm(home, { lat: p.lat, lng: p.lng })
  // 검색한 지역이 아니라 **주소의 행정구역**을 쓴다. 키워드 검색은 경계 너머
  // 카페도 주므로, 검색 지역을 그대로 저장하면 카드·지도 링크·지역 묶음이
  // 모두 어긋난다 (실측 20/299). 자세한 이유는 pipeline/district.ts.
  const sigungu = resolveSigungu({
    roadAddress: p.roadAddressName,
    address: p.addressName,
    scanned: region.sigungu,
  })
  return {
    kakaoPlaceId: p.id,
    name: p.placeName,
    sigungu,
    roadAddress: p.roadAddressName || null,
    address: p.addressName || null,
    lat: p.lat,
    lng: p.lng,
    categoryName: p.categoryName || null,
    kakaoPlaceUrl: p.placeUrl || null,
    naverMapUrl: naverMapUrl(sigungu, p.placeName),
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
  const {
    store, local, blog, llm, now = new Date(),
    home = { lat: 37.5151091, lng: 126.7398273 },
  } = deps
  const errors: string[] = []
  const existing = await store.readCafes()
  const byId = new Map<string, Cafe>(existing.map((c) => [c.kakaoPlaceId, c]))
  const blacklist: BlacklistEntry[] = await store.readBlacklist()
  let discovered = 0
  let excluded = 0
  // 같은 장소가 6개 키워드에 반복 등장하므로 id 로 센다
  const offRegionIds = new Set<string>()
  let quotaErrors = 0
  let quotaExhausted = false
  // 그물별로 지역을 다 돈 **뒤에 한 번만** 성공을 기록한다(2026-09-29 감사).
  // 지역마다 즉시 recordSuccess 를 찍으면, 실패한 지역 뒤에 성공한 지역이
  // 오면 그 실패 증거(lastError/consecutiveFailures)가 지워진다 — 실측
  // 순서가 성공 여부를 결정하는 건 우연이지 신호가 아니다.
  let localAttempted = 0
  let localSucceeded = 0
  let harvestAttempted = 0
  let harvestSucceeded = 0

  const add = (p: KakaoPlace, region: Region) => {
    if (!p.id || byId.has(p.id)) return
    // 카카오는 시도명을 붙여도 동명 시군구를 섞어 준다. 저장하지 않는다 —
    // 부산 카페가 cafes.json 에 들어가면 그 다음 모든 계산이 오염된다.
    if (!belongsToRegion(p, region)) {
      offRegionIds.add(p.id)
      return
    }
    const cafe = toCafe(p, region, now, home)
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
    localAttempted++
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
      localSucceeded++
    } catch (e) {
      errors.push(`${region.sigungu}: ${(e as Error).message}`)
      await recordFailure(store, 'kakao-local', e, now)
    }

    // --- 그물 C: 블로그 큐레이션 수확 (블로그 + LLM + 장소 정규화) ---
    if (opts.skipHarvest) continue
    harvestAttempted++
    try {
      const harvested = await harvestCurated({ blog, local, llm, store }, region)
      harvested.places.forEach((p) => add(p, region))
      harvestSucceeded++
      quotaErrors = 0
    } catch (e) {
      errors.push(`${region.sigungu} 수확: ${(e as Error).message}`)
      await recordFailure(store, 'harvest', e, now)

      // 쿼터 소진은 지역 문제가 아니라 그날의 한도 문제다. 계속 시도해도
      // 전부 같은 오류이므로 멈춘다.
      if (e instanceof SourceError && e.status === 429) {
        // classify.ts 와 같은 이유(2026-09-29) — 뒤에 통과하는 지역이
        // 하나라도 있으면 recordSuccess 가 lastError 를 지운다. 이 카운터는
        // 그것과 무관하게 오늘 쿼터 오류가 있었다는 사실을 남긴다.
        await recordQuotaError(store, 'harvest', now)
        if (++quotaErrors >= QUOTA_GIVE_UP) {
          quotaExhausted = true
          break
        }
      } else {
        quotaErrors = 0
      }
    }
  }

  // 그물별로 한 번만 성공을 기록한다 — **전부** 성공했을 때만이다(스킵도
  // 성공 취급). classify.ts 의 "하나라도 성공하면 성공"과는 다른 기준을
  // 쓴다 — 여기서 catch 에 걸리는 실패는 이미 rate limiter 가 내부에서
  // 4회 재시도한 뒤에도 남은 것이라 노이즈가 아니라 그 지역이 계속 아프다는
  // 뜻이다. "하나라도 성공하면 성공"으로 하면 1개 지역만 빼고 항상
  // 실패하는 상황도 영원히 건강하다고 나온다(2026-09-29 감사 + 실사 중
  // 발견 — 처음엔 하나라도 성공하면 성공으로 짰었는데, 마지막 지역만
  // 계속 성공하는 시나리오에서 앞선 지역들의 지속적 실패가 그대로 가려짐을
  // 검증 중 확인했다).
  if (localAttempted === 0 || localSucceeded === localAttempted) {
    await recordSuccess(store, 'kakao-local', now)
  }
  if (opts.skipHarvest || harvestAttempted === 0 || harvestSucceeded === harvestAttempted) {
    await recordSuccess(store, 'harvest', now)
  }

  await store.writeCafes([...byId.values()])
  return {
    discovered, excluded, offRegion: offRegionIds.size, total: byId.size, errors, quotaExhausted,
  }
}
