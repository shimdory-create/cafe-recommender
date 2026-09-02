'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PAGE_SIZE, pageCount, pageFromParam, pageOf } from '@/lib/paging'
import { hiddenByVisit } from '@/lib/site'
import type { VisitRow } from '@/lib/reviews'
import { useWishlist } from '@/lib/use-wishlist'
import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { FeedCards, type FeedRow } from './feed-cards'

export type { FeedRow }

/**
 * 우선순위(기본, 큐레이션 순서) / 가까운순 / 최신순.
 *
 * "전체" 탭의 화제순·가까운순과 이름이 다른 것은 홈의 기본 정렬이 화제량
 * 단일 기준이 아니라 이번 주 큐레이션 순서이기 때문이다 — `hot` 이라 부르면
 * 오해를 부른다.
 */
export type HomeSort = 'default' | 'near' | 'new'

const HOME_SORT_LABEL: [HomeSort, string][] = [
  ['default', '우선순위'], ['near', '가까운순'], ['new', '최신순'],
]

function sortFeed(rows: FeedRow[], sort: HomeSort): FeedRow[] {
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

/**
 * 홈 피드. 10곳씩 보여주고 다음 10곳으로 넘어간다.
 *
 * 무한 스크롤을 쓰지 않는다 — 어디까지 봤는지 알 수 없고, 되돌아오면
 * 맨 위로 튄다. 페이지 번호가 있으면 "지난주에 3페이지까지 봤다" 가
 * 성립한다. 가족이 대화하면서 보는 목록이므로 위치를 말할 수 있어야 한다.
 *
 * **페이지 번호는 URL(`?p=`)에 둔다.** useState 로만 들고 있었더니 2페이지에서
 * 카페를 눌러 보고 뒤로 오면 1페이지로 돌아갔다 (사용자 보고) — 화면 상태가
 * 히스토리에 남지 않기 때문이다. URL 에 있으면 뒤로가기가 그 페이지를 복원한다.
 */
export function HomeFeed({ rows }: { rows: FeedRow[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [visited, setVisited] = useState<Set<string> | null>(null)
  const { wished, toggle: toggleWish } = useWishlist()
  const { blacklisted, toggle: toggleBlacklist } = useBlacklist()
  const { dismissed, dismiss } = useDismissed()
  const sortParam = params.get('s')
  const sort: HomeSort = sortParam === 'near' || sortParam === 'new' ? sortParam : 'default'

  useEffect(() => {
    // 방금 체크한 카페는 즉시 빠져야 한다. 페이로드의 방문 기록은 빌드
    // 시점이라, 체크하고 홈에 돌아오면 그 카페가 그대로 1위에 남는다.
    fetch('/api/visited')
      .then((r) => r.json())
      .then((body: { visits?: VisitRow[]; ok?: boolean }) => {
        // 읽기 실패의 빈 배열과 진짜 빈 기록을 구분한다 (`ok`).
        if (body.ok !== true) return
        /*
         * **방문 날짜를 봐야 한다.** 있으면 무조건 빼면 재방문 기간이 지난
         * 곳도 영영 안 올라온다 — 페이로드는 `recentlyVisited` 로 거르는데
         * 여기만 무조건 걸러서 두 기준이 갈렸다. 지금은 기록이 전부 이번 달
         * 이라 증상이 없지만, 반년 뒤에 조용히 나타난다.
         */
        setVisited(hiddenByVisit(body.visits ?? []))
      })
      .catch(() => {
        // 오프라인이면 빌드 타임 목록을 그대로 쓴다
      })
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

  // 1페이지 + 기본 정렬은 파라미터를 붙이지 않는다 — 카톡 링크와 같은 주소를 유지한다
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

      <FeedCards
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
