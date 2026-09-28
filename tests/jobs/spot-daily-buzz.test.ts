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

  it('activePerDay 상한을 넘기면 오래 안 잰 것부터 회전한다', async () => {
    // pending 과 같은 회전 방식을 active 에도 쓴다(2026-09-28) — GitHub
    // Actions 무료 한도 보호.
    const h = harness()
    const base = {
      sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, attributes: null, tags: ['자연/공원'],
    }
    h.deps.store.readSpots = async () => [
      { ...base, kakaoPlaceId: 's1', name: '장소s1' },
      { ...base, kakaoPlaceId: 's2', name: '장소s2' },
      { ...base, kakaoPlaceId: 's3', name: '장소s3' },
    ]
    h.deps.store.readSpotBuzz = async () =>
      [{ kakaoPlaceId: 's1', capturedAt: '2026-09-01' }] as never
    const r = await runSpotDailyBuzz(h.deps, { activePerDay: 2 })
    expect(r.updated).toBe(2)
    const byId = new Map(
      (h.buzz() as { kakaoPlaceId: string; capturedAt: string }[]).map((b) => [b.kakaoPlaceId, b]),
    )
    // s1 은 회전에서 빠져 예전 스냅샷 그대로다. s2·s3 만 오늘 날짜로 갱신됐다
    expect(byId.get('s1')!.capturedAt).toBe('2026-09-01')
    expect(byId.get('s2')!.capturedAt).toBe('2026-09-02')
    expect(byId.get('s3')!.capturedAt).toBe('2026-09-02')
  })
})
