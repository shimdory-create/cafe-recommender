import { describe, it, expect } from 'vitest'
import { runRestaurantLiveness } from '../../src/jobs/restaurant-liveness.js'
import type { Restaurant } from '../../src/restaurant-schema.js'

describe('runRestaurantLiveness', () => {
  it('찾은 식당은 확인 날짜를 새로 쓴다', async () => {
    const now = new Date('2026-09-01')
    let saved: Restaurant[] = [{
      kakaoPlaceId: '1', name: '소문난식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, attributes: null, tags: ['한식'],
    }]
    let health: unknown[] = []
    const deps = {
      store: {
        readRestaurants: async () => saved,
        writeRestaurants: async (r: typeof saved) => { saved = r },
        appendRaw: async () => 'p',
        readHealth: async () => health as never,
        writeHealth: async (r: unknown[]) => { health = r },
      },
      local: {
        searchKeyword: async () => ({ places: [{ id: '1' } as never], payload: {} }),
      },
      now,
    }
    const r = await runRestaurantLiveness(deps)
    expect(r.seen).toBe(1)
    expect(saved[0]!.lastSeenAt).toBe(now.toISOString())
  })
})
