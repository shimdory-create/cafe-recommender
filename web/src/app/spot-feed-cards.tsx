import { SpotCard } from './spot-card'
import { spotIsStale, type SpotListRow } from '@/lib/spot-site'

export interface SpotFeedRow extends SpotListRow {
  reason: string
}

export function SpotFeedCards({
  rows, offset = 0, showRank = true, wished, onToggleWish, onToggleBlacklist, onDismiss,
  aliveIds, onAlive,
}: {
  rows: SpotFeedRow[]
  offset?: number
  showRank?: boolean
  wished?: Set<string>
  onToggleWish?: (id: string) => void
  onToggleBlacklist?: (id: string) => void
  onDismiss?: (id: string) => void
  aliveIds?: Set<string>
  onAlive?: (id: string) => void
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
            onToggleBlacklist={onToggleBlacklist ? () => onToggleBlacklist(r.id) : undefined}
            stale={!r.visitedOn && spotIsStale(r.lastSeenAt) && !aliveIds?.has(r.id)}
            onDismiss={onDismiss ? () => onDismiss(r.id) : undefined}
            onAlive={onAlive ? () => onAlive(r.id) : undefined}
            postsOverride={r.reason}
          />
        </div>
      ))}
    </div>
  )
}
