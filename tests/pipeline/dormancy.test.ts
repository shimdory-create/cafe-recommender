import { describe, it, expect } from 'vitest'
import { nextQuietState, DORMANT_AGE_DAYS, QUIET_STREAK_DAYS } from '../../src/pipeline/dormancy.js'

const now = new Date('2026-09-28T00:00:00.000Z')
const old = new Date(now.getTime() - (DORMANT_AGE_DAYS + 10) * 86_400_000).toISOString()
const fresh = new Date(now.getTime() - 10 * 86_400_000).toISOString()

describe('nextQuietState', () => {
  it('화제량이 기준을 통과하면 streak 를 초기화한다', () => {
    const r = nextQuietState({
      quietSince: '2026-09-01', firstSeenAt: old, passesBuzz: true, now, today: '2026-09-28',
    })
    expect(r).toEqual({ quietSince: null, shouldGoDormant: false })
  })

  it('등록한 지 얼마 안 됐으면(180일 미만) 기준 미달이어도 휴면 대상이 아니다', () => {
    const r = nextQuietState({
      quietSince: null, firstSeenAt: fresh, passesBuzz: false, now, today: '2026-09-28',
    })
    expect(r).toEqual({ quietSince: null, shouldGoDormant: false })
  })

  it('처음 기준 미달이면 오늘 날짜로 streak 를 시작한다', () => {
    const r = nextQuietState({
      quietSince: null, firstSeenAt: old, passesBuzz: false, now, today: '2026-09-28',
    })
    expect(r).toEqual({ quietSince: '2026-09-28', shouldGoDormant: false })
  })

  it(`streak 가 ${QUIET_STREAK_DAYS}일 미만이면 아직 휴면으로 넘기지 않는다`, () => {
    const since = new Date(now.getTime() - (QUIET_STREAK_DAYS - 1) * 86_400_000).toISOString().slice(0, 10)
    const r = nextQuietState({
      quietSince: since, firstSeenAt: old, passesBuzz: false, now, today: '2026-09-28',
    })
    expect(r.shouldGoDormant).toBe(false)
    expect(r.quietSince).toBe(since)
  })

  it(`streak 가 ${QUIET_STREAK_DAYS}일 이상이면 휴면으로 넘긴다`, () => {
    const since = new Date(now.getTime() - QUIET_STREAK_DAYS * 86_400_000).toISOString().slice(0, 10)
    const r = nextQuietState({
      quietSince: since, firstSeenAt: old, passesBuzz: false, now, today: '2026-09-28',
    })
    expect(r.shouldGoDormant).toBe(true)
  })
})
