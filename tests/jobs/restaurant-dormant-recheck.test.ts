import { describe, it, expect } from 'vitest'
import {
  runRestaurantDormantRecheck, type RestaurantDormantRecheckDeps,
} from '../../src/jobs/restaurant-dormant-recheck.js'
import type { Restaurant } from '../../src/restaurant-schema.js'
import type { BlogDoc } from '../../src/sources/kakao-blog.js'

const NOW = new Date('2026-09-28T00:00:00Z')

const restaurant = (id: string, over: Partial<Restaurant> = {}): Restaurant => ({
  kakaoPlaceId: id,
  name: `식당${id}`,
  sigungu: '부평구',
  lat: 37.5,
  lng: 126.7,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  status: 'dormant',
  excludeReason: '화제 식음 — 21일 연속 화제량 미달',
  quietSince: '2026-08-01',
  ambiguousName: false,
  tags: ['한식'],
  attributes: null,
  ...over,
})

const doc = (over: Partial<BlogDoc>): BlogDoc => ({
  title: '', contents: '', url: 'u', blogName: 'b', dateTime: NOW, thumbnail: '', ...over,
})

function harness(input: Restaurant[]) {
  let restaurants = input
  let buzz: unknown[] = []
  const deps: RestaurantDormantRecheckDeps = {
    store: {
      readRestaurants: async () => restaurants,
      writeRestaurants: async (r) => { restaurants = r },
      readRestaurantBuzz: async () => buzz as never,
      writeRestaurantBuzz: async (r) => { buzz = r },
      appendRaw: async () => 'p',
      readHealth: async () => [],
      writeHealth: async () => {},
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    now: NOW,
  }
  return { deps, restaurants: () => restaurants }
}

describe('runRestaurantDormantRecheck', () => {
  it('화제량이 없으면 그대로 dormant 다', async () => {
    const h = harness([restaurant('1')])
    const r = await runRestaurantDormantRecheck(h.deps)
    expect(r.checked).toBe(1)
    expect(r.stillQuiet).toBe(1)
    expect(h.restaurants()[0]!.status).toBe('dormant')
  })

  it('화제량이 회복됐으면 active 로 되돌린다', async () => {
    const h = harness([restaurant('1')])
    h.deps.blog.search = async () => ({
      docs: [
        doc({ title: '식당1 맛집 후기', contents: '정말 맛있었다' }),
        doc({ title: '식당1 맛집 후기2', contents: '또 갔다' }),
      ],
      payload: {},
    })
    const r = await runRestaurantDormantRecheck(h.deps)
    expect(r.recovered).toBe(1)
    expect(h.restaurants()[0]!.status).toBe('active')
    expect(h.restaurants()[0]!.quietSince).toBeNull()
  })

  it('active 식당은 건드리지 않는다', async () => {
    const h = harness([restaurant('1', { status: 'active', quietSince: null })])
    expect((await runRestaurantDormantRecheck(h.deps)).checked).toBe(0)
  })
})
