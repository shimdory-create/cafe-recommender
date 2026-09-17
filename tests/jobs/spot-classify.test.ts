import { describe, it, expect } from 'vitest'
import { runSpotClassify } from '../../src/jobs/spot-classify.js'

const NOW = new Date('2026-09-02')

function harness(opts?: {
  spots?: {
    kakaoPlaceId: string
    name: string
    sigungu: string
    lat: number
    lng: number
    firstSeenAt: string
    status: 'pending_extraction' | 'active' | 'hidden' | 'excluded_auto'
    ambiguousName: boolean
    attributes: null
    tags: string[]
    categoryName?: string
    excludeReason?: string | null
  }[]
  buzz?: unknown[]
  llm?: { modelVersion: string; extract: (...a: never[]) => Promise<unknown> }
}) {
  let spots = opts?.spots ?? [{
    kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
    firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'pending_extraction' as const,
    ambiguousName: false, attributes: null, tags: [],
  }]
  let health: { source: string; lastSuccessAt: string | null }[] = []
  const deps = {
    store: {
      readSpots: async () => spots,
      writeSpots: async (r: typeof spots) => { spots = r },
      readSpotBuzz: async () => (opts?.buzz ?? [{
        kakaoPlaceId: '1', capturedAt: '2026-09-02', receivedCount: 10, relevantCount: 8,
        precision: 0.8, spanDays: 20, postsPer30: 15, posts30d: 8, postsPrev: 4,
        firstPostDate: '2026-08-01', latestPostDate: '2026-08-30', acceleration: 1.5,
        suspectAmbiguous: false,
      }]) as never,
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r as never },
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    llm: (opts?.llm ?? {
      modelVersion: 'fake-1',
      extract: async () => ({
        tags: ['자연/공원'], evidence: 'e', parkingGrade: 'A' as const, parkingEvidence: 'p',
        stayDuration: '1~2시간', indoorOutdoor: 'outdoor' as const, season: null,
        teenAppeal: 3, confidence: 0.8,
      }),
    }) as never,
    now: NOW,
  }
  return { deps, spots: () => spots, health: () => health }
}

describe('runSpotClassify', () => {
  it('화제량 컷을 통과하면 판정해서 active 로 만든다', async () => {
    const h = harness()
    const r = await runSpotClassify(h.deps)
    expect(r.classified).toBe(1)
    expect(h.spots()[0]!.status).toBe('active')
    expect(h.spots()[0]!.tags).toContain('자연/공원')
  })

  it('카카오 분류가 음식점이면 LLM을 호출하지 않고 바로 배제한다', async () => {
    let llmCalls = 0
    const h = harness({
      spots: [{
        kakaoPlaceId: '1', name: '어떤카페', sigungu: '부평구', lat: 37.5, lng: 126.7,
        firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'pending_extraction' as const,
        ambiguousName: false, attributes: null, tags: [],
        categoryName: '음식점 > 카페 > 커피전문점',
      }],
      llm: { modelVersion: 'v', extract: async () => { llmCalls++; return {} } },
    })
    const r = await runSpotClassify(h.deps)
    expect(r.excluded).toBe(1)
    expect(h.spots()[0]!.status).toBe('excluded_auto')
    expect(h.spots()[0]!.excludeReason).toBe('음식점으로 분류됨 (가볼 곳 아님)')
    expect(llmCalls).toBe(0)
  })

  it('판정 대기가 0곳이면(정상적으로 빈 큐) 그래도 성공을 기록한다', async () => {
    const h = harness({ spots: [], buzz: [] })
    const r = await runSpotClassify(h.deps)
    expect(r.classified + r.excluded).toBe(0)
    const health = h.health().find((x) => x.source === 'classify-spot')
    expect(health?.lastSuccessAt).toBe(NOW.toISOString())
  })

  it('대기 중인 가볼 곳이 있는데 전부 실패하면 성공을 기록하지 않는다', async () => {
    const h = harness({
      llm: { modelVersion: 'v', extract: async () => { throw new Error('이상한 응답') } },
    })
    const r = await runSpotClassify(h.deps)
    expect(r.classified + r.excluded).toBe(0)
    expect(r.failed).toBe(1)
    const health = h.health().find((x) => x.source === 'classify-spot')
    expect(health?.lastSuccessAt).toBeFalsy()
  })
})
