import { describe, it, expect } from 'vitest'
import type { NearbyRelation as FromBackend } from '../../src/site/nearby-payload.js'
import type { NearbyRelation as FromWeb } from '../../web/src/lib/nearby-resolve.js'

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

describe('근처 추천 관계 정보 타입', () => {
  it('백엔드와 웹의 NearbyRelation이 서로 대입된다', () => {
    const bothWays: Exact<FromBackend, FromWeb> = true
    expect(bothWays).toBe(true)
  })
})
