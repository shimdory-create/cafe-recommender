import { describe, expect, it } from 'vitest'
import { applyRequeue, isBuzzExcluded, requeueTargets } from '../../src/jobs/requeue.js'
import type { BuzzSnapshot, Cafe } from '../../src/schema.js'

const NOW = new Date('2026-08-24T12:00:00Z')

const cafe = (over: Partial<Cafe> & { kakaoPlaceId: string }): Cafe => ({
  name: '카페',
  sigungu: '부평구',
  lat: 37.5,
  lng: 126.7,
  driveMinutes: 20,
  firstSeenAt: '2026-08-20T00:00:00.000Z',
  status: 'excluded_auto',
  excludeReason: '월 5.0건 < 8건',
  ambiguousName: false,
  attributes: null,
  tags: [],
  ...over,
} as unknown as Cafe)

const buzz = (id: string, rate: number): BuzzSnapshot => ({
  kakaoPlaceId: id,
  capturedAt: '2026-08-24',
  precision: 0.8,
  postsPer30: rate,
  firstPostDate: '2024-01-01',
} as unknown as BuzzSnapshot)

describe('isBuzzExcluded', () => {
  it('화제량 사유만 고른다', () => {
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '1' }))).toBe(true)
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '2', excludeReason: '정밀도 10% < 30%' }))).toBe(false)
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '3', excludeReason: 'franchise' }))).toBe(false)
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '4', excludeReason: '주차 불가 — 차로 갈 수 없다' }))).toBe(false)
  })

  it('배제 상태가 아니면 대상이 아니다', () => {
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '1', status: 'active' }))).toBe(false)
  })
})

describe('requeueTargets', () => {
  it('지금 규칙이면 통과할 것만 되돌린다', () => {
    const cafes = [
      cafe({ kakaoPlaceId: 'near5', driveMinutes: 20 }), // 컷 4건 -> 통과
      cafe({ kakaoPlaceId: 'far5', driveMinutes: 90 }), // 컷 8건 -> 그대로 탈락
    ]
    const out = requeueTargets(cafes, [buzz('near5', 5), buzz('far5', 5)], NOW)
    expect(out.map((c) => c.kakaoPlaceId)).toEqual(['near5'])
  })

  it('규칙이 안 바뀐 사유는 손대지 않는다', () => {
    const cafes = [cafe({ kakaoPlaceId: 'p', excludeReason: '정밀도 5% < 30%' })]
    expect(requeueTargets(cafes, [buzz('p', 50)], NOW)).toEqual([])
  })

  it('화제량 측정이 없으면 되돌리지 않는다', () => {
    // 판단할 근거가 없다. 다음 buzz 회차 뒤에 다시 본다
    expect(requeueTargets([cafe({ kakaoPlaceId: 'x' })], [], NOW)).toEqual([])
  })

  it('가장 최근 측정을 쓴다', () => {
    const cafes = [cafe({ kakaoPlaceId: 'a', driveMinutes: 20 })]
    const old = { ...buzz('a', 1), capturedAt: '2026-08-01' }
    const fresh = { ...buzz('a', 6), capturedAt: '2026-08-24' }
    expect(requeueTargets(cafes, [old, fresh], NOW)).toHaveLength(1)
    expect(requeueTargets(cafes, [fresh, old], NOW)).toHaveLength(1)
  })
})

describe('applyRequeue', () => {
  it('대기로 되돌리고 사유를 지운다', () => {
    const c = cafe({ kakaoPlaceId: '1' })
    expect(applyRequeue([c])).toBe(1)
    expect(c.status).toBe('pending_extraction')
    expect(c.excludeReason).toBeNull()
  })
})
