import { describe, it, expect } from 'vitest'
import { isRestaurantRelevant } from '../../src/pipeline/restaurant-relevance.js'

const doc = (title: string, contents = '') => ({
  title,
  contents,
  dateTime: new Date(),
  thumbnail: '',
} as never)

describe('isRestaurantRelevant', () => {
  it('상호명 + 식당 문맥어가 있으면 관련 있다', () => {
    expect(isRestaurantRelevant(doc('부평 소문난식당 다녀왔어요 맛집'), '소문난식당')).toBe(true)
  })

  it('문맥어가 없으면 관련 없다 (상호명만으로는 부족)', () => {
    expect(isRestaurantRelevant(doc('소문난식당 근처 공원 산책'), '소문난식당')).toBe(false)
  })

  it('상호명이 아예 없으면 관련 없다', () => {
    expect(isRestaurantRelevant(doc('오늘 점심 맛집 다녀옴'), '소문난식당')).toBe(false)
  })
})
