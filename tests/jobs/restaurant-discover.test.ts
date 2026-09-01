import { describe, it, expect } from 'vitest'
import { runRestaurantDiscover } from '../../src/jobs/restaurant-discover.js'
import type { Region } from '../../src/config/regions.js'

const region: Region = { sido: '인천', sigungu: '부평구', excluded: false } as unknown as Region

function harness() {
  let saved: unknown[] = []
  let health: unknown[] = []
  const deps = {
    store: {
      readRestaurants: async () => saved as never,
      writeRestaurants: async (r: unknown[]) => { saved = r },
      readBlacklist: async () => [],
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    local: {
      searchKeyword: async () => ({
        places: [{
          id: '1', placeName: '소문난식당', roadAddressName: '인천 부평구 1',
          addressName: '인천 부평구 1', lat: 37.5, lng: 126.7, categoryName: '음식점 > 한식',
          placeUrl: '', phone: '',
        }],
        isEnd: true, payload: {},
      }),
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
})
