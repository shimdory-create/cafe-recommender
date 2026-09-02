import { describe, it, expect } from 'vitest'
import { runSpotDailyBuzz } from '../../src/jobs/spot-daily-buzz.js'

function harness() {
  let spots = [{
    kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
    firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'active' as const,
    ambiguousName: false, attributes: null, tags: ['자연/공원'],
  }]
  let buzz: unknown[] = []
  let health: unknown[] = []
  const deps = {
    store: {
      readSpots: async () => spots,
      writeSpots: async (r: typeof spots) => { spots = r },
      readSpotBuzz: async () => buzz as never,
      writeSpotBuzz: async (r: unknown[]) => { buzz = r },
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    blog: {
      search: async () => ({
        docs: [{
          title: '아무개공원 나들이 후기', contents: '아이들이랑 정말 좋았다',
          url: 'u', blogName: 'b',
          dateTime: new Date('2026-08-30'), thumbnail: 'https://img/1',
        }],
        payload: {},
      }),
    },
    now: new Date('2026-09-02'),
  }
  return { deps, buzz: () => buzz }
}

describe('runSpotDailyBuzz', () => {
  it('가볼 곳 관련성 판별로 화제량을 잰다', async () => {
    const h = harness()
    const r = await runSpotDailyBuzz(h.deps)
    expect(r.updated).toBe(1)
    expect((h.buzz()[0] as { relevantCount: number }).relevantCount).toBe(1)
  })
})
