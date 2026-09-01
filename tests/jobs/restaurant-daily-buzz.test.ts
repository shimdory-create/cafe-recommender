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
})
