'use client'

import { useEffect, useState } from 'react'
import { MAX_COMMENT, MAX_NICKNAME, type RatingSummary, type Review } from '@/lib/reviews'

const NICK_KEY = 'cafe-nickname'

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
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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
}

export function ReviewPanel({ cafeId, initialVisited }: { cafeId: string; initialVisited: boolean }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [rating, setRating] = useState(0)
  const [nickname, setNickname] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [visited, setVisited] = useState(initialVisited)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // 별명은 각자 폰이 기억한다 — 매번 적게 하면 아무도 안 쓴다
    setNickname(localStorage.getItem(NICK_KEY) ?? '')

    fetch(`/api/reviews?cafe=${encodeURIComponent(cafeId)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ reviews: [], summary: { count: 0, average: 0 }, enabled: false, ok: false }))

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
      // 누른 사람에게는 즉시 보인다. 다른 가족은 새로 열면 바로 보인다.
      setData((prev) => ({
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

  const enabled = data?.enabled ?? true

  return (
    <section className="mt-6">
      {/* 다녀왔어요 — 유일한 조작 버튼이므로 56px 이상 (스펙 10.1) */}
      <button
        onClick={toggleVisited}
        disabled={busy || !enabled}
        aria-pressed={visited}
        className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold disabled:opacity-50 ${
          visited
            ? 'bg-bean-soft text-bean'
            : 'border border-line bg-card text-ink active:bg-bean-soft'
        }`}
      >
        {visited ? '✓ 다녀왔어요 (누르면 취소)' : '다녀왔어요 체크'}
      </button>

      <h2 className="mt-6 text-[15px] font-bold">
        가족 별점
        {data && data.summary.count > 0 && (
          <span className="ml-2 font-normal text-ink-soft">
            {data.summary.average.toFixed(1)} · {data.summary.count}명
          </span>
        )}
      </h2>

      {!enabled ? (
        <p className="mt-2 text-[13px] text-ink-soft">
          아직 별점 저장이 설정되지 않았어요.
        </p>
      ) : (
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
            className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-bean text-[15px] font-bold text-white disabled:opacity-50"
          >
            {busy ? '저장 중…' : '남기기'}
          </button>

          {error && <p className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
          {done && !error && (
            <p className="mt-2 text-[13px] text-ink-soft">
              남겼어요. 다른 가족 화면에도 바로 보여요.
            </p>
          )}
        </div>
      )}

      {data && data.ok === false && enabled && (
        <p className="mt-3 text-[13px] text-ink-soft">
          지금은 남긴 후기를 불러올 수 없어요. 잠시 뒤 새로 고쳐보세요.
        </p>
      )}

      {data && data.reviews.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {data.reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-[13px] font-semibold">{r.nickname || '가족'}</span>
                <span className="ml-auto text-[12px] text-ink-soft">
                  {r.createdAt.slice(5, 10).replace('-', '. ')}
                </span>
              </div>
              {r.comment && <p className="mt-1.5 text-[14px] leading-relaxed">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
