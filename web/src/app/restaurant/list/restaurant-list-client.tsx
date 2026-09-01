'use client'

import { useMemo, useState } from 'react'
import {
  CUISINE_LABEL, restaurantIsStale, restaurantRecentlyVisited, type RestaurantListRow,
} from '@/lib/restaurant-site'
import {
  areaCounts, countMatching, filterAndSort, groupBySigungu, PAGE_CHUNK, SPLIT_AREAS, type Sort,
} from '@/lib/filter'
import { listParamsToQuery, type ListParams } from '@/lib/url-state'
import { useUrlSync } from '@/lib/use-url-sync'
import { useRestaurantWishlist } from '@/lib/use-restaurant-wishlist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { AreaChips, Chip, SearchBox } from '../../filters'
import { RestaurantCard } from '../../restaurant-card'

/** 식당은 카페의 ALL_TAGS(성격 태그) 대신 음식종류를 칩으로 쓴다 */
const CUISINE_CHIPS = Object.keys(CUISINE_LABEL)

/**
 * 칩 필터 + 검색 + 정렬. 카페 `list-client.tsx` 와 대응 — 상태를 주소창에
 * 싣는 것(`lib/url-state.ts`), 지역 묶음, 페이지네이션 전부 그대로 재사용한다.
 * 다른 것은 태그 칩 하나뿐이다: 카페의 성격 태그(대형베이커리 등) 대신
 * 음식종류(`CUISINE_LABEL`)를 쓴다.
 */
export function RestaurantListClient(
  { restaurants, initial }: { restaurants: RestaurantListRow[]; initial: ListParams },
) {
  const [q, setQ] = useState(initial.q)
  const [area, setArea] = useState<string | null>(initial.area)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [sort, setSort] = useState<Sort>(initial.sort)
  const [city, setCity] = useState(initial.city)
  const [newOnly, setNewOnly] = useState(initial.newOnly)
  const [wishOnly, setWishOnly] = useState(initial.wishOnly)
  const [shownCount, setShownCount] = useState(initial.shown)
  // 고른 지역이 접힌 구간에 있으면 처음부터 펴 둔다
  const [expanded, setExpanded] = useState(false)
  const { wished, toggle: toggleWish } = useRestaurantWishlist()
  const { dismissed, dismiss } = useRestaurantDismissed()

  useUrlSync(listParamsToQuery({
    ...initial, q, area, tags, sort, city, newOnly, wishOnly, shown: shownCount,
  }))

  // 폐업 의심으로 숨긴 곳은 다른 모든 필터보다 먼저 뺀다 — 지역·태그 숫자에도
  // 안 잡혀야 "숨겼는데 칩 숫자에는 남아 있다" 가 안 생긴다
  const visible = useMemo(
    () => restaurants.filter((r) => !dismissed.has(r.id)),
    [restaurants, dismissed],
  )
  // 위시리스트도 마찬가지로 먼저 뺀다 — areas·newCount 가 matched 와 다른
  // 기준으로 세면 "위시리스트만 보기" 를 켰을 때 배지 숫자가 또 어긋난다
  const wishFiltered = useMemo(
    () => (wishOnly ? visible.filter((r) => wished.has(r.id)) : visible),
    [visible, wishOnly, wished],
  )

  const matched = useMemo(
    () => filterAndSort(wishFiltered, { tags, sort, city, area, query: q, newOnly }),
    [wishFiltered, tags, sort, city, area, q, newOnly],
  )
  const shown = useMemo(() => matched.slice(0, shownCount), [matched, shownCount])
  const rest = matched.length - shown.length
  const areas = useMemo(
    () => areaCounts(wishFiltered, { city, tags, query: q }),
    [wishFiltered, city, tags, q],
  )
  // matched 와 같은 필터를 쓰고 newOnly 만 강제한다 — 배지 숫자가
  // "지금 NEW 를 누르면 나올 개수" 와 구조적으로 어긋날 수 없게 한다.
  const newCount = useMemo(
    () => countMatching(wishFiltered, { tags, sort, city, area, query: q, newOnly: true }),
    [wishFiltered, tags, sort, city, area, q],
  )
  // 서울·인천만 안에서 구별로 다시 묶는다. 나머지는 칩 하나가 곧 한 지역이다
  const groups = useMemo(
    () => (area && SPLIT_AREAS.has(area) ? groupBySigungu(shown) : null),
    [area, shown],
  )

  /**
   * 조건이 바뀌면 처음부터 다시 센다.
   */
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setShownCount(PAGE_CHUNK)
  }
  const toggle = reset<string>((t) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])))
  const dirty = tags.length > 0 || area !== null || q !== '' || newOnly || wishOnly

  return (
    <div className="py-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">식당 전체 리스트</h1>
        <span className="text-[13px] text-ink-soft">{matched.length}곳</span>
      </div>

      <div className="mt-3">
        <SearchBox value={q} onChange={reset(setQ)} placeholder="식당명 검색" />
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
        <Chip
          on={wishOnly}
          onClick={() => { setWishOnly((v) => !v); setShownCount(PAGE_CHUNK) }}
        >
          ♥ 위시리스트
        </Chip>
        {CUISINE_CHIPS.map((t) => (
          <Chip key={t} on={tags.includes(t)} onClick={() => toggle(t)}>{CUISINE_LABEL[t]}</Chip>
        ))}
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setTags([]); setArea(null); setQ(''); setNewOnly(false); setWishOnly(false)
              setShownCount(PAGE_CHUNK)
            }}
            className="min-h-[40px] rounded-full px-3 text-[13px] text-ink-soft underline"
          >
            초기화
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-line">
          {([['hot', '화제순'], ['near', '가까운순'], ['new', '최신순']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => { setSort(k); setShownCount(PAGE_CHUNK) }}
              className={`min-h-[40px] px-3.5 text-[13px] ${
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
          className={`min-h-[40px] rounded-full border px-3.5 text-[13px] ${
            city ? 'border-bean bg-bean text-white font-semibold' : 'border-line bg-card text-ink-soft'
          }`}
        >
          도심 포함
        </button>
      </div>

      {city && (
        <p className="mt-2 text-[12px] text-ink-soft">
          주차가 어려운 도심 식당도 함께 보여줍니다.
        </p>
      )}

      {groups ? (
        <div className="mt-4 flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.sigungu}>
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
                {g.rows.map((r) => (
                  <RestaurantCard
                    key={r.id}
                    restaurant={r}
                    wished={wished.has(r.id)}
                    onToggleWish={() => toggleWish(r.id)}
                    stale={!restaurantRecentlyVisited(r.visitedOn) && restaurantIsStale(r.lastSeenAt)}
                    onDismiss={() => dismiss(r.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {shown.map((r) => (
            <RestaurantCard
              key={r.id}
              restaurant={r}
              wished={wished.has(r.id)}
              onToggleWish={() => toggleWish(r.id)}
              stale={!restaurantRecentlyVisited(r.visitedOn) && restaurantIsStale(r.lastSeenAt)}
              onDismiss={() => dismiss(r.id)}
            />
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
          {wishOnly
            ? <>아직 담은 곳이 없어요.<br />카드의 하트를 눌러 담아보세요.</>
            : q
              ? <>“{q}” 로 찾은 식당이 없어요.<br />이름 일부만 넣어보세요.</>
              : '조건에 맞는 식당이 없어요. 칩을 줄여보세요.'}
        </p>
      )}
    </div>
  )
}
