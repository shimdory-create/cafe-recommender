import { describe, it, expect } from 'vitest'
import { runDailyBuzz, type DailyBuzzDeps } from '../../src/jobs/daily-buzz.js'
import { runWeeklySuggest, mondayOf, type SuggestDeps } from '../../src/jobs/weekly-suggest.js'
import type { BuzzSnapshot, Cafe, Suggestion, Visit } from '../../src/schema.js'
import type { BlogDoc } from '../../src/sources/kakao-blog.js'

const NOW = new Date('2026-08-20T00:00:00Z') // 목요일

const attrs = {
  scale: '대형' as const,
  seatsEstimate: 200,
  hasBakery: true,
  menuLevel: 3,
  mealTypes: [],
  viewStrength: 3,
  viewTypes: [],
  outdoorSeating: false,
  parkingGrade: 'A' as const,
  parkingEvidence: '',
  teenAppeal: 3,
  evidence: 'e',
  extractedAt: NOW.toISOString(),
  modelVersion: 'v',
}

const cafe = (id: string, over: Partial<Cafe> = {}): Cafe => ({
  kakaoPlaceId: id,
  name: `카페${id}`,
  sigungu: '양평군',
  lat: 37.49,
  lng: 127.48,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  tags: ['대형카페'],
  driveMinutesEst: 60,
  attributes: attrs,
  ...over,
})

const buzzRow = (id: string, over: Partial<BuzzSnapshot> = {}): BuzzSnapshot => ({
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

const relDoc = (name: string, daysAgo: number): BlogDoc => ({
  title: `${name} 카페 후기`,
  contents: '',
  url: 'u',
  blogName: 'b',
  dateTime: new Date(NOW.getTime() - daysAgo * 86_400_000),
})

describe('runDailyBuzz', () => {
  function harness(cafes: Cafe[], rows: BuzzSnapshot[], over: Partial<DailyBuzzDeps> = {}) {
    let saved = rows
    const deps: DailyBuzzDeps = {
      store: {
        readCafes: async () => cafes,
        readBuzz: async () => saved,
        writeBuzz: async (r) => { saved = r },
        appendRaw: async () => 'p',
        readHealth: async () => [],
        writeHealth: async () => {},
      },
      blog: {
        search: async () => ({
          docs: [relDoc('카페1', 1), relDoc('카페1', 5)],
          payload: {},
        }),
      },
      now: NOW,
      ...over,
    }
    return { deps, saved: () => saved }
  }

  it('카페마다 화제량을 갱신한다', async () => {
    const h = harness([cafe('1')], [])
    const r = await runDailyBuzz(h.deps)
    expect(r.updated).toBe(1)
    expect(h.saved()[0]!.kakaoPlaceId).toBe('1')
    expect(h.saved()[0]!.capturedAt).toBe('2026-08-20')
    expect(h.saved()[0]!.relevantCount).toBe(2)
  })

  it('같은 날 재실행하면 덮어쓴다 (중복 누적 방지)', async () => {
    const h = harness([cafe('1')], [])
    await runDailyBuzz(h.deps)
    await runDailyBuzz(h.deps)
    expect(h.saved()).toHaveLength(1)
  })

  it('한 카페가 실패해도 나머지를 계속한다', async () => {
    let n = 0
    const h = harness([cafe('1'), cafe('2')], [], {
      blog: {
        search: async () => {
          if (++n === 1) throw new Error('장애')
          return { docs: [], payload: {} }
        },
      },
    })
    const r = await runDailyBuzz(h.deps)
    expect(r.failed).toBe(1)
    expect(r.updated).toBe(1)
  })

  it('180일보다 오래된 스냅샷을 정리한다', async () => {
    const old = buzzRow('1', { capturedAt: '2025-01-01' })
    const h = harness([cafe('1')], [old])
    const r = await runDailyBuzz(h.deps)
    expect(r.dropped).toBe(1)
    expect(h.saved().some((x) => x.capturedAt === '2025-01-01')).toBe(false)
  })

  it('제외된 카페는 조회하지 않는다', async () => {
    const h = harness([cafe('1', { status: 'excluded_auto' })], [])
    expect((await runDailyBuzz(h.deps)).updated).toBe(0)
  })

  it('pending_extraction 도 조회한다 (classify 가 스냅샷을 기다린다)', async () => {
    const h = harness([cafe('1', { status: 'pending_extraction' })], [])
    expect((await runDailyBuzz(h.deps)).updated).toBe(1)
  })

  it('검색어는 "{시군구} {상호}" 조합이다', async () => {
    const queries: string[] = []
    const h = harness([cafe('1')], [], {
      blog: {
        search: async (q: string) => { queries.push(q); return { docs: [], payload: {} } },
      },
    })
    await runDailyBuzz(h.deps)
    expect(queries[0]).toBe('양평군 카페1')
  })

  it('limit 으로 처리량을 제한한다', async () => {
    const h = harness([cafe('1'), cafe('2'), cafe('3')], [])
    expect((await runDailyBuzz(h.deps, { limit: 2 })).updated).toBe(2)
  })
})

describe('mondayOf', () => {
  it('목요일의 월요일을 준다', () => {
    expect(mondayOf(new Date('2026-08-20T00:00:00Z'))).toBe('2026-08-17')
  })

  it('월요일은 자기 자신이다', () => {
    expect(mondayOf(new Date('2026-08-17T00:00:00Z'))).toBe('2026-08-17')
  })

  it('일요일은 그 주 월요일이다', () => {
    expect(mondayOf(new Date('2026-08-23T00:00:00Z'))).toBe('2026-08-17')
  })
})

describe('runWeeklySuggest', () => {
  function harness(
    cafes: Cafe[],
    rows: BuzzSnapshot[],
    visits: Visit[] = [],
    prev: Suggestion[] = [],
  ) {
    let saved: Suggestion[] = prev
    const deps: SuggestDeps = {
      store: {
        readCafes: async () => cafes,
        readBuzz: async () => rows,
        readVisits: async () => visits,
        readSuggestions: async () => saved,
        writeSuggestions: async (r) => { saved = r },
      },
      now: NOW,
    }
    return { deps, saved: () => saved }
  }

  it('상위 3곳을 골라 저장한다', async () => {
    const ids = ['1', '2', '3', '4']
    const h = harness(
      ids.map((i) => cafe(i)),
      ids.map((i) => buzzRow(i, { postsPer30: 20 * Number(i) })),
    )
    const r = await runWeeklySuggest(h.deps)
    expect(r.picked).toHaveLength(3)
    expect(h.saved()).toHaveLength(3)
    expect(h.saved()[0]!.rank).toBe(1)
    expect(h.saved()[0]!.weekOf).toBe('2026-08-17')
  })

  it('점수 근거를 남긴다', async () => {
    const h = harness([cafe('1')], [buzzRow('1')])
    const r = await runWeeklySuggest(h.deps)
    expect(r.picked[0]!.reason).toMatchObject({ tags: ['대형카페'] })
    expect(typeof (r.picked[0]!.reason as { hot: number }).hot).toBe('number')
  })

  it('숨긴 카페와 태그 0개는 후보에서 뺀다', async () => {
    const h = harness(
      [cafe('1', { status: 'hidden' }), cafe('2', { tags: [] })],
      [buzzRow('1'), buzzRow('2')],
    )
    expect((await runWeeklySuggest(h.deps)).picked).toHaveLength(0)
  })

  it('화제량 스냅샷이 없는 카페는 뺀다', async () => {
    const h = harness([cafe('1')], [])
    expect((await runWeeklySuggest(h.deps)).picked).toHaveLength(0)
  })

  it('최근 방문한 곳은 순위가 내려간다', async () => {
    const h = harness(
      [cafe('1'), cafe('2')],
      [buzzRow('1'), buzzRow('2')],
      [{ kakaoPlaceId: '1', visitedOn: '2026-08-01' }],
    )
    const r = await runWeeklySuggest(h.deps)
    expect(r.picked[0]!.kakaoPlaceId).toBe('2')
  })

  it('같은 주에 재실행하면 덮어쓴다', async () => {
    const h = harness([cafe('1')], [buzzRow('1')])
    await runWeeklySuggest(h.deps)
    await runWeeklySuggest(h.deps)
    expect(h.saved()).toHaveLength(1)
  })

  it('지난 주 후보는 보존한다', async () => {
    const old: Suggestion = {
      weekOf: '2026-08-10', kakaoPlaceId: '9', rank: 1, finalScore: 1, reason: {},
    }
    const h = harness([cafe('1')], [buzzRow('1')], [], [old])
    await runWeeklySuggest(h.deps)
    expect(h.saved().some((s) => s.weekOf === '2026-08-10')).toBe(true)
    expect(h.saved()).toHaveLength(2)
  })

  it('주차 C 는 도심 모드에서만 후보가 된다', async () => {
    const c = cafe('1', { attributes: { ...attrs, parkingGrade: 'C' } })
    const h = harness([c], [buzzRow('1')])
    expect((await runWeeklySuggest(h.deps)).picked).toHaveLength(0)
    const h2 = harness([c], [buzzRow('1')])
    expect((await runWeeklySuggest(h2.deps, { cityMode: true })).picked).toHaveLength(1)
  })
})
