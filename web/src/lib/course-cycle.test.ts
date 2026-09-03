import { describe, it, expect } from 'vitest'
import { pickCourseItem } from './course-cycle'
import type { NearbyCard } from './nearby-types'

function card(id: string): NearbyCard {
  return {
    id, name: id, imageUrl: null, tags: [], sigungu: '', ratingAvg: 0,
    ratingCount: 0, distanceKm: 1, directionsUrl: 'https://map.naver.com/p/directions/x',
  }
}

describe('pickCourseItem', () => {
  it('빈 배열이면 null', () => {
    expect(pickCourseItem([], 0)).toBeNull()
  })

  it('인덱스가 배열 길이 안이면 그 자리의 카드', () => {
    const items = [card('a'), card('b'), card('c')]
    expect(pickCourseItem(items, 0)).toEqual(card('a'))
    expect(pickCourseItem(items, 1)).toEqual(card('b'))
  })

  it('인덱스가 배열 길이를 넘으면 모듈로 순환한다', () => {
    const items = [card('a'), card('b'), card('c')]
    expect(pickCourseItem(items, 3)).toEqual(card('a'))
    expect(pickCourseItem(items, 4)).toEqual(card('b'))
    expect(pickCourseItem(items, 100)).toEqual(card('b')) // 100 % 3 === 1
  })

  it('배열이 1개뿐이면 인덱스와 상관없이 그 카드', () => {
    const items = [card('only')]
    expect(pickCourseItem(items, 0)).toEqual(card('only'))
    expect(pickCourseItem(items, 5)).toEqual(card('only'))
  })
})
