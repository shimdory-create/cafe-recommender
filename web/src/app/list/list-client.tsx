'use client'

import { useMemo, useState } from 'react'
import { ALL_TAGS, type ListRow } from '@/lib/site'
import {
  filterAndSort, groupBySigungu, zoneCounts, ZONES, type Sort, type ZoneId,
} from '@/lib/filter'
import { CafeCard } from '../cafe-card'

/**
 * 칩 필터 + 정렬. 상태는 URL 에 싣지 않는다 — 가족이 링크를 공유하는
 * 대상은 카페 상세이고, 목록 필터는 그 자리에서 쓰고 버리는 조작이다.
 *
 * 방향(zone)을 고르면 그 안에서 **시군구별로 묶어** 보여준다. 시군구 칩을
 * 43개 만드는 방법도 있었지만 실측 분포가 그것을 막았다 — 17개 시군구가
 * 1~2곳뿐이어서 칩 절반이 카드 한 장을 위한 칩이 된다.
 */
export function ListClient({ cafes }: { cafes: ListRow[] }) {
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('hot')
  const [city, setCity] = useState(false)
  const [zone, setZone] = useState<ZoneId | null>(null)

  const shown = useMemo(
    () => filterAndSort(cafes, { tags, sort, city, zone }),
    [cafes, tags, sort, city, zone],
  )
  const counts = useMemo(() => zoneCounts(cafes, { city }), [cafes, city])
  // 방향을 골랐을 때만 묶는다. 안 골랐으면 43개 그룹이 생긴다
  const groups = useMemo(() => (zone ? groupBySigungu(shown) : null), [zone, shown])
  const picked = ZONES.find((z) => z.id === zone)

  const toggle = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  return (
    <div className="py-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">전체 리스트</h1>
        <span className="text-[13px] text-ink-soft">{shown.length}곳</span>
      </div>

      {/* 방향 — 차로 나가는 가족의 첫 질문은 "어느 쪽" 이다 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ZONES.map((z) => {
          const on = zone === z.id
          const n = counts[z.id]
          return (
            <button
              key={z.id}
              onClick={() => setZone(on ? null : z.id)}
              aria-pressed={on}
              disabled={n === 0}
              className={`min-h-[36px] rounded-full border px-3 text-[13px] disabled:opacity-35 ${
                on
                  ? 'border-bean bg-bean text-white font-semibold'
                  : 'border-line bg-card text-ink-soft'
              }`}
            >
              {z.label}
              <span className={`ml-1 text-[12px] ${on ? 'text-white/80' : 'text-ink-soft/70'}`}>
                {n}
              </span>
            </button>
          )
        })}
      </div>

      {picked && (
        <p className="mt-2 text-[12px] text-ink-soft">
          {picked.label} — {picked.hint} · 지역별로 묶어 가까운 곳부터 보여줍니다
        </p>
      )}

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
        {(tags.length > 0 || zone) && (
          <button
            onClick={() => { setTags([]); setZone(null) }}
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

      {groups ? (
        <div className="mt-4 flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.sigungu}>
              {/* 스크롤 중에도 어느 지역을 보는지 알 수 있게 붙여둔다 */}
              <div className="sticky top-[57px] z-[5] -mx-5 mb-2 border-b border-line bg-paper/95 px-5 py-2 backdrop-blur">
                <h2 className="text-[15px] font-bold">
                  {g.sigungu}
                  <span className="ml-1.5 text-[13px] font-normal text-ink-soft">
                    {g.rows.length}곳
                    {Number.isFinite(g.nearest) && ` · 가장 가까운 곳 ${g.nearest}분`}
                  </span>
                </h2>
              </div>
              <div className="flex flex-col gap-4">
                {g.rows.map((c) => (
                  <CafeCard key={c.id} cafe={c} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {shown.map((c) => (
            <CafeCard key={c.id} cafe={c} />
          ))}
        </div>
      )}

      {shown.length === 0 && (
        <p className="mt-8 text-center text-[14px] text-ink-soft">
          조건에 맞는 카페가 없어요. 칩을 줄여보세요.
        </p>
      )}
    </div>
  )
}
