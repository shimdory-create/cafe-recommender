import Link from 'next/link'
import {
  spotRecentlyVisited, PARKING_LABEL, INDOOR_OUTDOOR_LABEL, type SpotListRow,
} from '@/lib/spot-site'
import { driveLabel, addedLabel } from '@/lib/labels'
import { Badge } from './badge'
import { Thumb } from './thumb'
import { NaverMapLink } from './naver-map-link'

const PARKING_TONE: Record<string, string> = {
  A: 'text-emerald-700 dark:text-emerald-400',
  B: 'text-amber-700 dark:text-amber-400',
  C: 'text-orange-700 dark:text-orange-400',
  D: 'text-red-700 dark:text-red-400',
  '?': 'text-ink-soft',
}

/** 카드 상단 고정: 태그(최대 2개) · 주차 · 체류시간/실내외. 갈지 말지를 3초에 결정하게 하는 정보 */
export function SpotTopThree({ spot }: { spot: SpotListRow }) {
  const extra = [
    spot.stayDuration,
    spot.indoorOutdoor ? INDOOR_OUTDOOR_LABEL[spot.indoorOutdoor] : null,
  ].filter((x): x is string => Boolean(x))
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
      <span className="font-semibold">
        {spot.tags.length > 0 ? spot.tags.slice(0, 2).join(' · ') : '태그 미확인'}
      </span>
      <span className="text-line">·</span>
      <span className={`font-semibold ${PARKING_TONE[spot.parkingGrade]}`}>
        {PARKING_LABEL[spot.parkingGrade]}
      </span>
      {extra.length > 0 && (
        <>
          <span className="text-line">·</span>
          <span>{extra.join(' · ')}</span>
        </>
      )}
    </div>
  )
}

export function SpotCard({
  spot, rank, wished, onToggleWish, stale, onDismiss,
}: {
  spot: SpotListRow
  rank?: number
  wished?: boolean
  onToggleWish?: () => void
  stale?: boolean
  onDismiss?: () => void
}) {
  const visited = spotRecentlyVisited(spot.visitedOn)
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card">
      <Link
        href={`/spot/${spot.id}`}
        aria-label={`${spot.name} 자세히 보기`}
        className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
      >
        <div className="flex gap-3">
          <Thumb src={spot.imageUrl} alt={spot.name} size={60} icon="🏞️" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[17px] font-bold leading-snug">
                {rank !== undefined && (
                  <span className="mr-1.5 text-bean">
                    {rank}
                    <span className="sr-only">위 </span>
                  </span>
                )}
                {spot.isNew && (
                  <span className="mr-1.5 align-[1px] rounded bg-bean px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                    NEW
                  </span>
                )}
                {spot.name}
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
                {spot.ratingCount > 0 && (
                  <span className="text-[13px] font-bold text-bean">
                    ★ {spot.ratingAvg.toFixed(1)}
                  </span>
                )}
                {visited && (
                  <span className="rounded-full bg-line px-2 py-0.5 text-[11px] text-ink-soft">
                    다녀옴
                  </span>
                )}
              </span>
            </div>

            <p className="mt-0.5 text-[13px] text-ink-soft">
              {spot.sigungu} · {driveLabel(spot.driveMinutes)} · {addedLabel(spot.firstSeenAt)}
            </p>

            <div className="mt-1.5">
              <SpotTopThree spot={spot} />
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

        {spot.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {spot.tags.slice(0, 4).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        )}

        {spot.evidence && (
          <p className="mt-3 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed text-ink-soft">
            {spot.evidence}
          </p>
        )}
      </Link>

      <NaverMapLink
        href={spot.naverMapUrl}
        className="flex min-h-[48px] items-center justify-center gap-1.5 border-t border-line text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        네이버지도로 열기 ↗
      </NaverMapLink>
    </article>
  )
}
