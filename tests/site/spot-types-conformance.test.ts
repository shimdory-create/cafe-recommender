import { describe, it, expect } from 'vitest'
import type {
  SpotSitePayload as FromSchema, SiteSpot as SpotFromSchema,
} from '../../src/spot-schema.js'
import type {
  SpotSitePayload as FromWeb, SiteSpot as SpotFromWeb,
} from '../../web/src/lib/spot-site-types.js'

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

describe('가볼 곳 표시용 페이로드 타입', () => {
  it('zod 스키마와 웹 인터페이스가 서로 대입된다', () => {
    const bothWays: Exact<FromSchema, FromWeb> = true
    expect(bothWays).toBe(true)
  })

  it('가볼 곳 한 건도 서로 대입된다', () => {
    const bothWays: Exact<SpotFromSchema, SpotFromWeb> = true
    expect(bothWays).toBe(true)
  })
})
