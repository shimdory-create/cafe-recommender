import { describe, expect, it } from 'vitest'
import { minPostsFor, passesLayer2 } from '../../src/pipeline/buzz.js'

const NOW = new Date('2026-08-24T12:00:00Z')

/** 신규 오픈 구제에 걸리지 않도록 첫 글을 충분히 과거로 둔다 */
const base = { precision: 0.8, firstPostDate: '2024-01-01' }

describe('minPostsFor — 거리별 화제량 컷', () => {
  it('가까우면 절반, 중간은 3/4, 멀면 그대로', () => {
    expect(minPostsFor(25)).toBe(4)
    expect(minPostsFor(40)).toBe(4)
    expect(minPostsFor(41)).toBe(6)
    expect(minPostsFor(70)).toBe(6)
    expect(minPostsFor(71)).toBe(8)
  })

  it('거리를 모르면 가장 엄한 컷을 쓴다', () => {
    expect(minPostsFor(null)).toBe(8)
    expect(minPostsFor(undefined)).toBe(8)
  })

  it('기준값을 바꾸면 비율이 따라간다', () => {
    expect(minPostsFor(25, 12)).toBe(6)
  })
})

describe('passesLayer2 — 거리에 따라 컷이 달라진다', () => {
  it('집 근처 월 5건은 통과한다', () => {
    // 실측: 화제량 부족 배제 179곳 중 123곳이 40분 이내였다.
    // "빵고베이커리 (부평구 2분) 월 5.5건" 같은 곳이 잘려 나갔다
    const r = passesLayer2({ ...base, postsPer30: 5 }, { now: NOW, driveMinutes: 25 })
    expect(r.pass).toBe(true)
  })

  it('먼 곳 월 5건은 그대로 탈락한다', () => {
    const r = passesLayer2({ ...base, postsPer30: 5 }, { now: NOW, driveMinutes: 90 })
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('월 5.0건 < 8건')
  })

  it('거리를 안 주면 예전과 같다', () => {
    expect(passesLayer2({ ...base, postsPer30: 5 }, { now: NOW }).pass).toBe(false)
    expect(passesLayer2({ ...base, postsPer30: 9 }, { now: NOW }).pass).toBe(true)
  })

  it('정밀도 컷은 거리와 무관하다', () => {
    // "이 카페 얘기가 맞는가" 는 거리와 상관없는 질문이다
    const r = passesLayer2(
      { ...base, precision: 0.1, postsPer30: 50 },
      { now: NOW, driveMinutes: 10 },
    )
    expect(r.pass).toBe(false)
    expect(r.reason).toContain('정밀도')
  })

  it('탈락 사유에 실제 적용된 컷이 적힌다', () => {
    // `월 3.0건 < 8건` 이라고 적어두면 나중에 requeue 가 잘못 판단한다
    const r = passesLayer2({ ...base, postsPer30: 3 }, { now: NOW, driveMinutes: 20 })
    expect(r.reason).toBe('월 3.0건 < 4건')
  })
})
