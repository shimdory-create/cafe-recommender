import { describe, it, expect } from 'vitest'
import { passesGate, passesHardGate } from '../../src/pipeline/gate.js'

describe('passesGate', () => {
  it('태그가 있고 주차 A 면 통과한다', () => {
    expect(passesGate({ tags: ['대형카페'], parkingGrade: 'A' }).pass).toBe(true)
  })

  it('태그가 0개면 동네 카페로 제외한다', () => {
    const r = passesGate({ tags: [], parkingGrade: 'A' })
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/동네/)
  })

  it('주차 D 는 차로 못 가므로 제외한다', () => {
    const r = passesGate({ tags: ['대형카페'], parkingGrade: 'D' })
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/주차/)
  })

  it('주차 C 는 기본 숨김, 도심 모드에서만 통과한다', () => {
    expect(passesGate({ tags: ['대형카페'], parkingGrade: 'C' }).pass).toBe(false)
    expect(passesGate({ tags: ['대형카페'], parkingGrade: 'C' }, { cityMode: true }).pass).toBe(true)
  })

  it('주차 불명(?)은 제외하지 않는다', () => {
    // 정보가 없다는 이유로 좋은 곳을 버리지 않는다. 카드에 배지로 알린다.
    expect(passesGate({ tags: ['뷰맛집'], parkingGrade: '?' }).pass).toBe(true)
  })

  it('주차 B 는 통과한다', () => {
    expect(passesGate({ tags: ['대형카페'], parkingGrade: 'B' }).pass).toBe(true)
  })

  it('태그 0개는 도심 모드에서도 제외한다', () => {
    expect(passesGate({ tags: [], parkingGrade: 'A' }, { cityMode: true }).pass).toBe(false)
  })

  it('태그 0개와 주차 D 가 겹치면 동네 카페를 먼저 알린다', () => {
    expect(passesGate({ tags: [], parkingGrade: 'D' }).reason).toMatch(/동네/)
  })
})

describe('passesHardGate', () => {
  it('태그 0개는 되돌릴 수 없는 배제다', () => {
    expect(passesHardGate({ tags: [], parkingGrade: 'A' }).pass).toBe(false)
  })

  it('주차 D 는 되돌릴 수 없는 배제다', () => {
    expect(passesHardGate({ tags: ['대형카페'], parkingGrade: 'D' }).pass).toBe(false)
  })

  it('주차 C 는 여기서 막지 않는다', () => {
    // 판정 잡이 C 를 excluded_auto 로 굳히면 도심 모드가 영원히 불가능해진다.
    // 실측: C 로 배제된 50곳 때문에 --city 가 일반 모드와 똑같은 결과를 냈다.
    expect(passesHardGate({ tags: ['대형카페'], parkingGrade: 'C' }).pass).toBe(true)
  })

  it('주차 미확인도 막지 않는다', () => {
    expect(passesHardGate({ tags: ['대형카페'], parkingGrade: '?' }).pass).toBe(true)
  })
})
