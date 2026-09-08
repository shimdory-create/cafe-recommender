import { Suspense } from 'react'
import { restaurantHomeFeed, restaurantPayload, toRestaurantListRow, type SiteRestaurant } from '@/lib/restaurant-site'
import { postsLabel } from '@/lib/labels'
import { PAGE_SIZE } from '@/lib/paging'
import { RestaurantHomeFeed } from '../restaurant-home-feed'
import { RestaurantFeedCards, type RestaurantFeedRow } from '../restaurant-feed-cards'

function reasonLine(posts30: number, posts90: number, trend: SiteRestaurant['trend']): string {
  const posts = postsLabel(posts30, posts90)
  return trend === 'rising' ? `${posts} · 지금 뜨는 중` : posts
}

export default function RestaurantHome() {
  const feed: RestaurantFeedRow[] = restaurantHomeFeed().map((r) => ({
    ...toRestaurantListRow(r),
    reason: reasonLine(r.posts30, r.posts90, r.trend),
  }))

  const week = new Date(restaurantPayload.weekOf)
  const label = `${week.getMonth() + 1}월 ${week.getDate()}일 주`

  return (
    <div className="py-5">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold tracking-tight">이번 주 추천 식당</h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          {label} · 블로그 화제량과 우리집(인천 부평) 거리로 골랐어요
        </p>
      </div>

      {feed.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-5 text-[14px] text-ink-soft">
          아직 추천할 식당이 없어요. 수집이 끝나면 채워집니다.
        </p>
      ) : (
        <Suspense fallback={<RestaurantFeedCards rows={feed.slice(0, PAGE_SIZE)} />}>
          <RestaurantHomeFeed rows={feed} />
        </Suspense>
      )}

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        {restaurantPayload.stats.regions}개 시군구에서 고른 {restaurantPayload.stats.passed}곳 중에서
        <br />
        주차·음식종류·거리를 함께 보고 {Math.min(PAGE_SIZE, feed.length)}곳씩 추렸어요
      </p>
    </div>
  )
}
