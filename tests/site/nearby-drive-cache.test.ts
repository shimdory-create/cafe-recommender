import { describe, it, expect } from 'vitest'
import { pairKeyOf, buildPairIndex, lookupPair } from '../../src/site/nearby-drive-cache.js'
import type { NearbyDrivePair } from '../../src/schema.js'

describe('pairKeyOf', () => {
  it('방향이 달라도 같은 키를 만든다', () => {
    expect(pairKeyOf('a1', 'b2')).toBe(pairKeyOf('b2', 'a1'))
  })

  it('id를 정렬해 콜론으로 잇는다', () => {
    expect(pairKeyOf('b2', 'a1')).toBe('a1:b2')
  })
})

describe('buildPairIndex / lookupPair', () => {
  const pair: NearbyDrivePair = {
    pairKey: pairKeyOf('c1', 'r1'), minutes: 12, km: 5.5, tollWon: 0,
    measuredAt: '2026-09-15T00:00:00.000Z',
  }

  it('캐시에 있으면 방향 상관없이 찾는다', () => {
    const index = buildPairIndex([pair])
    expect(lookupPair(index, 'c1', 'r1')).toEqual(pair)
    expect(lookupPair(index, 'r1', 'c1')).toEqual(pair)
  })

  it('캐시에 없으면 null', () => {
    const index = buildPairIndex([pair])
    expect(lookupPair(index, 'c1', 's1')).toBeNull()
  })

  it('빈 캐시는 항상 null', () => {
    const index = buildPairIndex([])
    expect(lookupPair(index, 'c1', 'r1')).toBeNull()
  })
})
