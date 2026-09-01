import { describe, it, expect } from 'vitest'
import {
  runRestaurantClassify, orderPendingRestaurants, type RestaurantClassifyDeps,
} from '../../src/jobs/restaurant-classify.js'
import { SourceError } from '../../src/sources/rate-limiter.js'
import type { BuzzSnapshot } from '../../src/schema.js'
import type { Restaurant } from '../../src/restaurant-schema.js'

const NOW = new Date('2026-09-01T00:00:00Z')

const restaurant = (id: string, over: Partial<Restaurant> = {}): Restaurant => ({
  kakaoPlaceId: id,
  name: `식당${id}`,
  sigungu: '부평구',
  lat: 37.5,
  lng: 126.7,
  categoryName: '음식점 > 한식',
  firstSeenAt: '2026-08-01T00:00:00.000Z',
  status: 'pending_extraction',
  ambiguousName: false,
  attributes: null,
  tags: [],
  driveMinutesEst: 60,
  ...over,
})

const buzz = (id: string, over: Partial<BuzzSnapshot> = {}): BuzzSnapshot => ({
  kakaoPlaceId: id,
  capturedAt: '2026-08-19',
  receivedCount: 50,
  relevantCount: 35,
  precision: 0.7,
  spanDays: 17,
  postsPer30: 62,
  posts30d: 30,
  postsPrev: 10,
  firstPostDate: '2024-01-01',
  latestPostDate: '2026-08-19',
  acceleration: 1.5,
  suspectAmbiguous: false,
  ...over,
})

const goodAttrs = {
  cuisineType: '한식',
  evidence: 'e',
  parkingGrade: 'A' as const,
  parkingEvidence: 'p',
  hasRoom: true,
  reservable: true,
  viewStrength: 0,
  viewTypes: [],
  outdoorSeating: null,
  teenAppeal: 3,
  confidence: 0.8,
}

function harness(
  restaurants: Restaurant[],
  buzzRows: BuzzSnapshot[],
  over: Partial<RestaurantClassifyDeps> = {},
) {
  let saved = restaurants
  let health: unknown[] = []
  const deps: RestaurantClassifyDeps = {
    store: {
      readRestaurants: async () => saved,
      writeRestaurants: async (r) => { saved = r },
      readRestaurantBuzz: async () => buzzRows,
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r) => { health = r as never },
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    llm: { modelVersion: 'fake-1', extract: async () => goodAttrs as never } as never,
    now: NOW,
    ...over,
  }
  return { deps, saved: () => saved, health: () => health }
}

describe('runRestaurantClassify', () => {
  it('화제량 컷을 통과하면 판정해서 active 로 만든다', async () => {
    const h = harness(
      [restaurant('1')],
      [buzz('1')],
    )
    const r = await runRestaurantClassify(h.deps)
    expect(r.classified).toBe(1)
    expect(h.saved()[0]!.status).toBe('active')
    expect(h.saved()[0]!.tags).toContain('한식')
  })

  it('Layer 2 탈락은 LLM 을 호출하지 않고 excluded_auto 로 남긴다', async () => {
    let called = 0
    const h = harness(
      [restaurant('1')],
      [buzz('1', { precision: 0.1, postsPer30: 2 })],
      {
        llm: {
          modelVersion: 'v',
          extract: async () => { called++; return goodAttrs as never },
        } as never,
      },
    )
    const r = await runRestaurantClassify(h.deps)
    expect(called).toBe(0)
    expect(r.excluded).toBe(1)
    expect(h.saved()[0]!.status).toBe('excluded_auto')
    expect(h.saved()[0]!.excludeReason).toMatch(/정밀도/)
  })

  it('게이트 탈락은 excluded_auto 로 남긴다 (음식종류 불명 -> 태그 0개)', async () => {
    const h = harness(
      [restaurant('1')],
      [buzz('1')],
      {
        llm: {
          modelVersion: 'v',
          extract: async () => ({
            ...goodAttrs, cuisineType: null, hasRoom: false, reservable: false,
          }) as never,
        } as never,
      },
    )
    const r = await runRestaurantClassify(h.deps)
    expect(r.excluded).toBe(1)
    expect(h.saved()[0]!.status).toBe('excluded_auto')
    expect(h.saved()[0]!.tags).toEqual([])
    expect(h.saved()[0]!.excludeReason).toMatch(/동네/)
  })

  it('화제량 스냅샷이 없으면 건너뛴다 (탈락시키지 않는다)', async () => {
    const h = harness([restaurant('1')], [])
    const r = await runRestaurantClassify(h.deps)
    expect(r.skipped).toBe(1)
    expect(h.saved()[0]!.status).toBe('pending_extraction')
  })

  it('한 식당이 실패해도 나머지를 계속한다', async () => {
    let n = 0
    const h = harness(
      [restaurant('1'), restaurant('2')],
      [buzz('1'), buzz('2')],
      {
        llm: {
          modelVersion: 'v',
          extract: async () => {
            if (++n === 1) throw new Error('LLM 장애')
            return goodAttrs as never
          },
        } as never,
      },
    )
    const r = await runRestaurantClassify(h.deps)
    expect(r.failed).toBe(1)
    expect(r.classified).toBe(1)
  })

  it('LLM 쿼터가 소진되면 일찍 멈춘다', async () => {
    let llmCalls = 0
    const restaurants = Array.from({ length: 20 }, (_, i) => restaurant(String(i)))
    const h = harness(
      restaurants,
      restaurants.map((r) => buzz(r.kakaoPlaceId)),
      {
        llm: {
          modelVersion: 'v',
          extract: async () => {
            llmCalls++
            throw new SourceError('gemini HTTP 429: quota exceeded', 429)
          },
        } as never,
      },
    )
    const r = await runRestaurantClassify(h.deps)
    expect(r.quotaExhausted).toBe(true)
    expect(llmCalls).toBe(3)
    expect(r.failed).toBe(3)
    expect(h.saved().filter((x) => x.status === 'pending_extraction')).toHaveLength(20)
  })

  it("health 소스명은 'classify-restaurant' 다", async () => {
    const h = harness([restaurant('1')], [buzz('1')])
    await runRestaurantClassify(h.deps)
    expect(h.health()).toEqual([
      expect.objectContaining({ source: 'classify-restaurant' }),
    ])
  })

  it('limit 으로 처리량을 제한한다', async () => {
    const h = harness(
      [restaurant('1'), restaurant('2'), restaurant('3')],
      [buzz('1'), buzz('2'), buzz('3')],
    )
    const r = await runRestaurantClassify(h.deps, { limit: 2 })
    expect(r.classified).toBe(2)
    expect(h.saved().filter((x) => x.status === 'pending_extraction')).toHaveLength(1)
  })
})

describe('orderPendingRestaurants', () => {
  const near = [1, 2, 3, 4, 5].map((i) => restaurant(`n${i}`, { driveMinutes: 15 + i * 5 }))
  const hot = [1, 2, 3, 4, 5].map((i) => restaurant(`h${i}`, { driveMinutes: 95 - i * 5 }))
  const pending = [...near, ...hot]
  const latest = new Map<string, BuzzSnapshot>([
    ...near.map((r, i) => [r.kakaoPlaceId, { postsPer30: 2 - i * 0.2 } as BuzzSnapshot] as const),
    ...hot.map((r, i) => [r.kakaoPlaceId, { postsPer30: 50 - i * 4 } as BuzzSnapshot] as const),
  ])

  it('hot 은 화제량만 본다', () => {
    const out = orderPendingRestaurants(pending, latest, { order: 'hot', limit: 5 })
    expect(out.slice(0, 5).map((r) => r.kakaoPlaceId)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5'])
  })

  it('near 는 거리만 본다', () => {
    const out = orderPendingRestaurants(pending, latest, { order: 'near', limit: 5 })
    expect(out.slice(0, 5).map((r) => r.kakaoPlaceId)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5'])
  })

  it('mixed 는 하루 몫의 30% 를 가까운 곳에 준다', () => {
    const out = orderPendingRestaurants(pending, latest, { order: 'mixed', limit: 8 })
    expect(out.slice(0, 2).map((r) => r.kakaoPlaceId)).toEqual(['n1', 'n2'])
  })

  it('file 은 손대지 않는다', () => {
    expect(orderPendingRestaurants(pending, latest, { order: 'file' })).toBe(pending)
  })

  it('이동시간을 모르면 뒤로 보낸다', () => {
    const unknown = restaurant('z', { driveMinutes: null, driveMinutesEst: null })
    const out = orderPendingRestaurants([...pending, unknown], latest, { order: 'near' })
    expect(out.at(-1)!.kakaoPlaceId).toBe('z')
  })
})
