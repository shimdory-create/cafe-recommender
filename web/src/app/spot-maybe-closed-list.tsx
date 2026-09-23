'use client'

import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { useAliveConfirmed } from '@/lib/use-alive'
import { ALIVE_GRACE_DAYS } from '@/lib/reviews'
import type { MaybeClosed } from '@/lib/spot-site-types'

export function SpotMaybeClosedList({ items }: { items: MaybeClosed[] }) {
  const { dismissed, dismiss } = useSpotDismissed()
  const { aliveIds, confirm } = useAliveConfirmed('/api/spot/alive')
  const shown = items.filter((m) => !dismissed.has(m.id) && !aliveIds.has(m.id))

  if (shown.length === 0) {
    return (
      <p className="mt-3 rounded-2xl border border-line bg-card p-4 text-[13px] text-ink-soft">
        폐업 의심으로 뜬 곳이 없어요.
      </p>
    )
  }

  return (
    <ul className="mt-3 flex flex-col gap-3">
      {shown.map((m) => (
        <li key={m.id} className="rounded-2xl border border-line bg-card p-4">
          <p className="font-semibold">{m.name}</p>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {m.sigungu} · 카카오지도에서 {m.days}일째 안 보여요
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href={m.naverMapUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[40px] flex-1 items-center justify-center rounded-lg border border-line text-[13px]"
            >
              네이버지도로 확인
            </a>
            <button
              type="button"
              onClick={() => confirm(m.id)}
              className="flex min-h-[40px] flex-1 items-center justify-center rounded-lg bg-emerald-50 text-[13px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              있어요
            </button>
            <button
              type="button"
              onClick={() => dismiss(m.id)}
              className="flex min-h-[40px] flex-1 items-center justify-center rounded-lg bg-amber-50 text-[13px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            >
              숨기기
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            &ldquo;있어요&rdquo;를 누르면 {ALIVE_GRACE_DAYS}일 동안 이 목록에 다시 안 뜹니다.
          </p>
        </li>
      ))}
    </ul>
  )
}
