import { describe, it, expect } from 'vitest'
import type { SitePayload as FromSchema, SiteCafe as CafeFromSchema } from '../../src/schema.js'
import type {
  SitePayload as FromWeb, SiteCafe as CafeFromWeb,
} from '../../web/src/lib/site-types.js'

/**
 * 웹앱이 쓰는 타입과 zod 스키마가 어긋나지 않는지 **타입 수준에서** 검사한다.
 *
 * 웹은 `src/schema.ts` 를 import 할 수 없다 — 그 파일은 web 밖이라 모듈
 * 해석이 위로 올라가고, Vercel 은 web 에서만 설치하므로 zod 를 찾지 못해
 * 배포가 실패한다 (실측 2회). 그래서 인터페이스를 한 번 더 적었고,
 * 드리프트는 **zod 가 있는 이쪽**에서 잡는다.
 *
 * 생성기가 필드를 추가·변경하면 아래 대입이 컴파일되지 않는다.
 * `npm run typecheck` 가 CI 문지기다.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

describe('표시용 페이로드 타입', () => {
  it('zod 스키마와 웹 인터페이스가 서로 대입된다', () => {
    const bothWays: Exact<FromSchema, FromWeb> = true
    expect(bothWays).toBe(true)
  })

  it('카페 한 건도 서로 대입된다', () => {
    const bothWays: Exact<CafeFromSchema, CafeFromWeb> = true
    expect(bothWays).toBe(true)
  })
})
