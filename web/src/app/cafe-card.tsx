import Link from 'next/link'
import {
  driveLabel, MENU_LABEL, PARKING_LABEL, recentlyVisited, type ListRow,
} from '@/lib/site'

/** 주차 등급을 색으로도 구분한다. 차로 가는 가족에게 가장 중요한 정보다 */
const PARKING_TONE: Record<string, string> = {
  A: 'text-emerald-700 dark:text-emerald-400',
  B: 'text-amber-700 dark:text-amber-400',
  C: 'text-orange-700 dark:text-orange-400',
  D: 'text-red-700 dark:text-red-400',
  '?': 'text-ink-soft',
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-bean-soft px-2.5 py-1 text-[12px] font-medium text-bean">
      {children}
    </span>
  )
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
    <div className="flex items-center gap-2 text-[13px]">
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

export function CafeCard({ cafe, rank }: { cafe: ListRow; rank?: number }) {
  const visited = recentlyVisited(cafe.visitedOn)
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card">
      <Link
        href={`/cafe/${cafe.id}`}
        aria-label={`${cafe.name} 자세히 보기`}
        className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[18px] font-bold leading-snug">
            {rank !== undefined && (
              // 화면에서는 큰 숫자로, 읽어줄 때는 "1위" 로 들리게
              <span className="mr-1.5 text-bean">
                {rank}
                <span className="sr-only">위 </span>
              </span>
            )}
            {cafe.name}
          </h2>
          <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
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

        <p className="mt-1 text-[13px] text-ink-soft">
          {cafe.sigungu} · {driveLabel(cafe.driveMinutes)}
        </p>

        <div className="mt-2.5">
          <TopThree cafe={cafe} />
        </div>

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
      <a
        href={cafe.naverMapUrl}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-[48px] items-center justify-center gap-1.5 border-t border-line text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        네이버지도로 열기 ↗
      </a>
    </article>
  )
}
