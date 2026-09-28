import { describe, it, expect } from 'vitest'
import { runSpotDailyBuzz } from '../../src/jobs/spot-daily-buzz.js'
import type { Spot } from '../../src/spot-schema.js'

function harness() {
  let spots: Spot[] = [{
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
  return { deps, buzz: () => buzz, spots: () => spots }
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

describe('runSpotDailyBuzz — 화제 식음 후보 (dormant)', () => {
  const NOW = new Date('2026-09-02')
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
  const oldEnough = daysAgo(200)

  it('21일 연속 기준 미달이면 dormant 로 넘어간다', async () => {
    const h = harness()
    h.deps.store.readSpots = async () => [
      { ...h.spots()[0]!, firstSeenAt: oldEnough, quietSince: daysAgo(21) },
    ]
    h.deps.blog.search = async () => ({ docs: [], payload: {} })
    const r = await runSpotDailyBuzz(h.deps)
    expect(r.dormant).toBe(1)
    expect(h.spots()[0]!.status).toBe('dormant')
    expect(h.spots()[0]!.excludeReason).toMatch(/화제 식음/)
  })

  it('기준 미달이 21일 미만이면 아직 active 로 남는다', async () => {
    const h = harness()
    h.deps.store.readSpots = async () => [
      { ...h.spots()[0]!, firstSeenAt: oldEnough, quietSince: daysAgo(10) },
    ]
    h.deps.blog.search = async () => ({ docs: [], payload: {} })
    const r = await runSpotDailyBuzz(h.deps)
    expect(r.dormant).toBe(0)
    expect(h.spots()[0]!.status).toBe('active')
  })

  it('등록한 지 180일이 안 됐으면 화제량이 없어도 넘어가지 않는다', async () => {
    const h = harness()
    h.deps.store.readSpots = async () => [
      { ...h.spots()[0]!, firstSeenAt: daysAgo(30), quietSince: null },
    ]
    h.deps.blog.search = async () => ({ docs: [], payload: {} })
    const r = await runSpotDailyBuzz(h.deps)
    expect(r.dormant).toBe(0)
    expect(h.spots()[0]!.status).toBe('active')
  })

  it('화제량이 다시 기준을 넘으면 streak 를 초기화한다', async () => {
    const h = harness()
    h.deps.store.readSpots = async () => [
      { ...h.spots()[0]!, firstSeenAt: oldEnough, quietSince: daysAgo(25) },
    ]
    const r = await runSpotDailyBuzz(h.deps)
    expect(r.dormant).toBe(0)
    expect(h.spots()[0]!.status).toBe('active')
    expect(h.spots()[0]!.quietSince).toBeNull()
  })
})
