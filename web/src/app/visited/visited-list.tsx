'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SiteVisited } from '@/lib/site'

function dateLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function monthLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

export interface KnownCafe {
  id: string
  name: string
  sigungu: string
  scale: string | null
  tags: string[]
  naverMapUrl: string
}

/**
 * 빌드 타임 기록과 방금 누른 기록을 합친다.
 *
 * `built` 는 배치가 만든 목록이라 게이트에서 빠진 카페까지 들어 있다.
 * `live` 는 방금 API 에서 읽은 것이며, 오늘 누른 체크가 여기 있다 —
 * 이것을 합치지 않으면 **다녀왔어요를 눌러도 이 탭은 내일까지 비어 있다.**
 */
export function mergeVisits(
  built: SiteVisited[],
  live: { kakaoPlaceId: string; visitedOn: string; note?: string }[],
  known: Map<string, KnownCafe>,
): SiteVisited[] {
  const out = new Map<string, SiteVisited>()
  for (const v of built) out.set(v.id, v)

  for (const v of live) {
    const prev = out.get(v.kakaoPlaceId)
    // 같은 카페면 더 최근 방문만 남긴다
    if (prev && prev.visitedOn >= v.visitedOn) continue
    const c = known.get(v.kakaoPlaceId) ?? prev
    if (!c) continue // 이름을 모르는 카페는 띄울 수 없다
    out.set(v.kakaoPlaceId, {
      id: v.kakaoPlaceId,
      name: c.name,
      sigungu: c.sigungu,
      visitedOn: v.visitedOn,
      note: v.note ?? '',
      tags: c.tags,
      scale: (c.scale as SiteVisited['scale']) ?? null,
      naverMapUrl: c.naverMapUrl,
    })
  }

  return [...out.values()].sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))
}

export function VisitedList({
  built, known,
}: { built: SiteVisited[]; known: KnownCafe[] }) {
  const [rows, setRows] = useState<SiteVisited[]>(built)

  useEffect(() => {
    const map = new Map(known.map((c) => [c.id, c]))
    fetch('/api/visited')
      .then((r) => r.json())
      .then((body) => setRows(mergeVisits(built, body.visits ?? [], map)))
      .catch(() => {
        // 오프라인이면 빌드 타임 기록만 보여준다 (스펙 6.6 우아한 저하)
      })
  }, [built, known])

  let lastMonth = ''

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-card p-5">
        <p className="text-[14px] leading-relaxed text-ink-soft">
          아직 기록이 없어요. 다녀온 카페를 열어 <b className="text-ink">다녀왔어요</b> 를
          누르면 여기 모입니다.
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
          가족 누구나 누를 수 있어요. 별점과 한 줄 후기도 같은 화면에서 남깁니다.
        </p>
      </div>
    )
  }

  return (
    <>
      <p className="mt-1 text-[13px] text-ink-soft">{rows.length}곳</p>
      <div className="mt-3 flex flex-col gap-4">
        {rows.map((v) => {
          const month = monthLabel(v.visitedOn)
          const showMonth = month !== lastMonth
          lastMonth = month
          return (
            <div key={v.id}>
              {showMonth && (
                <p className="mb-2 mt-2 text-[13px] font-semibold text-ink-soft">{month}</p>
              )}
              <article className="overflow-hidden rounded-2xl border border-line bg-card">
                <Link
                  href={`/cafe/${v.id}`}
                  aria-label={`${v.name} 자세히 보기`}
                  className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[17px] font-bold leading-snug">{v.name}</h2>
                    <span className="mt-0.5 shrink-0 text-[12px] text-ink-soft">
                      {dateLabel(v.visitedOn)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-soft">
                    {v.sigungu}
                    {v.scale ? ` · ${v.scale}` : ''}
                  </p>
                  {v.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {v.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-bean-soft px-2.5 py-1 text-[12px] font-medium text-bean"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {v.note && (
                    <p className="mt-3 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed">
                      {v.note}
                    </p>
                  )}
                </Link>
                <a
                  href={v.naverMapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[44px] items-center justify-center border-t border-line text-[13px] font-semibold text-bean active:bg-bean-soft"
                >
                  네이버지도로 다시 보기 ↗
                </a>
              </article>
            </div>
          )
        })}
      </div>
    </>
  )
}
