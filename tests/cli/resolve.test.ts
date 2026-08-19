import { describe, it, expect } from 'vitest'
import { resolveCafe } from '../../src/cli/resolve.js'
import type { Cafe } from '../../src/schema.js'

const c = (id: string, name: string, sigungu: string): Cafe => ({
  kakaoPlaceId: id, name, sigungu, lat: 37, lng: 127,
  firstSeenAt: '2026-08-20T00:00:00.000Z', status: 'active',
  ambiguousName: false, attributes: null, tags: [],
})

const cafes = [
  c('1', '테라로사 서종점', '양평군'),
  c('2', '테라로사 포천점', '포천시'),
  c('3', '더티트렁크', '파주시'),
]

describe('resolveCafe', () => {
  it('부분 이름으로 하나를 특정하면 그것을 준다', () => {
    const r = resolveCafe(cafes, '더티')
    expect(r.kind).toBe('one')
    expect(r.kind === 'one' && r.cafe.kakaoPlaceId).toBe('3')
  })

  it('여러 개가 걸리면 후보를 돌려준다 — 임의로 고르지 않는다', () => {
    // "테라로사"만 쳤을 때 아무거나 고르면 방문 기록이 틀린 곳에 남는다
    const r = resolveCafe(cafes, '테라로사')
    expect(r.kind).toBe('many')
    expect(r.kind === 'many' && r.candidates).toHaveLength(2)
  })

  it('지역명을 붙이면 좁혀진다', () => {
    expect(resolveCafe(cafes, '양평 테라로사').kind).toBe('one')
    expect(resolveCafe(cafes, '포천 테라로사').kind).toBe('one')
  })

  it('상호가 정확히 일치하면 확정한다', () => {
    const dup = [...cafes, c('4', '테라로사', '강릉시')]
    const r = resolveCafe(dup, '테라로사')
    expect(r.kind).toBe('one')
    expect(r.kind === 'one' && r.cafe.kakaoPlaceId).toBe('4')
  })

  it('공백을 무시한다', () => {
    expect(resolveCafe(cafes, '더티 트렁크').kind).toBe('one')
  })

  it('못 찾으면 none 이다', () => {
    expect(resolveCafe(cafes, '없는곳').kind).toBe('none')
  })

  it('빈 질의는 none 이다', () => {
    expect(resolveCafe(cafes, '   ').kind).toBe('none')
  })
})
