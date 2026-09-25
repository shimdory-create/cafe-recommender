'use client'

import { useMemo, useState } from 'react'
import {
  SPOT_TAG_LABEL, spotIsStale, spotRecentlyVisited, type SpotListRow,
} from '@/lib/spot-site'
import {
  areaCounts, countMatching, filterAndSort, groupBySigungu, PAGE_CHUNK, sigunguCountsByArea,
  SPLIT_AREAS, type Sort,
} from '@/lib/filter'
import { listParamsToQuery, type ListParams } from '@/lib/url-state'
import { useUrlSync } from '@/lib/use-url-sync'
import { useSpotWishlist } from '@/lib/use-spot-wishlist'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { useAliveConfirmed } from '@/lib/use-alive'
import { AreaChips, Chip, SearchBox } from '../../filters'
import { SpotCard } from '../../spot-card'
import { SpotMaybeClosedLink } from '../../spot-maybe-closed-link'
import type { MaybeClosed } from '@/lib/spot-site-types'

const SPOT_TAG_CHIPS = Object.keys(SPOT_TAG_LABEL)

export function SpotListClient(
  { spots, initial, maybeClosed }: { spots: SpotListRow[]; initial: ListParams; maybeClosed: MaybeClosed[] },
) {
  const [q, setQ] = useState(initial.q)
  const [area, setArea] = useState<string[]>(initial.area)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [sort, setSort] = useState<Sort>(initial.sort)
  const [city, setCity] = useState(initial.city)
  const [newOnly, setNewOnly] = useState(initial.newOnly)
  const [wishOnly, setWishOnly] = useState(initial.wishOnly)
  const [blacklistOnly, setBlacklistOnly] = useState(initial.blacklistOnly)
  const [hideVisited, setHideVisited] = useState(initial.hideVisited)
  const [shownCount, setShownCount] = useState(initial.shown)
  const { wished, toggle: toggleWish } = useSpotWishlist()
  const { blacklisted, toggle: toggleBlacklist } = useSpotBlacklist()
  const { dismissed, dismiss } = useSpotDismissed()
  const { aliveIds, confirm } = useAliveConfirmed('/api/spot/alive')

  useUrlSync(listParamsToQuery({
    ...initial, q, area, tags, sort, city, newOnly, wishOnly, blacklistOnly, hideVisited,
    shown: shownCount,
  }))

  const notDismissed = useMemo(
    () => spots.filter((s) => !dismissed.has(s.id)),
    [spots, dismissed],
  )
  // 블랙리스트는 기본적으로 숨기고, "블랙리스트" 칩을 켜면 반대로 그것만 보여준다.
  const visible = useMemo(
    () => (blacklistOnly
      ? notDismissed.filter((s) => blacklisted.has(s.id))
      : notDismissed.filter((s) => !blacklisted.has(s.id))),
    [notDismissed, blacklisted, blacklistOnly],
  )
  const wishFiltered = useMemo(
    () => (wishOnly ? visible.filter((s) => wished.has(s.id)) : visible),
    [visible, wishOnly, wished],
  )
  // 다녀온 곳 제외도 같은 이유로 먼저 뺀다 — 다녀온 적 있으면 영구히 뺀다
  const notRecentlyVisited = useMemo(
    () => (hideVisited ? wishFiltered.filter((s) => !spotRecentlyVisited(s.visitedOn)) : wishFiltered),
    [wishFiltered, hideVisited],
  )

  const matched = useMemo(
    () => filterAndSort(notRecentlyVisited, { tags, sort, city, area, query: q, newOnly }),
    [notRecentlyVisited, tags, sort, city, area, q, newOnly],
  )
  const shown = useMemo(() => matched.slice(0, shownCount), [matched, shownCount])
  const rest = matched.length - shown.length
  const areas = useMemo(
    () => areaCounts(notRecentlyVisited, { city, tags, query: q }),
    [notRecentlyVisited, city, tags, q],
  )
  const subAreas = useMemo(
    () => sigunguCountsByArea(notRecentlyVisited, { city, tags, query: q }),
    [notRecentlyVisited, city, tags, q],
  )
  const newCount = useMemo(
    () => countMatching(notRecentlyVisited, { tags, sort, city, area, query: q, newOnly: true }),
    [notRecentlyVisited, tags, sort, city, area, q],
  )
  // 복수 지역을 고르면 묶어서 보여줄 기준이 애매해지므로 딱 하나만 고르고
  // 그게 서울·인천일 때만 묶는다.
  const groups = useMemo(
    () => (area.length === 1 && SPLIT_AREAS.has(area[0]!) ? groupBySigungu(shown) : null),
    [area, shown],
  )

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setShownCount(PAGE_CHUNK)
  }
  const toggle = reset<string>((t) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])))
  const dirty = tags.length > 0 || area.length > 0 || q !== '' || newOnly || wishOnly
    || blacklistOnly || hideVisited

  return (
    <div className="py-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">가볼 곳 전체 리스트</h1>
        <span className="text-[13px] text-ink-soft">{matched.length}곳</span>
      </div>

      <SpotMaybeClosedLink items={maybeClosed} />

      <div className="mt-3">
        <SearchBox value={q} onChange={reset(setQ)} placeholder="장소명 검색" />
      </div>

      <div className="mt-3">
        <AreaChips
          counts={areas}
          sub={subAreas}
          value={area}
          onChange={reset(setArea)}
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
        <Chip
          on={blacklistOnly}
          onClick={() => { setBlacklistOnly((v) => !v); setShownCount(PAGE_CHUNK) }}
        >
          ⊘ 블랙리스트
        </Chip>
        <Chip
          on={hideVisited}
          onClick={() => { setHideVisited((v) => !v); setShownCount(PAGE_CHUNK) }}
        >
          다녀온 곳 제외
        </Chip>
        {SPOT_TAG_CHIPS.map((t) => (
          <Chip key={t} on={tags.includes(t)} onClick={() => toggle(t)}>{SPOT_TAG_LABEL[t]}</Chip>
        ))}
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setTags([]); setArea([]); setQ(''); setNewOnly(false); setWishOnly(false)
              setBlacklistOnly(false); setHideVisited(false)
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
          주차가 어려운 도심 장소도 함께 보여줍니다.
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
                {g.rows.map((s) => (
                  <SpotCard
                    key={s.id}
                    spot={s}
                    wished={wished.has(s.id)}
                    onToggleWish={() => toggleWish(s.id)}
                    blacklisted={blacklisted.has(s.id)}
                    onToggleBlacklist={() => toggleBlacklist(s.id)}
                    stale={
                      !spotRecentlyVisited(s.visitedOn) && spotIsStale(s.lastSeenAt) && !aliveIds.has(s.id)
                    }
                    onDismiss={() => dismiss(s.id)}
                    onAlive={() => confirm(s.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {shown.map((s) => (
            <SpotCard
              key={s.id}
              spot={s}
              wished={wished.has(s.id)}
              onToggleWish={() => toggleWish(s.id)}
              blacklisted={blacklisted.has(s.id)}
              onToggleBlacklist={() => toggleBlacklist(s.id)}
              stale={
                !spotRecentlyVisited(s.visitedOn) && spotIsStale(s.lastSeenAt) && !aliveIds.has(s.id)
              }
              onDismiss={() => dismiss(s.id)}
              onAlive={() => confirm(s.id)}
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
          {blacklistOnly
            ? <>블랙리스트에 담은 곳이 없어요.<br />카드의 ⊘ 를 눌러 담아보세요.</>
            : wishOnly
              ? <>아직 담은 곳이 없어요.<br />카드의 하트를 눌러 담아보세요.</>
              : q
                ? <>“{q}” 로 찾은 곳이 없어요.<br />이름 일부만 넣어보세요.</>
                : '조건에 맞는 곳이 없어요. 칩을 줄여보세요.'}
        </p>
      )}
    </div>
  )
}
