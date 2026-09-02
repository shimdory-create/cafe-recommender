'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PAGE_SIZE, pageCount, pageFromParam, pageOf } from '@/lib/paging'
import { spotHiddenByVisit } from '@/lib/spot-site'
import type { VisitRow } from '@/lib/reviews'
import { useSpotWishlist } from '@/lib/use-spot-wishlist'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { SpotFeedCards, type SpotFeedRow } from './spot-feed-cards'

export type { SpotFeedRow }

export type HomeSort = 'default' | 'near' | 'new'

const HOME_SORT_LABEL: [HomeSort, string][] = [
  ['default', '우선순위'], ['near', '가까운순'], ['new', '최신순'],
]

function sortFeed(rows: SpotFeedRow[], sort: HomeSort): SpotFeedRow[] {
  if (sort === 'default') return rows
  if (sort === 'near') {
    return [...rows].sort((a, b) => {
      const da = a.driveMinutes ?? Number.POSITIVE_INFINITY
      const db = b.driveMinutes ?? Number.POSITIVE_INFINITY
      return da !== db ? da - db : b.hotScore - a.hotScore
    })
  }
  return [...rows].sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt) || a.id.localeCompare(b.id))
}

export function SpotHomeFeed({ rows }: { rows: SpotFeedRow[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [visited, setVisited] = useState<Set<string> | null>(null)
  const { wished, toggle: toggleWish } = useSpotWishlist()
  const { blacklisted, toggle: toggleBlacklist } = useSpotBlacklist()
  const { dismissed, dismiss } = useSpotDismissed()
  const sortParam = params.get('s')
  const sort: HomeSort = sortParam === 'near' || sortParam === 'new' ? sortParam : 'default'

  useEffect(() => {
    fetch('/api/spot/visited')
      .then((r) => r.json())
      .then((body: { visits?: VisitRow[]; ok?: boolean }) => {
        if (body.ok !== true) return
        setVisited(spotHiddenByVisit(body.visits ?? []))
      })
      .catch(() => {})
  }, [])

  const feed = useMemo(() => {
    const live = visited ? rows.filter((r) => !visited.has(r.id)) : rows
    const shown = live.filter((r) => !dismissed.has(r.id) && !blacklisted.has(r.id))
    return sortFeed(shown, sort)
  }, [rows, visited, dismissed, blacklisted, sort])

  const total = pageCount(feed.length)
  const page = pageFromParam(params.get('p'), total)
  const shown = pageOf(feed, page)
  const offset = (page - 1) * PAGE_SIZE

  const buildQuery = (nextPage: number, nextSort: HomeSort) => {
    const sp = new URLSearchParams()
    if (nextPage > 1) sp.set('p', String(nextPage))
    if (nextSort !== 'default') sp.set('s', nextSort)
    const s = sp.toString()
    return s ? `${pathname}?${s}` : pathname
  }

  const go = useCallback((next: number) => {
    router.push(buildQuery(next, sort), { scroll: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router, sort])

  const changeSort = useCallback((next: HomeSort) => {
    router.push(buildQuery(1, next), { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router])

  return (
    <>
      <div className="mb-4 flex overflow-hidden rounded-full border border-line">
        {HOME_SORT_LABEL.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => changeSort(k)}
            className={`min-h-[40px] flex-1 px-3 text-[13px] ${
              sort === k ? 'bg-bean text-white font-semibold' : 'bg-card text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <SpotFeedCards
        rows={shown}
        offset={offset}
        showRank={sort === 'default'}
        wished={wished}
        onToggleWish={toggleWish}
        onToggleBlacklist={toggleBlacklist}
        onDismiss={dismiss}
      />

      {total > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={() => go(page - 1)}
            disabled={page === 1}
            className="min-h-[48px] flex-1 rounded-2xl border border-line bg-card text-[14px] font-semibold disabled:opacity-35"
          >
            ← 이전
          </button>
          <span className="shrink-0 text-[13px] text-ink-soft">
            {page} / {total}
          </span>
          <button
            onClick={() => go(page + 1)}
            disabled={page >= total}
            className="min-h-[48px] flex-1 rounded-2xl bg-bean text-[14px] font-bold text-white disabled:opacity-35"
          >
            다음 {PAGE_SIZE}곳 →
          </button>
        </nav>
      )}
    </>
  )
}
