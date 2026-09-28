import { describe, it, expect } from 'vitest'
import { runDormantRecheck, type DormantRecheckDeps } from '../../src/jobs/dormant-recheck.js'
import type { BuzzSnapshot, Cafe } from '../../src/schema.js'
import type { BlogDoc } from '../../src/sources/kakao-blog.js'

const NOW = new Date('2026-09-28T00:00:00Z')

const cafe = (id: string, over: Partial<Cafe> = {}): Cafe => ({
  kakaoPlaceId: id,
  name: `카페${id}`,
  sigungu: '양평군',
  lat: 37.49,
  lng: 127.48,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  status: 'dormant',
  excludeReason: '화제 식음 — 21일 연속 화제량 미달',
  quietSince: '2026-08-01',
  ambiguousName: false,
  tags: ['대형카페'],
  driveMinutesEst: 60,
  attributes: null,
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

function harness(input: Cafe[], over: Partial<DormantRecheckDeps> = {}) {
  let cafes = input
  let buzz: BuzzSnapshot[] = []
  const deps: DormantRecheckDeps = {
    store: {
      readCafes: async () => cafes,
      writeCafes: async (c) => { cafes = c },
      readBuzz: async () => buzz,
      writeBuzz: async (r) => { buzz = r },
      appendRaw: async () => 'p',
      readHealth: async () => [],
      writeHealth: async () => {},
    },
    blog: {
      search: async () => ({ docs: [], payload: {} }),
    },
    now: NOW,
    ...over,
  }
  return { deps, cafes: () => cafes, buzz: () => buzz }
}

describe('runDormantRecheck', () => {
  it('화제량이 없으면(빈 문서) 그대로 dormant 다', async () => {
    const h = harness([cafe('1')])
    const r = await runDormantRecheck(h.deps)
    expect(r.checked).toBe(1)
    expect(r.stillQuiet).toBe(1)
    expect(r.recovered).toBe(0)
    expect(h.cafes()[0]!.status).toBe('dormant')
  })

  it('화제량이 회복됐으면 active 로 되돌리고 quietSince·excludeReason 을 지운다', async () => {
    const h = harness([cafe('1')], {
      blog: { search: async () => ({ docs: [relDoc('카페1', 1), relDoc('카페1', 5)], payload: {} }) },
    })
    const r = await runDormantRecheck(h.deps)
    expect(r.recovered).toBe(1)
    expect(h.cafes()[0]!.status).toBe('active')
    expect(h.cafes()[0]!.quietSince).toBeNull()
    expect(h.cafes()[0]!.excludeReason).toBeNull()
  })

  it('active 카페는 건드리지 않는다', async () => {
    const h = harness([cafe('1', { status: 'active', quietSince: null })])
    const r = await runDormantRecheck(h.deps)
    expect(r.checked).toBe(0)
  })

  it('회복된 카페의 화제량 스냅샷도 갱신한다', async () => {
    const h = harness([cafe('1')], {
      blog: { search: async () => ({ docs: [relDoc('카페1', 1)], payload: {} }) },
    })
    await runDormantRecheck(h.deps)
    expect(h.buzz()[0]!.capturedAt).toBe('2026-09-28')
  })

  it('한 카페가 실패해도 나머지를 계속한다', async () => {
    let n = 0
    const h = harness([cafe('1'), cafe('2')], {
      blog: {
        search: async () => {
          if (++n === 1) throw new Error('장애')
          return { docs: [], payload: {} }
        },
      },
    })
    const r = await runDormantRecheck(h.deps)
    expect(r.failed).toBe(1)
    expect(r.stillQuiet).toBe(1)
  })
})
