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
  it('Layer 2 사유만 고른다 — 규칙이 바뀐 것은 그것뿐이다', () => {
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '1' }))).toBe(true)
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '2', excludeReason: '정밀도 10% < 30%' }))).toBe(true)
  })

  it('규칙이 그대로인 사유는 건드리지 않는다', () => {
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '3', excludeReason: 'franchise' }))).toBe(false)
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '4', excludeReason: 'category' }))).toBe(false)
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '5', excludeReason: '주차 불가 — 차로 갈 수 없다' }))).toBe(false)
    expect(isBuzzExcluded(cafe({ kakaoPlaceId: '6', excludeReason: '동네 카페 (성격 태그 0개)' }))).toBe(false)
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

  it('지점명 없는 카페의 정밀도 사유는 손대지 않는다', () => {
    // 관련성 규칙이 바뀐 대상은 지점명 카페뿐이다. 나머지는 다시 재도 같은
    // 값이 나와 쿼터만 쓴다
    const cafes = [cafe({ kakaoPlaceId: 'p', excludeReason: '정밀도 5% < 30%' })]
    expect(requeueTargets(cafes, [buzz('p', 50)], NOW)).toEqual([])
  })

  it('지점명 카페는 저장된 값으로 판단하지 않는다', () => {
    // `포레스트아웃팅스 송도점` 이 옛 값(월 2.4건)으로 "지금도 탈락" 판정을
    // 받아 영원히 못 돌아왔다. 다시 재니 통과했다
    const 지점 = cafe({
      kakaoPlaceId: 'b', name: '포레스트아웃팅스 송도점', excludeReason: '월 2.4건 < 4건',
    })
    expect(requeueTargets([지점], [buzz('b', 2.4)], NOW)).toHaveLength(1)
    const 지점정밀도 = cafe({
      kakaoPlaceId: 'c', name: '포레스트아웃팅스 일산본점', excludeReason: '정밀도 10% < 30%',
    })
    expect(requeueTargets([지점정밀도], [buzz('c', 12)], NOW)).toHaveLength(1)
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
