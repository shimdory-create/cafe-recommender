import { RestaurantCard } from './restaurant-card'
import { restaurantIsStale, type RestaurantListRow } from '@/lib/restaurant-site'

export interface RestaurantFeedRow extends RestaurantListRow {
  reason: string
}

/**
 * 카드 목록 그 자체. 훅을 쓰지 않으므로 **서버에서도 그릴 수 있다.**
 *
 * 페이지 번호를 URL 에서 읽으려면 클라이언트 훅(`useSearchParams`)이 필요하고,
 * 그러면 Suspense 경계 안쪽이 클라이언트 렌더링으로 밀린다 — 카톡 링크의
 * 도착지인 첫 화면이 빈 상태로 뜬다는 뜻이다 (빌드 산출물에서 확인:
 * `BAILOUT_TO_CLIENT_SIDE_RENDERING`).
 *
 * 그래서 같은 카드 목록을 두 곳에서 쓴다. 서버는 1페이지를 미리 그려 보내고
 * (Suspense fallback), 하이드레이션이 끝나면 클라이언트가 URL 의 페이지를
 * 그린다. 1페이지에서는 두 결과가 같으므로 화면이 튀지 않는다.
 */
export function RestaurantFeedCards({
  rows, offset = 0, showRank = true, wished, onToggleWish, onToggleBlacklist, onDismiss,
  aliveIds, onAlive,
}: {
  rows: RestaurantFeedRow[]
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
          <RestaurantCard
            restaurant={r}
            rank={showRank ? offset + i + 1 : undefined}
            wished={wished?.has(r.id)}
            onToggleWish={onToggleWish ? () => onToggleWish(r.id) : undefined}
            onToggleBlacklist={onToggleBlacklist ? () => onToggleBlacklist(r.id) : undefined}
            stale={!r.visitedOn && restaurantIsStale(r.lastSeenAt) && !aliveIds?.has(r.id)}
            onDismiss={onDismiss ? () => onDismiss(r.id) : undefined}
            onAlive={onAlive ? () => onAlive(r.id) : undefined}
            postsOverride={r.reason}
          />
        </div>
      ))}
    </div>
  )
}
