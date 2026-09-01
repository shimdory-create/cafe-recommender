import { describe, it, expect } from 'vitest'
import { runRestaurantDiscover } from '../../src/jobs/restaurant-discover.js'
import type { Region } from '../../src/config/regions.js'
import type { KakaoPlace } from '../../src/sources/kakao-local.js'
import type { BlacklistEntry } from '../../src/restaurant-schema.js'

const region: Region = { sido: '인천', sigungu: '부평구', excluded: false } as unknown as Region

const basePlace: KakaoPlace = {
  id: '1', placeName: '소문난식당', roadAddressName: '인천 부평구 1',
  addressName: '인천 부평구 1', lat: 37.5, lng: 126.7, categoryName: '음식점 > 한식',
  placeUrl: '', phone: '',
}

function harness(opts?: {
  searchKeyword?: (q: string, page: number) => Promise<{
    places: KakaoPlace[]; isEnd: boolean; payload: unknown
  }>
  blacklist?: BlacklistEntry[]
}) {
  let saved: unknown[] = []
  let health: unknown[] = []
  const deps = {
    store: {
      readRestaurants: async () => saved as never,
      writeRestaurants: async (r: unknown[]) => { saved = r },
      readBlacklist: async () => opts?.blacklist ?? [],
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    local: {
      searchKeyword: opts?.searchKeyword ?? (async () => ({
        places: [basePlace],
        isEnd: true, payload: {},
      })),
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    llm: { modelVersion: 'fake-1', extract: async () => ({ names: [] }) } as never,
    now: new Date('2026-09-01'),
  }
  return { deps, saved: () => saved }
}

describe('runRestaurantDiscover', () => {
  it('카카오 키워드 검색으로 찾은 식당을 pending_extraction 으로 넣는다', async () => {
    const h = harness()
    const r = await runRestaurantDiscover(h.deps, { regions: [region], skipHarvest: true })
    expect(r.discovered).toBe(1)
    expect((h.saved()[0] as { status: string }).status).toBe('pending_extraction')
  })

  it('같은 카카오 place id 는 여러 검색어에 걸쳐 나와도 한 건으로 합친다', async () => {
    const queriesSeen: string[] = []
    const h = harness({
      searchKeyword: async (q) => {
        queriesSeen.push(q)
        // every keyword query returns the exact same place id
        return { places: [basePlace], isEnd: true, payload: {} }
      },
    })
    const r = await runRestaurantDiscover(h.deps, { regions: [region], skipHarvest: true })
    // sanity: the mock really was hit with more than one distinct keyword query
    expect(new Set(queriesSeen).size).toBeGreaterThan(1)
    expect(r.discovered).toBe(1)
    expect(r.total).toBe(1)
    expect(h.saved()).toHaveLength(1)
  })

  it('블랙리스트에 걸리는 식당은 excluded_auto 로 저장한다', async () => {
    const blacklist: BlacklistEntry[] = [
      { pattern: '소문난식당', matchType: 'exact' },
    ]
    const h = harness({ blacklist })
    const r = await runRestaurantDiscover(h.deps, { regions: [region], skipHarvest: true })
    expect(r.discovered).toBe(0)
    expect(r.excluded).toBe(1)
    const saved = h.saved() as { status: string; excludeReason: string | null }[]
    expect(saved).toHaveLength(1)
    expect(saved[0].status).toBe('excluded_auto')
    expect(saved[0].excludeReason).toBe('franchise')
  })

  it('지역 밖 장소는 저장하지 않고 offRegion 카운트만 올린다', async () => {
    const offRegionPlace: KakaoPlace = {
      ...basePlace,
      id: '2',
      addressName: '부산 강서구 1',
      roadAddressName: '부산 강서구 1',
    }
    const h = harness({
      searchKeyword: async () => ({ places: [offRegionPlace], isEnd: true, payload: {} }),
    })
    const r = await runRestaurantDiscover(h.deps, { regions: [region], skipHarvest: true })
    expect(r.discovered).toBe(0)
    expect(r.offRegion).toBe(1)
    expect(r.total).toBe(0)
    expect(h.saved()).toHaveLength(0)
  })
})
