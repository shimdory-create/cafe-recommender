'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { SiteSpotVisited } from '@/lib/spot-site'
import { postsLabel } from '@/lib/labels'
import type { Review } from '@/lib/reviews'
import { areaLabel, matchesQuery, type AreaCount } from '@/lib/filter'
import { listParamsToQuery, type ListParams } from '@/lib/url-state'
import { useUrlSync } from '@/lib/use-url-sync'
import { nextSort, SORT_LABEL, sortVisited, type VisitedSort } from '@/lib/visited-sort'
import { VIEW_ONLY } from '@/lib/view-only'
import { AreaChips, Chip, SearchBox } from '../../filters'
import { Thumb } from '../../thumb'
import { NaverMapLink } from '../../naver-map-link'
import { Stars } from '../../cafe/[id]/review-panel'

function dateLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function monthLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

export interface KnownSpot {
  id: string
  name: string
  sigungu: string
  area: string
  tags: string[]
  naverMapUrl: string
  imageUrl: string | null
  posts30: number
  posts90: number
}

export interface VisitLite {
  kakaoPlaceId: string
  visitedOn: string
  note?: string
}

/** SiteSpotVisited(빌드 타임 생성 타입)엔 없는 posts30·posts90 을 known(현재
 * 활성 가볼 곳)에서 보강한다 — visited-list.tsx 의 VisitedRow 와 같은 이유. */
export interface VisitedRow extends SiteSpotVisited {
  posts30: number
  posts90: number
}

export function mergeSpotVisits(
  built: SiteSpotVisited[],
  live: VisitLite[],
  known: Map<string, KnownSpot>,
  hasLive = true,
): VisitedRow[] {
  const byId = new Map(built.map((v) => [v.id, v]))
  if (!hasLive) {
    return [...built]
      .map((v) => ({ ...v, posts30: 0, posts90: 0 }))
      .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))
  }

  const out = new Map<string, VisitedRow>()
  for (const v of live) {
    const prev = out.get(v.kakaoPlaceId)
    if (prev && prev.visitedOn >= v.visitedOn) continue
    const s = known.get(v.kakaoPlaceId) ?? byId.get(v.kakaoPlaceId)
    if (!s) continue
    const b = byId.get(v.kakaoPlaceId)
    out.set(v.kakaoPlaceId, {
      id: v.kakaoPlaceId, name: s.name, sigungu: s.sigungu, area: s.area,
      visitedOn: v.visitedOn, note: v.note ?? '', tags: s.tags,
      naverMapUrl: s.naverMapUrl, imageUrl: s.imageUrl ?? null,
      ratingAvg: b?.ratingAvg ?? 0, ratingCount: b?.ratingCount ?? 0,
      posts30: 'posts30' in s ? s.posts30 : 0,
      posts90: 'posts90' in s ? s.posts90 : 0,
    })
  }

  return [...out.values()].sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))
}

export const MIN_ROWS_FOR_FILTERS = 6

export interface VisitedFilter {
  q: string
  /** 고른 지역 목록. 비어 있으면 전체 — OR 로 걸린다 */
  area: string[]
  tags: string[]
}

export function filterSpotVisited<T extends SiteSpotVisited>(
  rows: T[], f: VisitedFilter,
): T[] {
  return rows.filter((v) => {
    if (f.area.length > 0 && !f.area.includes(v.area)) return false
    if (f.q && !matchesQuery(v.name, f.q)) return false
    return f.tags.every((t) => v.tags.includes(t))
  })
}

export function spotVisitedAreas(rows: SiteSpotVisited[]): AreaCount[] {
  const map = new Map<string, number>()
  for (const v of rows) map.set(v.area, (map.get(v.area) ?? 0) + 1)
  return [...map.entries()]
    .map(([area, count]) => ({ area, label: areaLabel(area), count, nearest: 0 }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
}

export function spotVisitedTags(rows: SiteSpotVisited[]): { tag: string; count: number }[] {
  const map = new Map<string, number>()
  for (const v of rows) for (const t of v.tags) map.set(t, (map.get(t) ?? 0) + 1)
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function SpotVisitedList({
  built, known, initial,
}: { built: SiteSpotVisited[]; known: KnownSpot[]; initial: ListParams }) {
  const [rows, setRows] = useState<VisitedRow[]>(
    [...built]
      .map((v) => ({ ...v, posts30: 0, posts90: 0 }))
      .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn)),
  )
  const [reviews, setReviews] = useState<Map<string, Review[]>>(new Map())
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [q, setQ] = useState(initial.q)
  const [area, setArea] = useState<string[]>(initial.area)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [order, setOrder] = useState<VisitedSort>(initial.visitedSort)
  const [viewOnly, setViewOnly] = useState(VIEW_ONLY)
  const [expanded, setExpanded] = useState(false)

  useUrlSync(listParamsToQuery({ ...initial, q, area, tags, visitedSort: order }))

  const load = useCallback(() => {
    const map = new Map(known.map((s) => [s.id, s]))
    fetch('/api/spot/visited')
      .then((r) => r.json())
      .then((body: { visits?: VisitLite[]; ok?: boolean; writable?: boolean }) => {
        if (body.writable === false) setViewOnly(true)
        setRows(mergeSpotVisits(built, body.visits ?? [], map, body.ok === true))
      })
      .catch(() => {})

    fetch('/api/spot/reviews')
      .then((r) => r.json())
      .then((body: { reviews?: Review[]; ok?: boolean }) => {
        if (body.ok === false) return
        const m = new Map<string, Review[]>()
        for (const r of body.reviews ?? []) {
          m.set(r.kakaoPlaceId, [...(m.get(r.kakaoPlaceId) ?? []), r])
        }
        setReviews(m)
      })
      .catch(() => {})
  }, [built, known])

  useEffect(load, [load])

  const cancel = async (id: string, name: string) => {
    if (!window.confirm(`${name} 을(를) 다녀온 곳에서 뺄까요?\n이번 주 추천에 다시 올라옵니다.`)) {
      return
    }
    setBusy(id)
    setError('')
    try {
      const res = await fetch('/api/spot/visited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: id, action: 'remove' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '취소에 실패했어요')
      setRows((prev) => prev.filter((v) => v.id !== id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const areas = useMemo(() => spotVisitedAreas(rows), [rows])
  const tagList = useMemo(() => spotVisitedTags(rows), [rows])
  const shown = useMemo(
    () => sortVisited(filterSpotVisited(rows, { q, area, tags }), order),
    [rows, q, area, tags, order],
  )
  const toggle = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  const toggleArea = (a: string) =>
    setArea((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  const dirty = q !== '' || area.length > 0 || tags.length > 0

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-card p-5">
        <p className="text-[14px] leading-relaxed text-ink-soft">
          아직 기록이 없어요. 다녀온 곳을 열어 <b className="text-ink">다녀왔어요</b> 를
          누르면 여기 모입니다.
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
          {viewOnly
            ? '열람 전용 페이지라 여기서는 기록을 남길 수 없어요.'
            : '가족 누구나 누를 수 있어요. 별점을 남기면 자동으로 여기 들어옵니다.'}
        </p>
      </div>
    )
  }

  let lastMonth = ''

  return (
    <>
      <p className="mt-1 text-[13px] text-ink-soft">
        {shown.length}곳{shown.length !== rows.length && ` / ${rows.length}곳`}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-soft">
        기록은 계속 남아요. &ldquo;빼기&rdquo; 를 눌러도 가장 최근 방문 한 건만 지워집니다.
      </p>
      {error && <p className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>}

      {rows.length >= MIN_ROWS_FOR_FILTERS && (
        <>
          <div className="mt-3">
            <SearchBox value={q} onChange={setQ} placeholder="장소명 검색" />
          </div>

          {areas.length > 1 && (
            <div className="mt-3">
              <AreaChips
                counts={areas} value={area} onToggle={toggleArea} onClear={() => setArea([])}
                expanded={expanded} onExpand={setExpanded}
              />
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-line">
              {(['date', 'rating'] as const).map((by) => {
                const on = order.by === by
                return (
                  <button
                    key={by}
                    type="button"
                    onClick={() => setOrder((cur) => nextSort(cur, by))}
                    aria-label={`${SORT_LABEL[by]}순 정렬${
                      on ? (order.desc ? ' (내림차순)' : ' (오름차순)') : ''
                    }`}
                    className={`min-h-[40px] px-3.5 text-[13px] ${
                      on ? 'bg-bean text-white font-semibold' : 'bg-card text-ink-soft'
                    }`}
                  >
                    {SORT_LABEL[by]}순
                    {on && <span aria-hidden="true" className="ml-1">{order.desc ? '↓' : '↑'}</span>}
                  </button>
                )
              })}
            </div>
            <span className="text-[12px] text-ink-soft">
              {order.by === 'rating'
                ? (order.desc ? '높은 별점부터' : '낮은 별점부터')
                : (order.desc ? '최근에 간 곳부터' : '오래전에 간 곳부터')}
            </span>
          </div>

          {tagList.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tagList.map((t) => (
                <Chip key={t.tag} on={tags.includes(t.tag)} count={t.count} onClick={() => toggle(t.tag)}>
                  {t.tag}
                </Chip>
              ))}
              {dirty && (
                <button
                  type="button"
                  onClick={() => { setQ(''); setArea([]); setTags([]) }}
                  className="min-h-[40px] rounded-full px-3 text-[13px] text-ink-soft underline"
                >
                  초기화
                </button>
              )}
            </div>
          )}
        </>
      )}

      {shown.length === 0 && (
        <p className="mt-8 text-center text-[14px] leading-relaxed text-ink-soft">
          {q ? <>“{q}” 로 찾은 기록이 없어요.</> : '조건에 맞는 기록이 없어요.'}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-4">
        {shown.map((v) => {
          const month = monthLabel(v.visitedOn)
          const showMonth = order.by === 'date' && month !== lastMonth
          lastMonth = month
          const mine = reviews.get(v.id) ?? []
          const count = mine.length || v.ratingCount
          const avg = mine.length
            ? mine.reduce((s, r) => s + r.rating, 0) / mine.length
            : v.ratingAvg

          return (
            <div key={v.id}>
              {showMonth && (
                <p className="mb-2 mt-2 text-[13px] font-semibold text-ink-soft">{month}</p>
              )}
              <article className="overflow-hidden rounded-2xl border border-line bg-card">
                <Link
                  href={`/spot/${v.id}`}
                  aria-label={`${v.name} 자세히 보기`}
                  className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
                >
                  <div className="flex gap-3">
                    <Thumb src={v.imageUrl} alt={v.name} size={60} icon="🏞️" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-[17px] font-bold leading-snug">{v.name}</h2>
                        <span className="mt-0.5 shrink-0 text-[12px] font-medium text-ink-soft">
                          {dateLabel(v.visitedOn)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-ink-soft">
                        {v.sigungu} · {postsLabel(v.posts30, v.posts90)}
                      </p>
                      {count > 0 ? (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Stars value={avg} />
                          <span className="text-[13px] font-bold text-bean">{avg.toFixed(1)}</span>
                          <span className="text-[12px] text-ink-soft">· {count}명</span>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-[12px] text-ink-soft">아직 별점이 없어요</p>
                      )}
                    </div>
                  </div>

                  {mine.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {mine.slice(0, 3).filter((r) => r.comment).map((r) => (
                        <li key={r.id} className="border-l-2 border-line pl-2.5 text-[13px] leading-relaxed">
                          {r.comment}
                          <span className="ml-1.5 text-[12px] text-ink-soft">— {r.nickname || '가족'}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {v.note && (
                    <p className="mt-2 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed text-ink-soft">
                      {v.note}
                    </p>
                  )}
                </Link>

                <div className="flex border-t border-line">
                  <NaverMapLink
                    href={v.naverMapUrl}
                    className="flex min-h-[44px] flex-1 items-center justify-center text-[13px] font-semibold text-bean active:bg-bean-soft"
                  >
                    지도 ↗
                  </NaverMapLink>
                  {!viewOnly && (
                    <button
                      onClick={() => cancel(v.id, v.name)}
                      disabled={busy === v.id}
                      className="flex min-h-[44px] flex-1 items-center justify-center border-l border-line text-[13px] text-ink-soft active:bg-bean-soft disabled:opacity-50"
                    >
                      {busy === v.id ? '취소 중…' : '다녀온 곳에서 빼기'}
                    </button>
                  )}
                </div>
              </article>
            </div>
          )
        })}
      </div>
    </>
  )
}
