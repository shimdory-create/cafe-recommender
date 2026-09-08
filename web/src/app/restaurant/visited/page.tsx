import { restaurantPayload, RESTAURANT_REVISIT_DAYS } from '@/lib/restaurant-site'
import { readListParams } from '@/lib/url-state'
import { RestaurantVisitedList, type KnownRestaurant } from './restaurant-visited-list'

export const metadata = { title: '다녀온 식당 — 심김 빵지순례' }

export default async function RestaurantVisitedPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  const known: KnownRestaurant[] = restaurantPayload.restaurants.map((r) => ({
    id: r.id, name: r.name, sigungu: r.sigungu, area: r.area, tags: r.tags,
    naverMapUrl: r.naverMapUrl, imageUrl: r.imageUrl,
    posts30: r.posts30, posts90: r.posts90,
  }))

  return (
    <div className="py-5">
      <h1 className="text-[22px] font-bold tracking-tight">다녀온 식당</h1>
      <RestaurantVisitedList built={restaurantPayload.visited} known={known} initial={initial} />

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        다녀온 곳은 {Math.round(RESTAURANT_REVISIT_DAYS / 30)}개월간 추천에서 내려갑니다.
        <br />
        또 가고 싶으면 전체 리스트에서 찾을 수 있어요.
      </p>
    </div>
  )
}
