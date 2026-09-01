import { describe, it, expect } from 'vitest'
import type {
  RestaurantSitePayload as FromSchema, SiteRestaurant as RestaurantFromSchema,
} from '../../src/restaurant-schema.js'
import type {
  RestaurantSitePayload as FromWeb, SiteRestaurant as RestaurantFromWeb,
} from '../../web/src/lib/restaurant-site-types.js'

/**
 * 웹앱이 쓰는 타입과 zod 스키마가 어긋나지 않는지 **타입 수준에서** 검사한다.
 * 카페의 tests/site/types-conformance.test.ts 와 같은 패턴 —
 * web/ 은 src/restaurant-schema.ts 를 import 할 수 없어 인터페이스를 한 번
 * 더 적었고, 드리프트는 **zod 가 있는 이쪽**에서 잡는다.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

describe('식당 표시용 페이로드 타입', () => {
  it('zod 스키마와 웹 인터페이스가 서로 대입된다', () => {
    const bothWays: Exact<FromSchema, FromWeb> = true
    expect(bothWays).toBe(true)
  })

  it('식당 한 건도 서로 대입된다', () => {
    const bothWays: Exact<RestaurantFromSchema, RestaurantFromWeb> = true
    expect(bothWays).toBe(true)
  })
})
