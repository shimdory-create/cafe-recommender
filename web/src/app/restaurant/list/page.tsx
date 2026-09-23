import { restaurantPayload, toRestaurantListRow } from '@/lib/restaurant-site'
import { readListParams } from '@/lib/url-state'
import { RestaurantListClient } from './restaurant-list-client'

export const metadata = { title: '식당 전체 리스트 — 심김 빵지순례' }

/**
 * 전체 리스트. 무한 스크롤을 만들지 않는다 — 카페 목록과 같은 이유
 * (`web/src/app/list/page.tsx` 참고).
 *
 * 필터를 **서버에서 읽어** 초기 상태로 넘긴다. 그래야 상세에서 뒤로
 * 돌아왔을 때 고른 칩이 처음부터 눌린 채로 그려진다.
 */
export default async function RestaurantListPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  // 목록에 필요한 필드만 클라이언트로 넘긴다 (restaurant-site.ts toRestaurantListRow 주석 참고)
  return (
    <RestaurantListClient
      restaurants={restaurantPayload.restaurants.map(toRestaurantListRow)}
      initial={initial}
      maybeClosed={restaurantPayload.maybeClosed}
    />
  )
}
