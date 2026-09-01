import { describe, expect, it } from 'vitest'
import {
  daysUnseen, LIVENESS_SOURCE, runLiveness, staleCafes, STALE_DAYS,
} from '../../src/jobs/liveness.js'
import type { Cafe, Health } from '../../src/schema.js'

const NOW = new Date('2026-08-25T00:00:00Z')

const cafe = (over: Partial<Cafe> & { kakaoPlaceId: string }): Cafe => ({
  name: `카페${over.kakaoPlaceId}`,
  sigungu: '부평구',
  lat: 37.5,
  lng: 126.7,
  firstSeenAt: '2026-08-20T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  attributes: null,
  tags: ['대형카페'],
  ...over,
} as unknown as Cafe)

function harness(cafes: Cafe[], 있는id: string[], 던질까 = false) {
  let saved = cafes
  let health: Health[] = []
  const deps = {
    store: {
      readCafes: async () => saved,
      writeCafes: async (c: Cafe[]) => { saved = c },
      appendRaw: async () => 'p',
      readHealth: async () => health,
      writeHealth: async (rows: Health[]) => { health = rows },
    },
    local: {
      searchKeyword: async (q: string) => {
        if (던질까) throw new Error('네트워크')
        const id = 있는id.find((i) => q.includes(`카페${i}`))
        return { places: id ? [{ id } as never] : [], payload: {} }
      },
    },
    now: NOW,
  }
  return { deps, saved: () => saved, health: () => health }
}

describe('daysUnseen', () => {
  it('한 번도 확인 못 했으면 null', () => {
    expect(daysUnseen(cafe({ kakaoPlaceId: '1' }), NOW)).toBeNull()
  })

  it('마지막 확인부터 며칠인지', () => {
    const c = cafe({ kakaoPlaceId: '1', lastSeenAt: '2026-08-20T00:00:00.000Z' })
    expect(daysUnseen(c, NOW)).toBe(5)
  })
})

describe('staleCafes', () => {
  it('오래 안 보인 통과 카페만 고른다', () => {
    const old = new Date(NOW.getTime() - (STALE_DAYS + 5) * 86_400_000).toISOString()
    const cafes = [
      cafe({ kakaoPlaceId: 'stale', lastSeenAt: old }),
      cafe({ kakaoPlaceId: 'fresh', lastSeenAt: NOW.toISOString() }),
      cafe({ kakaoPlaceId: 'pending', lastSeenAt: old, status: 'pending_extraction' }),
    ]
    expect(staleCafes(cafes, NOW).map((c) => c.kakaoPlaceId)).toEqual(['stale'])
  })

  it('첫 확인 전은 폐업 의심이 아니다', () => {
    // lastSeenAt 이 없다고 없어진 것이 아니다. 아직 확인을 안 한 것이다
    expect(staleCafes([cafe({ kakaoPlaceId: '1' })], NOW)).toEqual([])
  })
})

describe('runLiveness', () => {
  it('찾은 카페는 확인 날짜를 새로 쓴다', async () => {
    const h = harness([cafe({ kakaoPlaceId: '1' })], ['1'])
    const r = await runLiveness(h.deps)
    expect(r.seen).toBe(1)
    expect(h.saved()[0]!.lastSeenAt).toBe(NOW.toISOString())
  })

  it('못 찾은 카페는 날짜를 건드리지 않는다', async () => {
    const before = '2026-08-01T00:00:00.000Z'
    const h = harness([cafe({ kakaoPlaceId: '1', lastSeenAt: before })], [])
    const r = await runLiveness(h.deps)
    expect(r.missing).toBe(1)
    expect(h.saved()[0]!.lastSeenAt).toBe(before)
  })

  it('호출이 실패하면 "없다" 로 보지 않는다', async () => {
    // 네트워크 오류로 멀쩡한 카페가 폐업 의심에 들어가면 안 된다
    const before = '2026-08-01T00:00:00.000Z'
    const h = harness([cafe({ kakaoPlaceId: '1', lastSeenAt: before })], ['1'], true)
    const r = await runLiveness(h.deps)
    expect(r.failed).toBe(1)
    expect(r.missing).toBe(0)
    expect(h.saved()[0]!.lastSeenAt).toBe(before)
  })

  it('통과한 카페만 확인한다', async () => {
    const h = harness([
      cafe({ kakaoPlaceId: '1' }),
      cafe({ kakaoPlaceId: '2', status: 'pending_extraction' }),
      cafe({ kakaoPlaceId: '3', status: 'excluded_auto' }),
    ], ['1', '2', '3'])
    expect((await runLiveness(h.deps)).checked).toBe(1)
  })

  it('오래 못 본 것부터 확인한다 — 상한에 걸려도 위험한 쪽이 먼저다', async () => {
    const h = harness([
      cafe({ kakaoPlaceId: 'new', lastSeenAt: '2026-08-24T00:00:00.000Z' }),
      cafe({ kakaoPlaceId: 'old', lastSeenAt: '2026-08-01T00:00:00.000Z' }),
    ], ['new', 'old'])
    const r = await runLiveness(h.deps, { limit: 1 })
    expect(r.checked).toBe(1)
    expect(h.saved().find((c) => c.kakaoPlaceId === 'old')!.lastSeenAt).toBe(NOW.toISOString())
  })

  /**
   * watch 잡이 "몇 주 밀렸는지" 를 보려면 성공 시각이 남아야 한다 — 안 그러면
   * liveness 가 몇 주 조용히 멈춰도 아무 신호가 없다 (사용자 요청으로 추가).
   */
  it('한 곳이라도 확인되면 health 에 성공을 남긴다', async () => {
    const h = harness([cafe({ kakaoPlaceId: '1' })], ['1'])
    await runLiveness(h.deps)
    const row = h.health().find((r) => r.source === LIVENESS_SOURCE)
    expect(row?.lastSuccessAt).toBe(NOW.toISOString())
    expect(row?.consecutiveFailures).toBe(0)
  })

  it('호출이 실패하면 health 에 실패를 남기되 이전 성공 시각은 지우지 않는다', async () => {
    const h = harness([cafe({ kakaoPlaceId: '1' })], ['1'], true)
    await runLiveness(h.deps)
    const row = h.health().find((r) => r.source === LIVENESS_SOURCE)
    expect(row?.consecutiveFailures).toBe(1)
    expect(row?.lastError).toContain('네트워크')
  })
})
