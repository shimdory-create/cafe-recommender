import { describe, it, expect } from 'vitest'
import { runSpotLiveness } from '../../src/jobs/spot-liveness.js'
import type { Spot } from '../../src/spot-schema.js'

describe('runSpotLiveness', () => {
  it('찾은 장소는 확인 날짜를 새로 쓴다', async () => {
    const now = new Date('2026-09-02')
    let saved: Spot[] = [{
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
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
      local: {
        searchKeyword: async () => ({ places: [{ id: '1' } as never], payload: {} }),
      },
      now,
    }
    const r = await runSpotLiveness(deps)
    expect(r.seen).toBe(1)
    expect(saved[0]!.lastSeenAt).toBe(now.toISOString())
  })
})
