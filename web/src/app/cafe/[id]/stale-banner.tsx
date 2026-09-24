'use client'

import { isStale } from '@/lib/site'
import { useDismissed } from '@/lib/use-dismissed'
import { useAliveConfirmed } from '@/lib/use-alive'

/**
 * 카드의 폐업 의심 배너를 상세 페이지에도 그대로 옮긴 것. 리스트·홈피드
 * 카드와 달리 상세 페이지는 한 곳만 보여주므로 "숨기기"를 눌러도 페이지
 * 자체는 그대로 있고 배너만 사라진다 — 목록에서 빠지는 효과는 그 목록
 * 화면에 돌아갔을 때 나타난다.
 */
export function StaleBanner({
  kakaoPlaceId, lastSeenAt, visited,
}: {
  kakaoPlaceId: string
  lastSeenAt: string | null
  visited: boolean
}) {
  const { dismissed, dismiss } = useDismissed()
  const { aliveIds, confirm } = useAliveConfirmed('/api/alive')

  const stale = !visited && isStale(lastSeenAt) && !aliveIds.has(kakaoPlaceId)
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
