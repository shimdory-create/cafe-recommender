import { describe, it, expect } from 'vitest'
import { isSpotRelevant } from '../../src/pipeline/spot-relevance.js'

const doc = (title: string, contents = '') => ({
  title, contents, dateTime: new Date(), thumbnail: '',
} as never)

describe('isSpotRelevant', () => {
  it('상호명 + 가볼 곳 문맥어가 있으면 관련 있다', () => {
    expect(isSpotRelevant(doc('부평 아무개공원 다녀왔어요 나들이'), '아무개공원')).toBe(true)
  })

  it('문맥어가 없으면 관련 없다 (상호명만으로는 부족)', () => {
    expect(isSpotRelevant(doc('아무개공원 근처 맛집'), '아무개공원')).toBe(false)
  })

  it('상호명이 아예 없으면 관련 없다', () => {
    expect(isSpotRelevant(doc('오늘 나들이 다녀옴'), '아무개공원')).toBe(false)
  })
})
