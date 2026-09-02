import { describe, it, expect } from 'vitest'
import { filterOutHidden } from './nearby-filter'
import type { NearbyCard } from './nearby-types'

function card(id: string): NearbyCard {
  return {
    id, name: id, imageUrl: null, tags: [], sigungu: '', ratingAvg: 0,
    ratingCount: 0, distanceKm: 1, directionsUrl: 'https://map.naver.com/p/directions/x',
  }
}

describe('filterOutHidden', () => {
  it('숨김 목록에 있는 항목을 뺀다', () => {
    const items = [card('a'), card('b'), card('c')]
    expect(filterOutHidden(items, new Set(['b']))).toEqual([card('a'), card('c')])
  })

  it('숨김 목록이 비어있으면 그대로 돌려준다', () => {
    const items = [card('a'), card('b')]
    expect(filterOutHidden(items, new Set())).toEqual(items)
  })

  it('전부 숨겨지면 빈 배열을 돌려준다', () => {
    const items = [card('a'), card('b')]
    expect(filterOutHidden(items, new Set(['a', 'b']))).toEqual([])
  })
})
