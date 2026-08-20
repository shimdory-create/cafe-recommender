import { payload, weekPicks } from '@/lib/site'
import { CafeCard } from './cafe-card'

/**
 * 이번 주 (홈) — 카카오톡 링크의 도착지.
 * 여기서 스크롤 세 번 안에 결정이 끝나야 한다.
 */
export default function Home() {
  const picks = weekPicks()
  const week = new Date(payload.weekOf)
  const label = `${week.getMonth() + 1}월 ${week.getDate()}일 주`

  return (
    <div className="py-5">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold tracking-tight">이번 주 추천</h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          {label} · 블로그 화제량과 우리 집 거리로 골랐어요
        </p>
      </div>

      {picks.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-5 text-[14px] text-ink-soft">
          아직 추천할 카페가 없어요. 수집이 끝나면 채워집니다.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {picks.map((c, i) => (
            <CafeCard key={c.id} cafe={c} rank={i + 1} />
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        {payload.stats.regions}개 시군구에서 고른 {payload.stats.passed}곳 중에서
        <br />
        주차·메뉴·거리를 함께 보고 추렸어요
      </p>
    </div>
  )
}
