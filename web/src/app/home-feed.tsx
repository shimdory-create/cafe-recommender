'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PAGE_SIZE, pageCount, pageFromParam, pageOf } from '@/lib/paging'
import { FeedCards, type FeedRow } from './feed-cards'

export type { FeedRow }

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

  useEffect(() => {
    // 방금 체크한 카페는 즉시 빠져야 한다. 페이로드의 방문 기록은 빌드
    // 시점이라, 체크하고 홈에 돌아오면 그 카페가 그대로 1위에 남는다.
    fetch('/api/visited')
      .then((r) => r.json())
      .then((body: { visits?: { kakaoPlaceId: string }[]; ok?: boolean }) => {
        // 읽기 실패의 빈 배열과 진짜 빈 기록을 구분한다 (`ok`).
        if (body.ok !== true) return
        setVisited(new Set((body.visits ?? []).map((v) => v.kakaoPlaceId)))
      })
      .catch(() => {
        // 오프라인이면 빌드 타임 목록을 그대로 쓴다
      })
  }, [])

  const feed = useMemo(
    () => (visited ? rows.filter((r) => !visited.has(r.id)) : rows),
    [rows, visited],
  )

  const total = pageCount(feed.length)
  const page = pageFromParam(params.get('p'), total)
  const shown = pageOf(feed, page)
  const offset = (page - 1) * PAGE_SIZE

  const go = useCallback((next: number) => {
    // 1페이지는 파라미터를 붙이지 않는다 — 카톡 링크와 같은 주소를 유지한다
    router.push(next <= 1 ? pathname : `${pathname}?p=${next}`, { scroll: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pathname, router])

  return (
    <>
      <FeedCards rows={shown} offset={offset} />

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
