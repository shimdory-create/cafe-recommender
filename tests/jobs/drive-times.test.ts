import { describe, it, expect } from 'vitest'
import { runDriveTimes, driveMinutesOf, type DriveDeps } from '../../src/jobs/drive-times.js'
import type { Cafe } from '../../src/schema.js'

const NOW = new Date('2026-08-20T00:00:00Z')

const cafe = (id: string, over: Partial<Cafe> = {}): Cafe => ({
  kakaoPlaceId: id,
  name: `카페${id}`,
  sigungu: '강화군',
  lat: 37.679, lng: 126.4,
  driveMinutesEst: 46,
  firstSeenAt: '2026-08-01T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  attributes: null,
  tags: ['대형카페'],
  ...over,
})

function harness(cafes: Cafe[], over: Partial<DriveDeps> = {}) {
  let saved = cafes
  const deps: DriveDeps = {
    store: {
      readCafes: async () => saved,
      writeCafes: async (c) => { saved = c },
      appendRaw: async () => 'p',
      readHealth: async () => [],
      writeHealth: async () => {},
    },
    directions: {
      route: async () => ({ route: { minutes: 64, km: 54.2, tollWon: 2000 }, payload: {} }),
    },
    now: NOW,
    ...over,
  }
  return { deps, saved: () => saved }
}

describe('runDriveTimes', () => {
  it('실주행 시간을 재서 보관한다', async () => {
    const h = harness([cafe('1')])
    const r = await runDriveTimes(h.deps)
    expect(r.measured).toBe(1)
    const c = h.saved()[0]!
    expect(c.driveMinutes).toBe(64)
    expect(c.driveKm).toBe(54.2)
    expect(c.tollWon).toBe(2000)
    // 근사값은 지우지 않는다 — 폴백으로 남는다
    expect(c.driveMinutesEst).toBe(46)
  })

  it('이미 측정한 카페는 다시 호출하지 않는다', async () => {
    // 카페는 움직이지 않는다. 매주 돌려도 신규분만 호출한다.
    let calls = 0
    const h = harness([cafe('1', { driveMinutes: 64 })], {
      directions: {
        route: async () => {
          calls++
          return { route: { minutes: 64, km: 1, tollWon: null }, payload: {} }
        },
      },
    })
    const r = await runDriveTimes(h.deps)
    expect(calls).toBe(0)
    expect(r.measured).toBe(0)
  })

  it('--force 면 이미 측정한 것도 다시 잰다', async () => {
    const h = harness([cafe('1', { driveMinutes: 999 })])
    await runDriveTimes(h.deps, { force: true })
    expect(h.saved()[0]!.driveMinutes).toBe(64)
  })

  it('active 가 아닌 카페는 재지 않는다 (호출을 아낀다)', async () => {
    const h = harness([
      cafe('1', { status: 'pending_extraction' }),
      cafe('2', { status: 'excluded_auto' }),
      cafe('3', { status: 'hidden' }),
    ])
    expect((await runDriveTimes(h.deps)).measured).toBe(0)
  })

  it('경로를 못 찾으면 근사값을 남긴다 (목록에서 떨어뜨리지 않는다)', async () => {
    const h = harness([cafe('1')], {
      directions: { route: async () => ({ route: null, payload: {} }) },
    })
    const r = await runDriveTimes(h.deps)
    expect(r.unroutable).toBe(1)
    expect(h.saved()[0]!.driveMinutes).toBeUndefined()
    expect(driveMinutesOf(h.saved()[0]!)).toBe(46)
  })

  it('한 곳이 실패해도 나머지를 계속한다', async () => {
    let n = 0
    const h = harness([cafe('1'), cafe('2')], {
      directions: {
        route: async () => {
          if (++n === 1) throw new Error('일시 장애')
          return { route: { minutes: 30, km: 20, tollWon: null }, payload: {} }
        },
      },
    })
    const r = await runDriveTimes(h.deps)
    expect(r.failed).toBe(1)
    expect(r.measured).toBe(1)
  })

  it('limit 으로 호출량을 제한한다', async () => {
    const h = harness([cafe('1'), cafe('2'), cafe('3')])
    expect((await runDriveTimes(h.deps, { limit: 2 })).measured).toBe(2)
  })

  it('원본 응답을 적재한다', async () => {
    const queries: string[] = []
    const h = harness([cafe('1')])
    const spied: DriveDeps = {
      ...h.deps,
      store: { ...h.deps.store, appendRaw: async (_s, q) => { queries.push(q); return 'p' } },
    }
    await runDriveTimes(spied)
    expect(queries[0]).toBe('강화군 카페1')
  })

  it('집 좌표에서 출발한다', async () => {
    let origin = { lat: 0, lng: 0 }
    const h = harness([cafe('1')], {
      directions: {
        route: async (o) => {
          origin = o
          return { route: { minutes: 1, km: 1, tollWon: null }, payload: {} }
        },
      },
    })
    await runDriveTimes(h.deps)
    // 인천 부평구 수변로 334 (실제 집주소)
    expect(origin.lat).toBeCloseTo(37.5151091, 3)
    expect(origin.lng).toBeCloseTo(126.7398273, 3)
  })
})

describe('driveMinutesOf', () => {
  it('실측이 있으면 실측을 쓴다', () => {
    expect(driveMinutesOf({ driveMinutes: 64, driveMinutesEst: 46 })).toBe(64)
  })

  it('실측이 없으면 근사값을 쓴다', () => {
    expect(driveMinutesOf({ driveMinutes: null, driveMinutesEst: 46 })).toBe(46)
  })

  it('둘 다 없으면 null 이다', () => {
    expect(driveMinutesOf({ driveMinutes: null, driveMinutesEst: null })).toBeNull()
  })
})
