'use client'

import Link from 'next/link'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { useAliveConfirmed } from '@/lib/use-alive'
import type { MaybeClosed } from '@/lib/spot-site-types'

/**
 * 정보 탭·전체 탭 상단에 쓰는 링크. 숨긴 곳·"있어요" 확인한 곳을 빼고
 * 세므로, 다 처리하면 조용히 사라진다.
 */
export function SpotMaybeClosedLink({ items }: { items: MaybeClosed[] }) {
  const { dismissed, ready: dismissedReady } = useSpotDismissed()
  const { aliveIds, ready: aliveReady } = useAliveConfirmed('/api/spot/alive')
  if (!dismissedReady || !aliveReady) return null
  const count = items.filter((m) => !dismissed.has(m.id) && !aliveIds.has(m.id)).length
  if (count === 0) return null

  return (
    <Link
      href="/spot/maybe-closed"
      className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-card p-4 text-[13px]"
    >
      <span>폐업 의심 {count}곳 확인</span>
      <span className="text-ink-soft">→</span>
    </Link>
  )
}
