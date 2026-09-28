import { describe, it, expect } from 'vitest'
import {
  runSpotDormantRecheck, type SpotDormantRecheckDeps,
} from '../../src/jobs/spot-dormant-recheck.js'
import type { Spot } from '../../src/spot-schema.js'
import type { BlogDoc } from '../../src/sources/kakao-blog.js'

const NOW = new Date('2026-09-28T00:00:00Z')

const spot = (id: string, over: Partial<Spot> = {}): Spot => ({
  kakaoPlaceId: id,
  name: `장소${id}`,
  sigungu: '부평구',
  lat: 37.5,
  lng: 126.7,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  status: 'dormant',
  excludeReason: '화제 식음 — 21일 연속 화제량 미달',
  quietSince: '2026-08-01',
  ambiguousName: false,
  tags: ['자연/공원'],
  attributes: null,
  ...over,
})

const doc = (over: Partial<BlogDoc>): BlogDoc => ({
  title: '', contents: '', url: 'u', blogName: 'b', dateTime: NOW, thumbnail: '', ...over,
})

function harness(input: Spot[]) {
  let spots = input
  let buzz: unknown[] = []
  const deps: SpotDormantRecheckDeps = {
    store: {
      readSpots: async () => spots,
      writeSpots: async (s) => { spots = s },
      readSpotBuzz: async () => buzz as never,
      writeSpotBuzz: async (r) => { buzz = r },
      appendRaw: async () => 'p',
      readHealth: async () => [],
      writeHealth: async () => {},
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    now: NOW,
  }
  return { deps, spots: () => spots }
}

describe('runSpotDormantRecheck', () => {
  it('dormant 가 0곳이면 buzz·spots 어느 쪽도 다시 쓰지 않는다', async () => {
    let buzzWrites = 0
    let spotWrites = 0
    const h = harness([spot('1', { status: 'active', quietSince: null })])
    h.deps.store.writeSpotBuzz = async () => { buzzWrites++ }
    h.deps.store.writeSpots = async () => { spotWrites++ }
    const r = await runSpotDormantRecheck(h.deps)
    expect(r.checked).toBe(0)
    expect(buzzWrites).toBe(0)
    expect(spotWrites).toBe(0)
  })

  it('화제량이 없으면 그대로 dormant 다', async () => {
    const h = harness([spot('1')])
    const r = await runSpotDormantRecheck(h.deps)
    expect(r.checked).toBe(1)
    expect(r.stillQuiet).toBe(1)
    expect(h.spots()[0]!.status).toBe('dormant')
  })

  it('화제량이 회복됐으면 active 로 되돌린다', async () => {
    const h = harness([spot('1')])
    h.deps.blog.search = async () => ({
      docs: [
        doc({ title: '장소1 나들이 후기', contents: '아이들이랑 좋았다' }),
        doc({ title: '장소1 나들이 후기2', contents: '또 갔다' }),
      ],
      payload: {},
    })
    const r = await runSpotDormantRecheck(h.deps)
    expect(r.recovered).toBe(1)
    expect(h.spots()[0]!.status).toBe('active')
    expect(h.spots()[0]!.quietSince).toBeNull()
  })

  it('active 장소는 건드리지 않는다', async () => {
    const h = harness([spot('1', { status: 'active', quietSince: null })])
    expect((await runSpotDormantRecheck(h.deps)).checked).toBe(0)
  })
})
