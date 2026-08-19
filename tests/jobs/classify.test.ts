import { describe, it, expect } from 'vitest'
import { runClassify, type ClassifyDeps } from '../../src/jobs/classify.js'
import type { BuzzSnapshot, Cafe } from '../../src/schema.js'

const NOW = new Date('2026-08-20T00:00:00Z')

const cafe = (id: string, over: Partial<Cafe> = {}): Cafe => ({
  kakaoPlaceId: id,
  name: `카페${id}`,
  sigungu: '양평군',
  lat: 37.49,
  lng: 127.48,
  categoryName: '음식점 > 카페',
  firstSeenAt: '2026-08-01T00:00:00.000Z',
  status: 'pending_extraction',
  ambiguousName: false,
  attributes: null,
  tags: [],
  driveMinutesEst: 60,
  ...over,
})

const buzz = (id: string, over: Partial<BuzzSnapshot> = {}): BuzzSnapshot => ({
  kakaoPlaceId: id,
  capturedAt: '2026-08-19',
  receivedCount: 50,
  relevantCount: 35,
  precision: 0.7,
  spanDays: 17,
  postsPer30: 62,
  posts30d: 30,
  postsPrev: 10,
  firstPostDate: '2024-01-01',
  latestPostDate: '2026-08-19',
  acceleration: 1.5,
  suspectAmbiguous: false,
  ...over,
})

const goodAttrs = {
  scale: '대형',
  seatsEstimate: 200,
  floors: 2,
  hasBakery: true,
  breadBakedOnsite: true,
  menuLevel: 3,
  mealTypes: ['파스타'],
  viewStrength: 3,
  viewTypes: ['강'],
  outdoorSeating: false,
  parkingGrade: 'A',
  parkingEvidence: '주차장 넓음',
  photoSpot: 4,
  teenAppeal: 3,
  confidence: 0.9,
  evidence: '2층 200석',
}

function harness(cafes: Cafe[], buzzRows: BuzzSnapshot[], over: Partial<ClassifyDeps> = {}) {
  let saved = cafes
  const deps: ClassifyDeps = {
    store: {
      readCafes: async () => saved,
      writeCafes: async (c) => { saved = c },
      readBuzz: async () => buzzRows,
      appendRaw: async () => 'p',
      readHealth: async () => [],
      writeHealth: async () => {},
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    llm: { name: 'f', modelVersion: 'gemini-3.1-flash-lite', extract: async () => goodAttrs as never },
    now: NOW,
    ...over,
  }
  return { deps, saved: () => saved }
}

describe('runClassify', () => {
  it('통과한 카페를 active 로 바꾸고 태그를 붙인다', async () => {
    const h = harness([cafe('1')], [buzz('1')])
    const r = await runClassify(h.deps)
    expect(r.classified).toBe(1)
    const c = h.saved()[0]!
    expect(c.status).toBe('active')
    expect(c.tags).toContain('대형카페')
    expect(c.tags).toContain('대형베이커리')
    expect(c.tags).toContain('브런치카페')
    expect(c.attributes!.modelVersion).toBe('gemini-3.1-flash-lite')
    expect(c.attributes!.extractedAt).toBe(NOW.toISOString())
  })

  it('Layer 2 탈락은 LLM 을 호출하지 않는다', async () => {
    // 비용 설계의 핵심 — 통과율 20% 이므로 LLM 호출이 1/5로 줄어든다
    let called = 0
    const h = harness([cafe('1')], [buzz('1', { precision: 0.1, postsPer30: 2 })], {
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => { called++; return goodAttrs as never },
      },
    })
    const r = await runClassify(h.deps)
    expect(called).toBe(0)
    expect(r.excluded).toBe(1)
    expect(h.saved()[0]!.status).toBe('excluded_auto')
    expect(h.saved()[0]!.excludeReason).toMatch(/정밀도/)
  })

  it('화제량 스냅샷이 없으면 건너뛴다 (탈락시키지 않는다)', async () => {
    const h = harness([cafe('1')], [])
    const r = await runClassify(h.deps)
    expect(r.skipped).toBe(1)
    // 다음 회차에 다시 시도된다
    expect(h.saved()[0]!.status).toBe('pending_extraction')
  })

  it('주차 전용 검색을 별도로 던진다', async () => {
    const queries: string[] = []
    const h = harness([cafe('1')], [buzz('1')], {
      blog: {
        search: async (q: string) => {
          queries.push(q)
          return { docs: [], payload: {} }
        },
      },
    })
    await runClassify(h.deps)
    expect(queries.some((q) => q.endsWith('주차'))).toBe(true)
    expect(queries).toHaveLength(2)
  })

  it('게이트 탈락은 excluded_auto 로 남긴다', async () => {
    const h = harness([cafe('1')], [buzz('1')], {
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => ({ ...goodAttrs, parkingGrade: 'D' }) as never,
      },
    })
    const r = await runClassify(h.deps)
    expect(r.excluded).toBe(1)
    expect(h.saved()[0]!.excludeReason).toMatch(/주차/)
  })

  it('태그 0개면 동네 카페로 제외한다', async () => {
    const h = harness([cafe('1')], [buzz('1')], {
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => ({
          ...goodAttrs, scale: '중형', seatsEstimate: 50,
          menuLevel: 1, viewStrength: 0, hasBakery: false,
          mealTypes: [], viewTypes: [], evidence: '평범한 카페',
        }) as never,
      },
    })
    const r = await runClassify(h.deps)
    expect(r.excluded).toBe(1)
    expect(h.saved()[0]!.excludeReason).toMatch(/동네/)
  })

  it('한 카페가 실패해도 나머지를 계속한다', async () => {
    let n = 0
    const h = harness([cafe('1'), cafe('2')], [buzz('1'), buzz('2')], {
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => {
          if (++n === 1) throw new Error('LLM 장애')
          return goodAttrs as never
        },
      },
    })
    const r = await runClassify(h.deps)
    expect(r.failed).toBe(1)
    expect(r.classified).toBe(1)
  })

  it('실패한 카페는 pending_extraction 으로 남아 재시도된다', async () => {
    const h = harness([cafe('1')], [buzz('1')], {
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => { throw new Error('장애') },
      },
    })
    await runClassify(h.deps)
    expect(h.saved()[0]!.status).toBe('pending_extraction')
  })

  it('limit 으로 처리량을 제한한다 (무료 티어 일일 한도 대응)', async () => {
    const h = harness(
      [cafe('1'), cafe('2'), cafe('3')],
      [buzz('1'), buzz('2'), buzz('3')],
    )
    const r = await runClassify(h.deps, { limit: 2 })
    expect(r.classified).toBe(2)
    expect(h.saved().filter((c) => c.status === 'pending_extraction')).toHaveLength(1)
  })

  it('이미 처리된 카페는 다시 건드리지 않는다', async () => {
    let called = 0
    const h = harness([cafe('1', { status: 'active' })], [buzz('1')], {
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => { called++; return goodAttrs as never },
      },
    })
    const r = await runClassify(h.deps)
    expect(called).toBe(0)
    expect(r.classified).toBe(0)
  })

  it('여러 스냅샷이 있으면 최신을 쓴다', async () => {
    const h = harness([cafe('1')], [
      buzz('1', { capturedAt: '2026-08-01', precision: 0.05 }),
      buzz('1', { capturedAt: '2026-08-19', precision: 0.7 }),
    ])
    const r = await runClassify(h.deps)
    expect(r.classified).toBe(1)
  })
})
