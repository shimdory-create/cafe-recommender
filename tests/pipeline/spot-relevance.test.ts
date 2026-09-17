import { describe, it, expect } from 'vitest'
import { isSpotRelevant, isFoodCategory } from '../../src/pipeline/spot-relevance.js'

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

describe('isFoodCategory', () => {
  it('카카오 분류가 음식점으로 시작하면 음식점이다 (카페 포함)', () => {
    expect(isFoodCategory('음식점 > 카페 > 커피전문점')).toBe(true)
    expect(isFoodCategory('음식점 > 한식 > 육류,고기 > 족발,보쌈')).toBe(true)
    expect(isFoodCategory('음식점 > 간식 > 제과,베이커리')).toBe(true)
  })

  it('가볼 곳다운 분류는 음식점이 아니다', () => {
    expect(isFoodCategory('여행 > 공원 > 도시근린공원')).toBe(false)
    expect(isFoodCategory('문화,예술 > 문화시설 > 박물관')).toBe(false)
  })

  it('유아 놀이시설(키즈카페)은 이름에 카페가 들어가도 음식점이 아니다', () => {
    expect(isFoodCategory('가정,생활 > 유아 > 놀이시설 > 키즈카페')).toBe(false)
  })

  it('분류가 없으면 음식점이 아니다', () => {
    expect(isFoodCategory(null)).toBe(false)
    expect(isFoodCategory('')).toBe(false)
  })
})
