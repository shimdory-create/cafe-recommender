'use client'

import { restaurantIsStale } from '@/lib/restaurant-site'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { useAliveConfirmed } from '@/lib/use-alive'

/** cafe/[id]/stale-banner.tsx 의 식당판. 설명은 그쪽 참고. */
export function StaleBanner({
  kakaoPlaceId, lastSeenAt, visited,
}: {
  kakaoPlaceId: string
  lastSeenAt: string | null
  visited: boolean
}) {
  const { dismissed, dismiss } = useRestaurantDismissed()
  const { aliveIds, confirm } = useAliveConfirmed('/api/restaurant/alive')

  const stale = !visited && restaurantIsStale(lastSeenAt) && !aliveIds.has(kakaoPlaceId)
    && !dismissed.has(kakaoPlaceId)
  if (!stale) return null

  return (
    <div className="mt-3 flex items-center justify-between gap-1 rounded-xl bg-amber-50 pl-3 pr-1 text-[13px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <span>폐업 의심 · 카카오지도에서 최근 안 보여요</span>
      <span className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => confirm(kakaoPlaceId)}
          className="flex min-h-[44px] shrink-0 items-center px-2.5 underline"
        >
          있어요
        </button>
        <button
          type="button"
          onClick={() => dismiss(kakaoPlaceId)}
          className="flex min-h-[44px] shrink-0 items-center px-2.5 underline"
        >
          숨기기
        </button>
      </span>
    </div>
  )
}
