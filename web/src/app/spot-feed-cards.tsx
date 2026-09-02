import { SpotCard } from './spot-card'
import { spotIsStale, type SpotListRow } from '@/lib/spot-site'

export interface SpotFeedRow extends SpotListRow {
  reason: string
}

export function SpotFeedCards({
  rows, offset = 0, showRank = true, wished, onToggleWish, onDismiss,
}: {
  rows: SpotFeedRow[]
  offset?: number
  showRank?: boolean
  wished?: Set<string>
  onToggleWish?: (id: string) => void
  onDismiss?: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {rows.map((r, i) => (
        <div key={r.id}>
          <SpotCard
            spot={r}
            rank={showRank ? offset + i + 1 : undefined}
            wished={wished?.has(r.id)}
            onToggleWish={onToggleWish ? () => onToggleWish(r.id) : undefined}
            stale={!r.visitedOn && spotIsStale(r.lastSeenAt)}
            onDismiss={onDismiss ? () => onDismiss(r.id) : undefined}
          />
          <p className="mt-1.5 px-1 text-[12px] text-ink-soft">{r.reason}</p>
        </div>
      ))}
    </div>
  )
}
