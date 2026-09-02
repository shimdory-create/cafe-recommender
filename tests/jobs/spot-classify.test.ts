import { describe, it, expect } from 'vitest'
import { runSpotClassify } from '../../src/jobs/spot-classify.js'

function harness() {
  let spots = [{
    kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
    firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'pending_extraction' as const,
    ambiguousName: false, attributes: null, tags: [],
  }]
  let health: unknown[] = []
  const deps = {
    store: {
      readSpots: async () => spots,
      writeSpots: async (r: typeof spots) => { spots = r },
      readSpotBuzz: async () => [{
        kakaoPlaceId: '1', capturedAt: '2026-09-02', receivedCount: 10, relevantCount: 8,
        precision: 0.8, spanDays: 20, postsPer30: 15, posts30d: 8, postsPrev: 4,
        firstPostDate: '2026-08-01', latestPostDate: '2026-08-30', acceleration: 1.5,
        suspectAmbiguous: false,
      }] as never,
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    llm: {
      modelVersion: 'fake-1',
      extract: async () => ({
        tags: ['자연/공원'], evidence: 'e', parkingGrade: 'A' as const, parkingEvidence: 'p',
        stayDuration: '1~2시간', indoorOutdoor: 'outdoor' as const, season: null,
        teenAppeal: 3, confidence: 0.8,
      }),
    } as never,
    now: new Date('2026-09-02'),
  }
  return { deps, spots: () => spots }
}

describe('runSpotClassify', () => {
  it('화제량 컷을 통과하면 판정해서 active 로 만든다', async () => {
    const h = harness()
    const r = await runSpotClassify(h.deps)
    expect(r.classified).toBe(1)
    expect(h.spots()[0]!.status).toBe('active')
    expect(h.spots()[0]!.tags).toContain('자연/공원')
  })
})
