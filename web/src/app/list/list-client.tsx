'use client'

import { useMemo, useState } from 'react'
import { ALL_TAGS, type ListRow } from '@/lib/site'
import { filterAndSort, type Sort } from '@/lib/filter'
import { CafeCard } from '../cafe-card'

/**
 * 칩 필터 + 정렬. 상태는 URL 에 싣지 않는다 — 가족이 링크를 공유하는
 * 대상은 카페 상세이고, 목록 필터는 그 자리에서 쓰고 버리는 조작이다.
 */
export function ListClient({ cafes }: { cafes: ListRow[] }) {
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('hot')
  const [city, setCity] = useState(false)

  const shown = useMemo(() => filterAndSort(cafes, { tags, sort, city }), [cafes, tags, sort, city])

  const toggle = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  return (
    <div className="py-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">전체 리스트</h1>
        <span className="text-[13px] text-ink-soft">{shown.length}곳</span>
      </div>

      {/* 칩은 가로 스크롤 대신 줄바꿈 — body 가 가로로 밀리면 안 된다 (스펙 10.1) */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ALL_TAGS.map((t) => {
          const on = tags.includes(t)
          return (
            <button
              key={t}
              onClick={() => toggle(t)}
              aria-pressed={on}
              className={`min-h-[36px] rounded-full border px-3 text-[13px] ${
                on
                  ? 'border-bean bg-bean text-white font-semibold'
                  : 'border-line bg-card text-ink-soft'
              }`}
            >
              {t}
            </button>
          )
        })}
        {tags.length > 0 && (
          <button
            onClick={() => setTags([])}
            className="min-h-[36px] rounded-full px-3 text-[13px] text-ink-soft underline"
          >
            초기화
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-line">
          {([['hot', '화제순'], ['near', '가까운순']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`min-h-[36px] px-3.5 text-[13px] ${
                sort === k ? 'bg-bean text-white font-semibold' : 'bg-card text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCity((v) => !v)}
          aria-pressed={city}
          className={`min-h-[36px] rounded-full border px-3.5 text-[13px] ${
            city ? 'border-bean bg-bean text-white font-semibold' : 'border-line bg-card text-ink-soft'
          }`}
        >
          도심 포함
        </button>
      </div>

      {city && (
        <p className="mt-2 text-[12px] text-ink-soft">
          주차가 어려운 도심 카페도 함께 보여줍니다.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {shown.map((c) => (
          <CafeCard key={c.id} cafe={c} />
        ))}
      </div>

      {shown.length === 0 && (
        <p className="mt-8 text-center text-[14px] text-ink-soft">
          조건에 맞는 카페가 없어요. 칩을 줄여보세요.
        </p>
      )}
    </div>
  )
}
