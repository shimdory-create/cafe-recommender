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
  thumbnail: '',
})

describe('runDailyBuzz', () => {
  function harness(input: Cafe[], rows: BuzzSnapshot[], over: Partial<DailyBuzzDeps> = {}) {
    let saved = rows
    let cafes = input
    const deps: DailyBuzzDeps = {
      store: {
        readCafes: async () => cafes,
        writeCafes: async (c) => { cafes = c },
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
    return { deps, saved: () => saved, cafes: () => cafes }
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

  it('카페별 최신 1건만 남긴다', async () => {
    // 180일 롤링은 카페 6,216곳에서 한 파일 403MB 가 되어 폐기했다.
    // 이력을 읽는 코드도 없다 (가속도는 현재 50건 창에서 계산).
    const stale = buzzRow('1', { capturedAt: '2025-01-01' })
    const h = harness([cafe('1')], [stale])
    const r = await runDailyBuzz(h.deps)
    expect(r.dropped).toBe(1)
    expect(h.saved()).toHaveLength(1)
    expect(h.saved()[0]!.capturedAt).toBe('2026-08-20')
  })

  it('다른 카페의 스냅샷은 지우지 않는다', async () => {
    const other = buzzRow('99', { capturedAt: '2026-08-10' })
    const h = harness([cafe('1')], [other])
    await runDailyBuzz(h.deps)
    expect(h.saved()).toHaveLength(2)
    expect(h.saved().some((x) => x.kakaoPlaceId === '99')).toBe(true)
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
  it('active 카페를 먼저 처리한다', async () => {
    // limit 으로 잘릴 때 추천에 뜨는 곳이 뒤로 밀리면 안 된다
    const queries: string[] = []
    const h = harness(
      [
        cafe('p', { name: '대기카페', status: 'pending_extraction' }),
        cafe('a', { name: '노출카페', status: 'active' }),
      ],
      [],
      {
        blog: {
          search: async (q: string) => {
            queries.push(q)
            return { docs: [], payload: {} }
          },
        },
      },
    )
    await runDailyBuzz(h.deps, { limit: 1 })
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('노출카페')
  })

  it('대표 이미지를 카페에 저장한다', async () => {
    // 이 잡이 이미 카페별로 블로그를 부르므로 추가 호출이 없다
    const h = harness([cafe('1', { name: '테라로사' })], [], {
      blog: {
        search: async () => ({
          docs: [{ ...relDoc('테라로사', 1), thumbnail: 'https://cdn/right.jpg' }],
          payload: {},
        }),
      },
    })
    const r = await runDailyBuzz(h.deps)
    expect(r.images).toBe(1)
    expect(h.cafes()[0]!.imageUrl).toBe('https://cdn/right.jpg')
  })

  it('관련 없는 글의 이미지는 쓰지 않는다', async () => {
    // 엉뚱한 사진 한 장은 텍스트 오류보다 신뢰를 더 깎는다
    const h = harness([cafe('1', { name: '테라로사' })], [], {
      blog: {
        search: async () => ({
          docs: [
            {
              title: '전혀 무관한 글', contents: '', url: 'u', blogName: 'b',
              dateTime: new Date('2026-08-19T00:00:00Z'),
              thumbnail: 'https://cdn/wrong.jpg',
            },
            { ...relDoc('테라로사', 2), thumbnail: 'https://cdn/right.jpg' },
          ],
          payload: {},
        }),
      },
    })
    await runDailyBuzz(h.deps)
    expect(h.cafes()[0]!.imageUrl).toBe('https://cdn/right.jpg')
  })

  it('썸네일이 없으면 기존 이미지를 지우지 않는다', async () => {
    const h = harness([cafe('1', { name: '테라로사', imageUrl: 'https://cdn/old.jpg' })], [], {
      blog: { search: async () => ({ docs: [relDoc('테라로사', 1)], payload: {} }) },
    })
    const r = await runDailyBuzz(h.deps)
    expect(r.images).toBe(0)
    expect(h.cafes()[0]!.imageUrl).toBe('https://cdn/old.jpg')
  })

  it('이미지가 그대로면 다시 쓰지 않는다', async () => {
    const h = harness([cafe('1', { name: '테라로사', imageUrl: 'https://cdn/same.jpg' })], [], {
      blog: {
        search: async () => ({
          docs: [{ ...relDoc('테라로사', 1), thumbnail: 'https://cdn/same.jpg' }],
          payload: {},
        }),
      },
    })
    expect((await runDailyBuzz(h.deps)).images).toBe(0)
  })
})

describe('runDailyBuzz — 회전 수집', () => {
  /** 어떤 카페를 실제로 조회했는지만 본다 */
  function spy(cafes: Cafe[], rows: BuzzSnapshot[]) {
    const queries: string[] = []
    const deps: DailyBuzzDeps = {
      store: {
        readCafes: async () => cafes,
        writeCafes: async () => {},
        readBuzz: async () => rows,
        writeBuzz: async () => {},
        appendRaw: async () => 'p',
        readHealth: async () => [],
        writeHealth: async () => {},
      },
      blog: {
        search: async (q: string) => {
          queries.push(q)
          return { docs: [relDoc('카페1', 1)], payload: {} }
        },
      },
      now: NOW,
    }
    return { deps, queries }
  }

  it('active 는 매일 전부 잰다 — 순위와 대표 이미지가 여기서 나온다', async () => {
    const h = spy(
      [cafe('a1'), cafe('a2'), cafe('p1', { status: 'pending_extraction' })],
      [],
    )
    await runDailyBuzz(h.deps, { pendingPerDay: 0 })
    expect(h.queries).toHaveLength(2)
    expect(h.queries.join(' ')).not.toContain('카페p1')
  })

  it('판정 대기는 가장 오래 안 잰 것부터 고른다', async () => {
    const h = spy(
      [
        cafe('p1', { status: 'pending_extraction' }),
        cafe('p2', { status: 'pending_extraction' }),
        cafe('p3', { status: 'pending_extraction' }),
      ],
      [
        buzzRow('p1', { capturedAt: '2026-08-19' }),
        buzzRow('p2', { capturedAt: '2026-08-10' }),
        // p3 는 한 번도 재지 않았다 -> 가장 먼저
      ],
    )
    await runDailyBuzz(h.deps, { pendingPerDay: 2 })
    expect(h.queries).toHaveLength(2)
    expect(h.queries[0]).toContain('카페p3')
    expect(h.queries[1]).toContain('카페p2')
  })

  it('회전분 상한을 넘겨 재지 않는다 (Actions 시간·카카오 쿼터 절약)', async () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      cafe(`p${i}`, { status: 'pending_extraction' }))
    const h = spy(many, [])
    await runDailyBuzz(h.deps, { pendingPerDay: 5 })
    expect(h.queries).toHaveLength(5)
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
    return { deps, saved: () => saved, cafes: () => cafes }
  }

  it('기본 10곳까지 골라 순위대로 저장한다', async () => {
    // 3곳에서 10곳으로 늘렸다 — "3개는 너무 적다" 는 피드백 (스펙 10절 v3.2).
    // 후보가 10곳보다 적으면 있는 만큼만 담는다.
    const ids = ['1', '2', '3', '4']
    const h = harness(
      ids.map((i) => cafe(i)),
      ids.map((i) => buzzRow(i, { postsPer30: 20 * Number(i) })),
    )
    const r = await runWeeklySuggest(h.deps)
    expect(r.picked).toHaveLength(4)
    expect(h.saved()).toHaveLength(4)
    expect(h.saved().map((s) => s.rank)).toEqual([1, 2, 3, 4])
    expect(h.saved()[0]!.weekOf).toBe('2026-08-17')
  })

  it('count 로 개수를 줄일 수 있다', async () => {
    const ids = ['1', '2', '3', '4']
    const h = harness(
      ids.map((i) => cafe(i)),
      ids.map((i) => buzzRow(i, { postsPer30: 20 * Number(i) })),
    )
    expect((await runWeeklySuggest(h.deps, { count: 2 })).picked).toHaveLength(2)
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
