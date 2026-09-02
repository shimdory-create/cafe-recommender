'use client'

import { useEffect, useState } from 'react'
import { MAX_COMMENT, MAX_NICKNAME, type RatingSummary, type Review } from '@/lib/reviews'
import type { SiteCafe } from '@/lib/site'
import { VIEW_ONLY, VIEW_ONLY_NOTE } from '@/lib/view-only'

const NICK_KEY = 'cafe-nickname'
/**
 * 이 폰에서 남긴 후기 id.
 *
 * 인증이 없으니 소유권을 서버가 알 수 없다. 대신 **자기 것에만 표시를 달아**
 * 남의 후기를 잘못 건드리는 사고를 줄인다. 막는 것이 아니라 알려주는 장치다 —
 * 4명이 쓰는 화면에서 진짜 권한을 만들려면 로그인을 붙여야 하고, 그러면
 * 아무도 안 쓴다.
 */
const MINE_KEY = 'cafe-my-reviews'

function readMine(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rememberMine(id: string) {
  // 최근 200건만 들고 있는다. 무한히 쌓을 이유가 없다
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([id, ...readMine()].slice(0, 200)))
  } catch {
    // 사파리 프라이빗 모드 등. 표시가 안 붙을 뿐 기능은 돈다
  }
}

/** 별 하나를 반개까지 그린다. 0=빈 별, 0.5=반쪽, 1=꽉 찬 별 */
function Star({ fill, size = 30 }: { fill: number; size?: number }) {
  const id = `half-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={id}>
          <stop offset="50%" stopColor="currentColor" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.4l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z"
        fill={fill >= 1 ? 'currentColor' : fill >= 0.5 ? `url(#${id})` : 'transparent'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 읽기 전용 별점 표시 */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex text-bean" aria-label={`${value}점`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={Math.min(1, Math.max(0, value - i))} size={size} />
      ))}
    </span>
  )
}

/**
 * 반개까지 고르는 별점 입력.
 *
 * 별 하나를 좌·우 두 구역으로 나눈다 — 왼쪽은 반개, 오른쪽은 한 개.
 * 별을 크게(44px) 잡아 각 구역이 22px 이 되게 했다. 모바일에서 반개를
 * 정확히 누르려면 이보다 작아지면 안 된다.
 */
export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="relative inline-flex text-bean">
            <Star fill={Math.min(1, Math.max(0, value - i))} size={44} />
            {[0.5, 1].map((half) => (
              <button
                key={half}
                type="button"
                onClick={() => onChange(i + half)}
                aria-label={`${i + half}점`}
                className="absolute top-0 h-full w-1/2"
                style={{ left: half === 0.5 ? 0 : '50%' }}
              />
            ))}
          </span>
        ))}
      </div>
      <span className="ml-1 w-10 text-[15px] font-bold">{value > 0 ? value.toFixed(1) : '—'}</span>
    </div>
  )
}

interface Loaded {
  reviews: Review[]
  summary: RatingSummary
  enabled: boolean
  /** 읽기가 성공했는가. false 면 빈 목록은 "없음" 이 아니라 "못 읽음" 이다 */
  ok: boolean
  /** 실시간으로 읽어온 것인가. false 면 빌드 시점 사본이다 */
  live?: boolean
  /** 이 주소에서 써도 되는가. 서버가 host 를 보고 답한다 */
  writable?: boolean
}

/**
 * 빌드 시점 후기로 먼저 그린다.
 *
 * 실시간 읽기가 오기 전 한 박자, 그리고 **열람 전용 배포에 토큰이 없을 때**
 * 이 값이 화면에 남는다 (스펙 10.15). 없으면 별점이 통째로 빈 화면이 된다 —
 * 하루 낡은 후기가 아무것도 없는 것보다 낫다.
 */
function fromPayload(rows: SiteCafe['familyReviews']): Loaded {
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

export function ReviewPanel({ cafeId, initialVisited, built }: {
  cafeId: string
  initialVisited: boolean
  built: SiteCafe['familyReviews']
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
  /** 지금 고치고 있는 후기 id */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ rating: 0, nickname: '', comment: '' })

  useEffect(() => {
    // 별명은 각자 폰이 기억한다 — 매번 적게 하면 아무도 안 쓴다
    setNickname(localStorage.getItem(NICK_KEY) ?? '')
    setMine(readMine())

    fetch(`/api/reviews?cafe=${encodeURIComponent(cafeId)}`)
      .then((r) => r.json())
      .then((body: Loaded) => {
        // 읽기가 실패했으면 후기는 빌드 시점 사본을 그대로 둔다 — 빈 목록으로
        // 덮으면 이미 남긴 사람이 저장이 안 된 줄 알고 다시 남겨 중복이 생긴다.
        // 다만 `enabled` 는 서버 말을 따른다 (입력칸을 띄울지의 판단이다)
        if (body.ok === false) {
          setData((prev) => ({ ...prev, enabled: body.enabled, writable: body.writable }))
          return
        }
        setData({ ...body, live: true })
      })
      .catch(() => {
        // 오프라인. 빌드 시점 사본을 그대로 쓴다
      })

    // 방문 여부도 실시간으로 읽는다. 빌드 타임 값만 쓰면 다른 가족이 방금
    // 누른 체크가 보이지 않아 두 번 누르게 된다.
    fetch('/api/visited')
      .then((r) => r.json())
      .then((body: { visits?: { kakaoPlaceId: string }[] }) => {
        if (body.visits?.some((v) => v.kakaoPlaceId === cafeId)) setVisited(true)
      })
      .catch(() => {
        // 오프라인이면 빌드 타임 값을 그대로 쓴다
      })
  }, [cafeId])

  const submit = async () => {
    if (rating === 0) {
      setError('별점을 눌러주세요')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: cafeId, rating, nickname, comment }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '저장에 실패했어요')
      localStorage.setItem(NICK_KEY, nickname)
      rememberMine(body.review.id)
      setMine((prev) => [body.review.id, ...prev])
      // 별점을 남겼으면 다녀온 것이다. 서버가 함께 기록한다
      if (body.visitedOn) setVisited(true)
      // 누른 사람에게는 즉시 보인다. 다른 가족은 새로 열면 바로 보인다.
      setData((prev) => ({
        ...prev,
        enabled: true,
        ok: true,
        summary: body.summary,
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
      const res = await fetch('/api/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '수정에 실패했어요')
      setData((prev) => prev && ({
        ...prev,
        summary: body.summary,
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
      const res = await fetch('/api/reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, kakaoPlaceId: cafeId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '삭제에 실패했어요')
      setData((prev) => prev && ({
        ...prev,
        summary: body.summary,
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
      const res = await fetch('/api/visited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: cafeId, action: visited ? 'remove' : 'add' }),
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
  /**
   * 빌드 시점 값이 먼저고, 서버 답이 오면 그것을 따른다.
   *
   * 열람용 프로젝트 이름을 규칙과 다르게 지으면 `VIEW_ONLY` 가 false 로
   * 남는데, 그때도 서버는 host 를 보고 막는다. 이 한 줄이 화면을 뒤늦게라도
   * 바로잡아 "버튼은 있는데 눌러도 안 되는" 상태를 없앤다.
   */
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
        <p className="mt-2 text-[13px] text-ink-soft">
          아직 별점 저장이 설정되지 않았어요.
        </p>
      ) : (
        <>
          {/*
            별점이 먼저다. 예전에는 '다녀왔어요' 버튼이 맨 위에서 가장 크게
            있었는데, 별점을 남기면서도 체크를 따로 눌러야 했다. 이제 별점을
            남기면 서버가 함께 기록하므로 버튼은 보조로 내렸다.
          */}
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
              <p className="mt-2 text-[13px] text-ink-soft">
                남겼어요. 다른 가족 화면에도 바로 보여요.
              </p>
            )}
          </div>

          {/* 별점 없이 다녀온 경우, 그리고 취소. 그래서 버튼은 남는다 */}
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
