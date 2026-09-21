import { describe, it, expect } from 'vitest'
import { familyActivityIds } from '../../src/pipeline/family-activity.js'

describe('familyActivityIds', () => {
  it('여러 소스(위시리스트·리뷰·다녀왔어요)의 id를 하나의 집합으로 합친다', () => {
    const ids = familyActivityIds([
      [{ kakaoPlaceId: '1' }],
      [{ kakaoPlaceId: '2' }, { kakaoPlaceId: '1' }],
      [],
    ])
    expect(ids).toEqual(new Set(['1', '2']))
  })

  it('소스가 전부 비어있으면 빈 집합이다', () => {
    expect(familyActivityIds([[], []])).toEqual(new Set())
  })
})
