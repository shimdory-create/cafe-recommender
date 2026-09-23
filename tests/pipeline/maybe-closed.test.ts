import { describe, it, expect } from 'vitest'
import { excludeVisited } from '../../src/pipeline/maybe-closed.js'

const row = (id: string) => ({ kakaoPlaceId: id, name: `곳${id}` })

describe('excludeVisited', () => {
  it('방문 기록이 있는 곳은 뺀다', () => {
    const out = excludeVisited([row('1'), row('2')], [{ kakaoPlaceId: '1' }])
    expect(out.map((r) => r.kakaoPlaceId)).toEqual(['2'])
  })

  it('방문 기록이 없으면 전부 남는다', () => {
    const out = excludeVisited([row('1'), row('2')], [])
    expect(out).toHaveLength(2)
  })

  it('전부 방문했으면 빈 배열이다', () => {
    const out = excludeVisited([row('1')], [{ kakaoPlaceId: '1' }, { kakaoPlaceId: '2' }])
    expect(out).toEqual([])
  })
})
