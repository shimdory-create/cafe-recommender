import { describe, it, expect } from 'vitest'
import { runSpotDriveTimes } from '../../src/jobs/spot-drive-times.js'
import type { Spot } from '../../src/spot-schema.js'

describe('runSpotDriveTimes', () => {
  it('driveMinutes 가 없는 곳만 잰다', async () => {
    let saved: Spot[] = [{
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, attributes: null, tags: ['자연/공원'],
    }]
    let health: unknown[] = []
    const deps = {
      store: {
        readSpots: async () => saved,
        writeSpots: async (r: typeof saved) => { saved = r },
        appendRaw: async () => 'p',
        readHealth: async () => health as never,
        writeHealth: async (r: unknown[]) => { health = r },
      },
      directions: {
        route: async () => ({ route: { minutes: 20, km: 8, tollWon: 0 }, payload: {} }),
      },
      now: new Date('2026-09-02'),
    }
    const r = await runSpotDriveTimes(deps)
    expect(r.measured).toBe(1)
    expect(saved[0]!.driveMinutes).toBe(20)
  })
})
