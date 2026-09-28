import { describe, it, expect } from 'vitest'
import { runRestaurantDailyBuzz } from '../../src/jobs/restaurant-daily-buzz.js'
import type { Restaurant } from '../../src/restaurant-schema.js'
import type { BlogDoc } from '../../src/sources/kakao-blog.js'

const doc = (over: Partial<BlogDoc>): BlogDoc => ({
  title: '', contents: '', url: 'u', blogName: 'b',
  dateTime: new Date('2026-08-30'), thumbnail: '',
  ...over,
})

function harness() {
  let restaurants: Restaurant[] = [{
    kakaoPlaceId: '1', name: '소문난식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
    firstSeenAt: '2026-09-01T00:00:00.000Z', status: 'active' as const,
    ambiguousName: false, attributes: null, tags: ['한식'],
  }]
  let buzz: unknown[] = []
  let health: unknown[] = []
  const deps = {
    store: {
      readRestaurants: async () => restaurants,
      writeRestaurants: async (r: typeof restaurants) => { restaurants = r },
      readRestaurantBuzz: async () => buzz as never,
      writeRestaurantBuzz: async (r: unknown[]) => { buzz = r },
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    blog: {
      search: async () => ({
        docs: [doc({
          title: '소문난식당 맛집 후기', contents: '정말 맛있었다',
          thumbnail: 'https://img/1',
        })],
        payload: {},
      }),
    },
    now: new Date('2026-09-01'),
  }
  return { deps, restaurants: () => restaurants, buzz: () => buzz, health: () => health }
}

describe('runRestaurantDailyBuzz', () => {
  it('식당 관련성 판별로 화제량을 잰다', async () => {
    const h = harness()
    const r = await runRestaurantDailyBuzz(h.deps)
    expect(r.updated).toBe(1)
    expect((h.buzz()[0] as { relevantCount: number }).relevantCount).toBe(1)
  })

  it('카페 문맥어만 있고 식당 문맥어가 없는 글은 관련 없음으로 판별한다 (isRestaurantRelevant 주입 검증)', async () => {
    // "카페" 는 카페 기본 관련성 판별기(isRelevant)의 문맥어이지 식당 문맥어가
    // 아니다. 이 잡이 isRestaurantRelevant 대신 카페 기본값에 의존하면
    // (computeBuzz/pickThumbnail 옵션을 빠뜨리면) 이 글이 잘못 통과된다.
    const h = harness()
    h.deps.blog.search = async () => ({
      docs: [doc({
        title: '소문난식당 카페 후기', contents: '분위기가 좋았다',
        thumbnail: 'https://img/wrong.jpg',
      })],
      payload: {},
    })
    const r = await runRestaurantDailyBuzz(h.deps)
    expect(r.updated).toBe(1)
    expect((h.buzz()[0] as { relevantCount: number }).relevantCount).toBe(0)
    // 관련 없는 글의 썸네일은 대표 이미지로 쓰지 않는다
    expect(r.images).toBe(0)
    expect(h.restaurants()[0]!.imageUrl).toBeUndefined()
  })

  it('한 식당이 실패해도 나머지를 계속 조회하고 처리한다', async () => {
    const h = harness()
    h.deps.store.readRestaurants = async () => [
      { ...h.restaurants()[0]!, kakaoPlaceId: '1', name: '실패식당' },
      { ...h.restaurants()[0]!, kakaoPlaceId: '2', name: '성공식당' },
    ]
    let n = 0
    h.deps.blog.search = async () => {
      n++
      if (n === 1) throw new Error('장애')
      return {
        docs: [doc({
          title: '성공식당 맛집 후기', contents: '정말 맛있었다',
          thumbnail: 'https://img/2',
        })],
        payload: {},
      }
    }
    const r = await runRestaurantDailyBuzz(h.deps)
    // 첫 식당(1)이 실패해도 두 번째 식당(2)까지 조회가 이어져야 한다
    expect(n).toBe(2)
    expect(r.failed).toBe(1)
    expect(r.updated).toBe(1)
    expect(h.buzz()).toHaveLength(1)
    expect((h.buzz()[0] as { kakaoPlaceId: string }).kakaoPlaceId).toBe('2')

    // 실패는 즉시 health 에 실패로 기록된다 (같은 실행에서 다른 항목이
    // 성공해 recordSuccess 로 덮여도, 기록이 아예 안 남는 것과는 다르다)
    const healthRows = h.health() as { source: string }[]
    expect(healthRows.some((r2) => r2.source === 'kakao-blog-restaurant')).toBe(true)
  })

  it('activePerDay 상한을 넘기면 오래 안 잰 것부터 회전한다', async () => {
    // 예전엔 active 식당 전체를 무조건 매일 쟀다 — 식당이 4,200여 곳까지
    // 늘면서 이 잡 혼자 하루 20분대까지 커져 GitHub Actions 무료 한도
    // 소진의 주원인이 됐다(2026-09월). pending 과 같은 회전 방식을 쓴다.
    const base = { ...harness().restaurants()[0]! }
    const h = harness()
    h.deps.store.readRestaurants = async () => [
      { ...base, kakaoPlaceId: 'r1', name: '식당r1' },
      { ...base, kakaoPlaceId: 'r2', name: '식당r2' },
      { ...base, kakaoPlaceId: 'r3', name: '식당r3' },
    ]
    // r1 만 이미 쟀다 -> r2·r3 가 우선이다
    h.deps.store.readRestaurantBuzz = async () =>
      [{ kakaoPlaceId: 'r1', capturedAt: '2026-08-31' }] as never
    const r = await runRestaurantDailyBuzz(h.deps, { activePerDay: 2 })
    expect(r.updated).toBe(2)
    const byId = new Map(
      (h.buzz() as { kakaoPlaceId: string; capturedAt: string }[]).map((b) => [b.kakaoPlaceId, b]),
    )
    // r1 은 회전에서 빠져 예전 스냅샷 그대로다. r2·r3 만 오늘 날짜로 갱신됐다
    expect(byId.get('r1')!.capturedAt).toBe('2026-08-31')
    expect(byId.get('r2')!.capturedAt).toBe('2026-09-01')
    expect(byId.get('r3')!.capturedAt).toBe('2026-09-01')
  })
})

describe('runRestaurantDailyBuzz — 화제 식음 후보 (dormant)', () => {
  const NOW = new Date('2026-09-01')
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
  const oldEnough = daysAgo(200) // 180일 유예를 지난 등록일

  it('21일 연속 기준 미달이면 dormant 로 넘어간다', async () => {
    const h = harness()
    h.deps.store.readRestaurants = async () => [
      { ...h.restaurants()[0]!, firstSeenAt: oldEnough, quietSince: daysAgo(21) },
    ]
    h.deps.blog.search = async () => ({ docs: [], payload: {} })
    const r = await runRestaurantDailyBuzz(h.deps)
    expect(r.dormant).toBe(1)
    expect(h.restaurants()[0]!.status).toBe('dormant')
    expect(h.restaurants()[0]!.excludeReason).toMatch(/화제 식음/)
  })

  it('기준 미달이 21일 미만이면 아직 active 로 남는다', async () => {
    const h = harness()
    h.deps.store.readRestaurants = async () => [
      { ...h.restaurants()[0]!, firstSeenAt: oldEnough, quietSince: daysAgo(10) },
    ]
    h.deps.blog.search = async () => ({ docs: [], payload: {} })
    const r = await runRestaurantDailyBuzz(h.deps)
    expect(r.dormant).toBe(0)
    expect(h.restaurants()[0]!.status).toBe('active')
  })

  it('등록한 지 180일이 안 됐으면 화제량이 없어도 넘어가지 않는다', async () => {
    const h = harness()
    h.deps.store.readRestaurants = async () => [
      { ...h.restaurants()[0]!, firstSeenAt: daysAgo(30), quietSince: null },
    ]
    h.deps.blog.search = async () => ({ docs: [], payload: {} })
    const r = await runRestaurantDailyBuzz(h.deps)
    expect(r.dormant).toBe(0)
    expect(h.restaurants()[0]!.status).toBe('active')
  })

  it('화제량이 다시 기준을 넘으면 streak 를 초기화한다', async () => {
    const h = harness()
    h.deps.store.readRestaurants = async () => [
      { ...h.restaurants()[0]!, firstSeenAt: oldEnough, quietSince: daysAgo(25) },
    ]
    // 기본 harness 의 blog.search 는 최근 글을 주므로 신규 오픈 구제로 통과한다
    const r = await runRestaurantDailyBuzz(h.deps)
    expect(r.dormant).toBe(0)
    expect(h.restaurants()[0]!.status).toBe('active')
    expect(h.restaurants()[0]!.quietSince).toBeNull()
  })
})
