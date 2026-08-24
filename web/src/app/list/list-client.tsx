'use client'

import { useMemo, useState } from 'react'
import { ALL_TAGS, type ListRow } from '@/lib/site'
import {
  areaCounts, filterAndSort, groupBySigungu, PAGE_CHUNK, SPLIT_AREAS, type Sort,
} from '@/lib/filter'
import { listParamsToQuery, type ListParams } from '@/lib/url-state'
import { useUrlSync } from '@/lib/use-url-sync'
import { AreaChips, Chip, SearchBox } from '../filters'
import { CafeCard } from '../cafe-card'

/**
 * 칩 필터 + 검색 + 정렬. 상태는 **주소창에 싣는다** (`lib/url-state.ts`).
 *
 * 지역은 방향 6개에서 **시 단위 32개**로 바꿨다. 처음에 방향으로 묶은 것은
 * 시군구 칩이 43개나 되어서였는데, 서울과 인천을 각각 하나로 묶으니 32개가
 * 되어 접이식 칩으로 감당된다. 가족이 실제로 쓰는 말도 "북쪽" 보다 "김포"다.
 */
export function ListClient({ cafes, initial }: { cafes: ListRow[]; initial: ListParams }) {
  const [q, setQ] = useState(initial.q)
  const [area, setArea] = useState<string | null>(initial.area)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [sort, setSort] = useState<Sort>(initial.sort)
  const [city, setCity] = useState(initial.city)
  const [newOnly, setNewOnly] = useState(initial.newOnly)
  const [shownCount, setShownCount] = useState(initial.shown)
  // 고른 지역이 접힌 구간에 있으면 처음부터 펴 둔다
  const [expanded, setExpanded] = useState(false)

  useUrlSync(listParamsToQuery({
    ...initial, q, area, tags, sort, city, newOnly, shown: shownCount,
  }))

  const matched = useMemo(
    () => filterAndSort(cafes, { tags, sort, city, area, query: q, newOnly }),
    [cafes, tags, sort, city, area, q, newOnly],
  )
  // 한 번에 다 그리면 카드 664개에 DOM 노드 15,000개가 된다 (실측). 검색·칩으로
  // 좁히면 대개 한 묶음 안에 들어와서 버튼은 잘 보이지 않는다
  const shown = useMemo(() => matched.slice(0, shownCount), [matched, shownCount])
  const rest = matched.length - shown.length
  const areas = useMemo(() => areaCounts(cafes, { city }), [cafes, city])
  const newCount = useMemo(
    () => cafes.filter((c) => c.isNew && (city || !c.cityOnly)).length,
    [cafes, city],
  )
  // 서울·인천만 안에서 구별로 다시 묶는다. 나머지는 칩 하나가 곧 한 지역이다
  const groups = useMemo(
    () => (area && SPLIT_AREAS.has(area) ? groupBySigungu(shown) : null),
    [area, shown],
  )

  /**
   * 조건이 바뀌면 처음부터 다시 센다.
   *
   * 300곳까지 펼쳐 둔 채로 지역을 바꾸면 그 지역 300곳이 한꺼번에 그려진다 —
   * 방금 줄이려던 것이 그대로 돌아온다.
   */
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setShownCount(PAGE_CHUNK)
  }
  const toggle = reset<string>((t) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])))
  const dirty = tags.length > 0 || area !== null || q !== '' || newOnly

  return (
    <div className="py-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">전체 리스트</h1>
        <span className="text-[13px] text-ink-soft">
          {matched.length}곳
        </span>
      </div>

      <div className="mt-3">
        <SearchBox value={q} onChange={reset(setQ)} />
      </div>

      <div className="mt-3">
        <AreaChips
          counts={areas}
          value={area}
          onChange={reset(setArea)}
          expanded={expanded}
          onExpand={setExpanded}
          leading={newCount > 0 ? (
            <Chip
              on={newOnly}
              count={newCount}
              tone="new"
              onClick={() => { setNewOnly((v) => !v); setShownCount(PAGE_CHUNK) }}
            >
              NEW
            </Chip>
          ) : null}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ALL_TAGS.map((t) => (
          <Chip key={t} on={tags.includes(t)} onClick={() => toggle(t)}>{t}</Chip>
        ))}
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setTags([]); setArea(null); setQ(''); setNewOnly(false)
              setShownCount(PAGE_CHUNK)
            }}
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
              type="button"
              onClick={() => { setSort(k); setShownCount(PAGE_CHUNK) }}
              className={`min-h-[36px] px-3.5 text-[13px] ${
                sort === k ? 'bg-bean text-white font-semibold' : 'bg-card text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setCity((v) => !v); setShownCount(PAGE_CHUNK) }}
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

      {rest > 0 && (
        <button
          type="button"
          onClick={() => setShownCount((n) => n + PAGE_CHUNK)}
          className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-line bg-card text-[15px] font-semibold text-bean active:bg-bean-soft"
        >
          {Math.min(PAGE_CHUNK, rest)}곳 더 보기
          <span className="ml-1.5 font-normal text-ink-soft">남은 {rest}곳</span>
        </button>
      )}

      {shown.length === 0 && (
        <p className="mt-8 text-center text-[14px] leading-relaxed text-ink-soft">
          {q
            ? <>“{q}” 로 찾은 카페가 없어요.<br />이름 일부만 넣어보세요.</>
            : '조건에 맞는 카페가 없어요. 칩을 줄여보세요.'}
        </p>
      )}
    </div>
  )
}
