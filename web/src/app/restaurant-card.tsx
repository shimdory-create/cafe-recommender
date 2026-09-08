import Link from 'next/link'
import {
  addedLabel, driveLabel, postsLabel, CUISINE_LABEL, PARKING_LABEL, restaurantRecentlyVisited,
  type RestaurantListRow,
} from '@/lib/restaurant-site'
import { Thumb } from './thumb'
import { NaverMapLink } from './naver-map-link'
import { Badge } from './badge'

const PARKING_TONE: Record<string, string> = {
  A: 'text-emerald-700 dark:text-emerald-400',
  B: 'text-amber-700 dark:text-amber-400',
  C: 'text-orange-700 dark:text-orange-400',
  D: 'text-red-700 dark:text-red-400',
  '?': 'text-ink-soft',
}

/** 카드 상단 고정: 음식종류 · 주차 · 룸/예약. 갈지 말지를 3초에 결정하게 하는 정보 */
export function RestaurantTopThree({ restaurant }: { restaurant: RestaurantListRow }) {
  const amenities = [
    restaurant.hasRoom ? '룸 있음' : null,
    restaurant.reservable ? '예약 가능' : null,
  ].filter((x): x is string => x !== null)
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
      <span className="font-semibold">
        {restaurant.cuisineType
          ? (CUISINE_LABEL[restaurant.cuisineType] ?? restaurant.cuisineType)
          : '음식종류 미확인'}
      </span>
      <span className="text-line">·</span>
      <span className={`font-semibold ${PARKING_TONE[restaurant.parkingGrade]}`}>
        {PARKING_LABEL[restaurant.parkingGrade]}
      </span>
      {amenities.length > 0 && (
        <>
          <span className="text-line">·</span>
          <span>{amenities.join(' · ')}</span>
        </>
      )}
    </div>
  )
}

export function RestaurantCard({
  restaurant, rank, wished, onToggleWish, blacklisted, onToggleBlacklist, stale, onDismiss,
}: {
  restaurant: RestaurantListRow
  rank?: number
  wished?: boolean
  onToggleWish?: () => void
  blacklisted?: boolean
  onToggleBlacklist?: () => void
  stale?: boolean
  onDismiss?: () => void
}) {
  const visited = restaurantRecentlyVisited(restaurant.visitedOn)
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card">
      <Link
        href={`/restaurant/${restaurant.id}`}
        aria-label={`${restaurant.name} 자세히 보기`}
        className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
      >
        <div className="flex gap-3">
          <Thumb src={restaurant.imageUrl} alt={restaurant.name} size={60} icon="🍚" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[17px] font-bold leading-snug">
                {rank !== undefined && (
                  <span className="mr-1.5 text-bean">
                    {rank}
                    <span className="sr-only">위 </span>
                  </span>
                )}
                {restaurant.isNew && (
                  <span className="mr-1.5 align-[1px] rounded bg-bean px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                    NEW
                  </span>
                )}
                {restaurant.name}
              </h3>
              <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
                {onToggleWish && (
                  <button
                    type="button"
                    aria-pressed={wished}
                    aria-label={wished ? '위시리스트에서 빼기' : '위시리스트에 담기'}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWish() }}
                    className={`flex min-h-[40px] min-w-[40px] items-center justify-center text-[19px] ${
                      wished ? 'text-bean' : 'text-ink-soft'
                    }`}
                  >
                    {wished ? '♥' : '♡'}
                  </button>
                )}
                {onToggleBlacklist && (
                  <button
                    type="button"
                    aria-pressed={blacklisted}
                    aria-label={blacklisted ? '블랙리스트에서 빼기' : '블랙리스트에 추가'}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleBlacklist() }}
                    className={`flex min-h-[40px] min-w-[40px] items-center justify-center text-[19px] ${
                      blacklisted ? 'text-red-600 dark:text-red-400' : 'text-ink-soft'
                    }`}
                  >
                    ⊘
                  </button>
                )}
                {restaurant.ratingCount > 0 && (
                  <span className="text-[13px] font-bold text-bean">
                    ★ {restaurant.ratingAvg.toFixed(1)}
                  </span>
                )}
                {visited && (
                  <span className="rounded-full bg-line px-2 py-0.5 text-[11px] text-ink-soft">
                    다녀옴
                  </span>
                )}
              </span>
            </div>

            <p className="mt-0.5 truncate text-[13px] text-ink-soft">
              {restaurant.sigungu} · {driveLabel(restaurant.driveMinutes)} · {addedLabel(restaurant.firstSeenAt)}
              {' · '}{postsLabel(restaurant.posts30, restaurant.posts90)}
            </p>

            <div className="mt-1.5">
              <RestaurantTopThree restaurant={restaurant} />
            </div>
          </div>
        </div>

        {stale && (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-amber-50 pl-2.5 pr-1 text-[12px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span>폐업 의심 · 카카오지도에서 최근 안 보여요</span>
            {onDismiss && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss() }}
                className="flex min-h-[40px] shrink-0 items-center px-2 underline"
              >
                숨기기
              </button>
            )}
          </div>
        )}

        {restaurant.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {restaurant.tags.slice(0, 4).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        )}

        {restaurant.evidence && (
          <p className="mt-3 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed text-ink-soft">
            {restaurant.evidence}
          </p>
        )}
      </Link>

      <NaverMapLink
        href={restaurant.naverMapUrl}
        className="flex min-h-[48px] items-center justify-center gap-1.5 border-t border-line text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        네이버지도로 열기 ↗
      </NaverMapLink>
    </article>
  )
}
