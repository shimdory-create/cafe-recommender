import { describe, it, expect } from 'vitest'
import { evaluateRestaurantExclusion } from '../../src/pipeline/restaurant-exclude.js'

describe('evaluateRestaurantExclusion', () => {
  it('배달·포장 전용은 카테고리로 배제한다', () => {
    const r = evaluateRestaurantExclusion({ name: '아무개식당', categoryName: '음식점 > 배달전문' }, [])
    expect(r).toBe('category')
  })

  it('술집·호프는 카테고리로 배제한다', () => {
    const r = evaluateRestaurantExclusion(
      { name: '아무개호프', categoryName: '음식점 > 호프,요리주점' },
      [],
    )
    expect(r).toBe('category')
  })

  it('블랙리스트(프랜차이즈)에 있으면 배제한다', () => {
    const r = evaluateRestaurantExclusion(
      { name: '맥도날드 부평점', categoryName: '음식점 > 패스트푸드' },
      [{ pattern: '맥도날드', matchType: 'contains' }],
    )
    expect(r).toBe('franchise')
  })

  it('둘 다 아니면 배제하지 않는다', () => {
    const r = evaluateRestaurantExclusion(
      { name: '소문난식당', categoryName: '음식점 > 한식' },
      [],
    )
    expect(r).toBeNull()
  })
})
