import Link from 'next/link'
import {
  addedLabel, driveLabel, MENU_LABEL, PARKING_LABEL, postsLabel, recentlyVisited,
  type ListRow,
} from '@/lib/site'
import { Thumb } from './thumb'
import { NaverMapLink } from './naver-map-link'
// Badge 는 badge.tsx 로 옮겼다 (식당 카드가 이 파일을 통해 @/lib/site 의
// 카페 payload 를 끌고 들어가지 않도록). 이 파일 안에서도 여전히 쓰므로
// import 해 오고, 기존에 `./cafe-card` 에서 Badge 를 가져다 쓰던 코드가
// 그대로 동작하도록 다시 export 한다.
import { Badge } from './badge'

export { Badge }

/** 주차 등급을 색으로도 구분한다. 차로 가는 가족에게 가장 중요한 정보다 */
const PARKING_TONE: Record<string, string> = {
  A: 'text-emerald-700 dark:text-emerald-400',
  B: 'text-amber-700 dark:text-amber-400',
  C: 'text-orange-700 dark:text-orange-400',
  D: 'text-red-700 dark:text-red-400',
  '?': 'text-ink-soft',
}

/**
 * 카드 상단 고정 3종: 규모 · 주차 · 메뉴 레벨 (스펙 10절 v3.1).
 * 갈지 말지를 3초에 결정하게 하는 정보다.
 *
 * 원래 스펙은 `좌석 규모` 였는데 실측에서 `seatsEstimate` 가 100% null 이었다.
 * 블로거는 좌석 수를 쓰지 않는다. `scale` 로 대체했다.
 */
export function TopThree({ cafe }: { cafe: ListRow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
      <span className="font-semibold">{cafe.scale ?? '규모 미확인'}</span>
      <span className="text-line">·</span>
      <span className={`font-semibold ${PARKING_TONE[cafe.parkingGrade]}`}>
        {PARKING_LABEL[cafe.parkingGrade]}
      </span>
      <span className="text-line">·</span>
      <span>{MENU_LABEL[cafe.menuLevel] ?? `Lv${cafe.menuLevel}`}</span>
    </div>
  )
}

export function CafeCard({
  cafe, rank, rankInfo, wished, onToggleWish, blacklisted, onToggleBlacklist, stale, onDismiss,
  onAlive, postsOverride,
}: {
  cafe: ListRow
  rank?: number
  /** 전체 리스트 화면의 종합순위 배지(화제·거리순 기준 고정). 홈 피드의
   * `rank`(우선순위 큐레이션 번호)와는 다른 용도라 별도 prop 으로 둔다 */
  rankInfo?: { filter: number; overall: number }
  /** 위시리스트 상태. 부모가 안 넘기면(서버 렌더 폴백 등) 하트 자체를 그리지 않는다 */
  wished?: boolean
  onToggleWish?: () => void
  /** 블랙리스트 상태. 리스트에서는 블랙리스트인 카드가 애초에 안 넘어오므로 늘 false다 */
  blacklisted?: boolean
  onToggleBlacklist?: () => void
  /** liveness 잡이 오래 못 본 카페 (폐업 의심). 부모가 이미 "있어요" 확인·숨김을
   * 반영해서 넘기므로 여기선 그대로 믿는다 */
  stale?: boolean
  onDismiss?: () => void
  /** "있어요" 확인 — 있으면 90일 동안 이 배너가 다시 안 뜬다 */
  onAlive?: () => void
  /** 홈("이번 주 추천")은 postsLabel 대신 트렌드까지 붙인 문구(reason)를
   * 그대로 보여준다(2026-09-08, feed-cards.tsx) */
  postsOverride?: string
}) {
  const visited = recentlyVisited(cafe.visitedOn)
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card">
      <Link
        href={`/cafe/${cafe.id}`}
        aria-label={`${cafe.name} 자세히 보기`}
        className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
      >
        <div className="flex gap-3">
          <Thumb src={cafe.imageUrl} alt={cafe.name} size={60} />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[17px] font-bold leading-snug">
                {rank !== undefined && (
                  // 화면에서는 큰 숫자로, 읽어줄 때는 "1위" 로 들리게
                  <span className="mr-1.5 text-bean">
                    {rank}
                    <span className="sr-only">위 </span>
                  </span>
                )}
                {cafe.isNew && (
                  // 이름 앞에 붙인다. "우리 목록에 새로 들어왔다" 는 뜻이지
                  // 신규 개업이 아니다 — 개업일을 주는 무료 API 가 없다
                  <span className="mr-1.5 align-[1px] rounded bg-bean px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                    NEW
                  </span>
                )}
                {cafe.name}
              </h3>
              <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
                {onToggleWish && (
                  // 카드 전체가 Link 라 클릭이 상세 이동으로 먼저 먹는다 — 막아야 한다
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
                {/* 우리 가족 별점이 있으면 블로그 화제량보다 먼저 보인다 */}
                {cafe.ratingCount > 0 && (
                  <span className="text-[13px] font-bold text-bean">
                    ★ {cafe.ratingAvg.toFixed(1)}
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
              {cafe.sigungu} · {driveLabel(cafe.driveMinutes)} · {addedLabel(cafe.firstSeenAt)}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-ink-soft">
              {postsOverride ?? postsLabel(cafe.posts30, cafe.posts90)}
            </p>
            {rankInfo && (
              <p className="mt-0.5 text-[13px] text-ink-soft">
                {rankInfo.filter}위/전체{rankInfo.overall}위
              </p>
            )}

            <div className="mt-1.5">
              <TopThree cafe={cafe} />
            </div>
          </div>
        </div>

        {stale && (
          <div className="mt-2.5 flex items-center justify-between gap-1 rounded-lg bg-amber-50 pl-2.5 pr-1 text-[12px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span>폐업 의심 · 카카오지도에서 최근 안 보여요</span>
            <span className="flex shrink-0 items-center">
              {onAlive && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAlive() }}
                  className="flex min-h-[40px] shrink-0 items-center px-2 underline"
                >
                  있어요
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss() }}
                  className="flex min-h-[40px] shrink-0 items-center px-2 underline"
                >
                  숨기기
                </button>
              )}
            </span>
          </div>
        )}

        {cafe.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {cafe.tags.slice(0, 4).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        )}

        {cafe.evidence && (
          <p className="mt-3 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed text-ink-soft">
            {cafe.evidence}
          </p>
        )}
      </Link>

      {/* 터치 타겟 44px 이상 (스펙 10.1) */}
      <NaverMapLink
        href={cafe.naverMapUrl}
        className="flex min-h-[48px] items-center justify-center gap-1.5 border-t border-line text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        네이버지도로 열기 ↗
      </NaverMapLink>
    </article>
  )
}
