import { describe, it, expect } from 'vitest'
import { runRestaurantDriveTimes } from '../../src/jobs/restaurant-drive-times.js'
import type { Restaurant } from '../../src/restaurant-schema.js'

describe('runRestaurantDriveTimes', () => {
  it('driveMinutes 가 없는 곳만 잰다', async () => {
    let saved: Restaurant[] = [{
      kakaoPlaceId: '1', name: '소문난식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-01T00:00:00.000Z', status: 'active' as const,
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
      directions: {
        route: async () => ({ route: { minutes: 20, km: 8, tollWon: 0 }, payload: {} }),
      },
      now: new Date('2026-09-01'),
    }
    const r = await runRestaurantDriveTimes(deps)
    expect(r.measured).toBe(1)
    expect(saved[0]!.driveMinutes).toBe(20)
  })
})
