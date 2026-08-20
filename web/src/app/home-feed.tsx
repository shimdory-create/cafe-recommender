'use client'

import { useState } from 'react'
import { type ListRow } from '@/lib/site'
import { CafeCard } from './cafe-card'

export const PAGE_SIZE = 10

/** 페이지 번호로 잘라낸다. 순수 함수라 테스트가 된다 */
export function pageOf<T>(rows: T[], page: number, size = PAGE_SIZE): T[] {
  const start = Math.max(0, page - 1) * size
  return rows.slice(start, start + size)
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}

export interface FeedRow extends ListRow {
  reason: string
}

/**
 * 홈 피드. 10곳씩 보여주고 다음 10곳으로 넘어간다.
 *
 * 무한 스크롤을 쓰지 않는다 — 어디까지 봤는지 알 수 없고, 되돌아오면
 * 맨 위로 튄다. 페이지 번호가 있으면 "지난주에 3페이지까지 봤다" 가
 * 성립한다. 가족이 대화하면서 보는 목록이므로 위치를 말할 수 있어야 한다.
 */
export function HomeFeed({ rows }: { rows: FeedRow[] }) {
  const [page, setPage] = useState(1)
  const total = pageCount(rows.length)
  const shown = pageOf(rows, page)
  const offset = (page - 1) * PAGE_SIZE

  const go = (next: number) => {
    setPage(next)
    // 페이지를 넘기면 맨 위부터 보게 한다
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {shown.map((c, i) => (
          <div key={c.id}>
            <CafeCard cafe={c} rank={offset + i + 1} />
            <p className="mt-1.5 px-1 text-[12px] text-ink-soft">{c.reason}</p>
          </div>
        ))}
      </div>

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
            다음 10곳 →
          </button>
        </nav>
      )}
    </>
  )
}
