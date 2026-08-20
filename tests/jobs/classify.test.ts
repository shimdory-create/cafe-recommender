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
    // 프롬프트 판본이 붙는다. 프롬프트를 고치면 재추출 대상을 이 값으로 고른다.
    expect(c.attributes!.modelVersion).toBe('gemini-3.1-flash-lite+p2')
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
  it('--redo-stale 은 낡은 프롬프트로 뽑은 카페를 다시 추출한다', async () => {
    // 프롬프트를 고쳐도 이미 판정된 카페가 갱신되지 않으면 옛 판정이 남는다
    const old = { ...goodAttrs, modelVersion: 'gemini-3.1-flash-lite+p1' }
    const h = harness(
      [cafe('1', { status: 'active', attributes: old as never, tags: ['대형카페'] })],
      [buzz('1')],
    )
    const r = await runClassify(h.deps, { redoStale: true })
    expect(r.classified).toBe(1)
    expect(h.saved()[0]!.attributes!.modelVersion).toBe('gemini-3.1-flash-lite+p2')
  })

  it('--redo-stale 없이는 판본이 낡아도 그대로 둔다', async () => {
    const old = { ...goodAttrs, modelVersion: 'gemini-3.1-flash-lite+p1' }
    const h = harness([cafe('1', { status: 'active', attributes: old as never })], [buzz('1')])
    expect((await runClassify(h.deps)).classified).toBe(0)
  })

  it('판본이 최신인 카페는 재추출하지 않는다', async () => {
    const cur = { ...goodAttrs, modelVersion: 'gemini-3.1-flash-lite+p2' }
    const h = harness([cafe('1', { status: 'active', attributes: cur as never })], [buzz('1')])
    expect((await runClassify(h.deps, { redoStale: true })).classified).toBe(0)
  })

  it('LLM 을 쓰지 않고 탈락한 카페는 재추출 대상이 아니다', async () => {
    // Layer 2 탈락은 attributes 가 null 이다. 다시 부를 이유가 없다.
    const h = harness(
      [cafe('1', { status: 'excluded_auto', excludeReason: '정밀도 10% < 30%' })],
      [buzz('1')],
    )
    expect((await runClassify(h.deps, { redoStale: true })).classified).toBe(0)
  })

  it('중간에도 저장한다 (죽어도 LLM 호출 전부를 잃지 않게)', async () => {
    let writes = 0
    const cafes = Array.from({ length: 45 }, (_, i) => cafe(String(i)))
    const rows = cafes.map((c) => buzz(c.kakaoPlaceId))
    const h = harness(cafes, rows)
    const spied: ClassifyDeps = {
      ...h.deps,
      store: { ...h.deps.store, writeCafes: async () => { writes++ } },
    }
    await runClassify(spied)
    // 20곳마다 + 마지막 1회
    expect(writes).toBeGreaterThan(1)
  })
  it('화제량이 많은 순으로 처리한다', async () => {
    // 하루 200곳 상한이라 파일 순서로 돌면 며칠 동안 특정 지역만 채워진다
    const order: string[] = []
    const h = harness(
      [cafe('a'), cafe('b'), cafe('c')],
      [buzz('a', { postsPer30: 10 }), buzz('b', { postsPer30: 90 }), buzz('c', { postsPer30: 50 })],
      {
        blog: {
          search: async (q: string) => {
            if (q.endsWith('주차')) order.push(q.split(' ')[1]!)
            return { docs: [], payload: {} }
          },
        },
      },
    )
    await runClassify(h.deps)
    expect(order).toEqual(['카페b', '카페c', '카페a'])
  })

  it('--order file 이면 파일 순서를 지킨다', async () => {
    const h = harness(
      [cafe('a'), cafe('b')],
      [buzz('a', { postsPer30: 10 }), buzz('b', { postsPer30: 90 })],
    )
    const r = await runClassify(h.deps, { limit: 1, order: 'file' })
    expect(r.classified).toBe(1)
    expect(h.saved().find((c) => c.kakaoPlaceId === 'a')!.status).toBe('active')
  })

  it('화제량 스냅샷이 없는 카페는 뒤로 밀린다', async () => {
    // 정렬 때문에 skipped 가 앞을 차지하면 limit 이 낭비된다
    const h = harness([cafe('a'), cafe('b')], [buzz('b', { postsPer30: 20 })])
    const r = await runClassify(h.deps, { limit: 1 })
    expect(r.classified).toBe(1)
    expect(r.skipped).toBe(0)
  })
  it('주차 C 를 excluded_auto 로 굳히지 않는다', async () => {
    // 굳히면 도심 모드(--city)로 볼 길이 막힌다. 골든셋에서 공원스크립트가
    // 이 경로로 오탈락됐다 ("주차장은 조금 협소한 편").
    const h = harness([cafe('1')], [buzz('1')], {
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => ({ ...goodAttrs, parkingGrade: 'C' }) as never,
      },
    })
    const r = await runClassify(h.deps)
    expect(r.classified).toBe(1)
    expect(h.saved()[0]!.status).toBe('active')
    expect(h.saved()[0]!.attributes!.parkingGrade).toBe('C')
  })

  it('주차 D 와 태그 0개는 여전히 배제한다', async () => {
    const d = harness([cafe('1')], [buzz('1')], {
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => ({ ...goodAttrs, parkingGrade: 'D' }) as never,
      },
    })
    expect((await runClassify(d.deps)).excluded).toBe(1)

    const t = harness([cafe('2')], [buzz('2')], {
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => ({
          ...goodAttrs, scale: '중형', menuLevel: 1, viewStrength: 0,
          viewTypes: [], mealTypes: [], evidence: '작은 카페',
        }) as never,
      },
    })
    expect((await runClassify(t.deps)).excluded).toBe(1)
  })
})
