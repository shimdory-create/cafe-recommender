'use client'

import { useEffect, useState } from 'react'
import { MAX_COMMENT, MAX_NICKNAME, type RatingSummary, type Review } from '@/lib/reviews'
import type { SiteRestaurant } from '@/lib/restaurant-site'
import { VIEW_ONLY, VIEW_ONLY_NOTE } from '@/lib/view-only'
import { Stars, StarPicker } from '../../cafe/[id]/review-panel'

const NICK_KEY = 'cafe-nickname'
/**
 * 이 폰에서 남긴 후기 id.
 *
 * 카페 후기와 키를 분리한다 — 같은 폰에서 카페·식당을 오가며 후기를 남겨도
 * "내가 남김" 표시가 서로 섞이지 않게.
 */
const MINE_KEY = 'restaurant-my-reviews'

function readMine(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rememberMine(id: string) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([id, ...readMine()].slice(0, 200)))
  } catch {
    // 사파리 프라이빗 모드 등
  }
}

interface Loaded {
  reviews: Review[]
  summary: RatingSummary
  enabled: boolean
  ok: boolean
  live?: boolean
  writable?: boolean
}

function fromPayload(rows: SiteRestaurant['familyReviews']): Loaded {
  return {
    reviews: rows.map((r, i) => ({ ...r, id: `built-${i}`, kakaoPlaceId: '' })),
    summary: rows.length === 0
      ? { count: 0, average: 0 }
      : {
        count: rows.length,
        average: Number((rows.reduce((a, r) => a + r.rating, 0) / rows.length).toFixed(1)),
      },
    enabled: true,
    ok: true,
    live: false,
  }
}

export function ReviewPanel({ restaurantId, initialVisited, built }: {
  restaurantId: string
  initialVisited: boolean
  built: SiteRestaurant['familyReviews']
}) {
  const [data, setData] = useState<Loaded>(() => fromPayload(built))
  const [rating, setRating] = useState(0)
  const [nickname, setNickname] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [visited, setVisited] = useState(initialVisited)
  const [done, setDone] = useState(false)
  const [mine, setMine] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ rating: 0, nickname: '', comment: '' })

  useEffect(() => {
    setNickname(localStorage.getItem(NICK_KEY) ?? '')
    setMine(readMine())

    fetch(`/api/restaurant/reviews?restaurant=${encodeURIComponent(restaurantId)}`)
      .then((r) => r.json())
      .then((body: Loaded) => {
        if (body.ok === false) {
          setData((prev) => ({ ...prev, enabled: body.enabled, writable: body.writable }))
          return
        }
        setData({ ...body, live: true })
      })
      .catch(() => {})

    fetch('/api/restaurant/visited')
      .then((r) => r.json())
      .then((body: { visits?: { kakaoPlaceId: string }[] }) => {
        if (body.visits?.some((v) => v.kakaoPlaceId === restaurantId)) setVisited(true)
      })
      .catch(() => {})
  }, [restaurantId])

  const submit = async () => {
    if (rating === 0) {
      setError('별점을 눌러주세요')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/restaurant/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: restaurantId, rating, nickname, comment }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '저장에 실패했어요')
      localStorage.setItem(NICK_KEY, nickname)
      rememberMine(body.review.id)
      setMine((prev) => [body.review.id, ...prev])
      if (body.visitedOn) setVisited(true)
      setData((prev) => ({
        enabled: true, ok: true, summary: body.summary,
        reviews: [body.review, ...(prev?.reviews ?? [])],
      }))
      setRating(0)
      setComment('')
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (r: Review) => {
    setEditing(r.id)
    setDraft({ rating: r.rating, nickname: r.nickname, comment: r.comment })
    setError('')
  }

  const saveEdit = async (id: string) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/restaurant/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '수정에 실패했어요')
      setData((prev) => prev && ({
        ...prev, summary: body.summary,
        reviews: prev.reviews.map((r) => (r.id === id ? body.review : r)),
      }))
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r: Review) => {
    const who = r.nickname || '가족'
    if (!window.confirm(`${who} 님이 남긴 별점 ${r.rating.toFixed(1)}점을 지울까요?`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/restaurant/reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, kakaoPlaceId: restaurantId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '삭제에 실패했어요')
      setData((prev) => prev && ({
        ...prev, summary: body.summary,
        reviews: prev.reviews.filter((x) => x.id !== r.id),
      }))
      if (editing === r.id) setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggleVisited = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/restaurant/visited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: restaurantId, action: visited ? 'remove' : 'add' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '기록에 실패했어요')
      setVisited(body.visited)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const enabled = data.enabled
  const viewOnly = VIEW_ONLY || data.writable === false

  return (
    <section className="mt-6">
      <h2 className="text-[15px] font-bold">
        가족 별점
        {data.summary.count > 0 && (
          <span className="ml-2 font-normal text-ink-soft">
            {data.summary.average.toFixed(1)} · {data.summary.count}명
          </span>
        )}
      </h2>

      {viewOnly ? (
        <p className="mt-2 rounded-2xl border border-line bg-card px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
          {VIEW_ONLY_NOTE}
        </p>
      ) : !enabled ? (
        <p className="mt-2 text-[13px] text-ink-soft">아직 별점 저장이 설정되지 않았어요.</p>
      ) : (
        <>
          <div className="mt-2 rounded-2xl border border-line bg-card p-4">
            <StarPicker value={rating} onChange={setRating} />
            <div className="mt-3 flex gap-2">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, MAX_NICKNAME))}
                placeholder="별명 (선택)"
                aria-label="별명"
                className="min-h-[44px] w-24 shrink-0 rounded-xl border border-line bg-paper px-3 text-[15px] outline-none focus:border-bean"
              />
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
                placeholder="한 줄 (선택)"
                aria-label="한 줄 후기"
                className="min-h-[44px] flex-1 rounded-xl border border-line bg-paper px-3 text-[15px] outline-none focus:border-bean"
              />
            </div>
            <button
              onClick={submit}
              disabled={busy}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-bean text-[16px] font-bold text-white disabled:opacity-50"
            >
              {busy ? '저장 중…' : '남기기'}
            </button>
            {!visited && (
              <p className="mt-2 text-center text-[12px] text-ink-soft">
                별점을 남기면 <b className="text-ink">다녀온 곳</b>에 자동으로 들어가요
              </p>
            )}
            {error && <p className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
            {done && !error && (
              <p className="mt-2 text-[13px] text-ink-soft">남겼어요. 다른 가족 화면에도 바로 보여요.</p>
            )}
          </div>

          <button
            onClick={toggleVisited}
            disabled={busy}
            aria-pressed={visited}
            className={`mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl border text-[14px] disabled:opacity-50 ${
              visited
                ? 'border-line bg-bean-soft font-semibold text-bean'
                : 'border-line bg-card text-ink-soft active:bg-bean-soft'
            }`}
          >
            {visited ? '✓ 다녀왔어요 — 누르면 취소' : '별점 없이 다녀왔어요만 체크'}
          </button>
        </>
      )}

      {data.ok === false && enabled && (
        <p className="mt-3 text-[13px] text-ink-soft">
          지금은 남긴 후기를 불러올 수 없어요. 잠시 뒤 새로 고쳐보세요.
        </p>
      )}

      {data.reviews.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {data.reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-card px-4 py-3">
              {editing === r.id ? (
                <>
                  <StarPicker
                    value={draft.rating}
                    onChange={(v) => setDraft((d) => ({ ...d, rating: v }))}
                  />
                  <div className="mt-3 flex gap-2">
                    <input
                      value={draft.nickname}
                      onChange={(e) => setDraft((d) => ({
                        ...d, nickname: e.target.value.slice(0, MAX_NICKNAME),
                      }))}
                      placeholder="별명 (선택)"
                      aria-label="별명 수정"
                      className="min-h-[44px] w-24 shrink-0 rounded-xl border border-line bg-paper px-3 text-[15px] outline-none focus:border-bean"
                    />
                    <input
                      value={draft.comment}
                      onChange={(e) => setDraft((d) => ({
                        ...d, comment: e.target.value.slice(0, MAX_COMMENT),
                      }))}
                      placeholder="한 줄 (선택)"
                      aria-label="한 줄 후기 수정"
                      className="min-h-[44px] flex-1 rounded-xl border border-line bg-paper px-3 text-[15px] outline-none focus:border-bean"
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => saveEdit(r.id)}
                      disabled={busy}
                      className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-bean text-[15px] font-bold text-white disabled:opacity-50"
                    >
                      {busy ? '저장 중…' : '고치기'}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      disabled={busy}
                      className="flex min-h-[44px] w-20 items-center justify-center rounded-xl border border-line text-[15px] text-ink-soft disabled:opacity-50"
                    >
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="text-[13px] font-semibold">{r.nickname || '가족'}</span>
                    {mine.includes(r.id) && (
                      <span className="rounded-full bg-bean-soft px-1.5 py-0.5 text-[11px] text-bean">
                        내가 남김
                      </span>
                    )}
                    <span className="ml-auto text-[12px] text-ink-soft">
                      {r.createdAt.slice(5, 10).replace('-', '. ')}
                      {r.updatedAt && ' (수정됨)'}
                    </span>
                  </div>
                  {r.comment && <p className="mt-1.5 text-[14px] leading-relaxed">{r.comment}</p>}
                  {!viewOnly && enabled && data.live && (
                    <div className="mt-2 flex gap-1">
                      <button
                        onClick={() => startEdit(r)}
                        disabled={busy}
                        className="min-h-[44px] px-3 text-[13px] text-ink-soft underline disabled:opacity-50"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => remove(r)}
                        disabled={busy}
                        className="min-h-[44px] px-3 text-[13px] text-ink-soft underline disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
