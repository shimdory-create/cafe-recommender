import { Suspense } from 'react'
import { homeFeed, payload, toListRow, type SiteCafe } from '@/lib/site'
import { postsLabel, weekLabel } from '@/lib/labels'
import { PAGE_SIZE } from '@/lib/paging'
import { HomeFeed } from './home-feed'
import { FeedCards, type FeedRow } from './feed-cards'

/**
 * 왜 이 카페가 올라왔는지 한 줄로. 숫자를 보여주면 목록을 신뢰하게 된다.
 *
 * 추이는 생성기가 판정한 `trend` 만 믿는다. 가속도 숫자는 17.67 에서
 * 포화되므로 그것으로 "급증" 을 말하면 절반이 급증이 된다 (발견 E).
 */
function reasonLine(posts30: number, posts90: number, trend: SiteCafe['trend']): string {
  // 네이버 리뷰수 자리다. 공식 API 가 리뷰수를 주지 않아 우리가 직접 센
  // 값을 쓴다 — 상호 일치를 확인한 글만 센 **실측**이다.
  //
  // 추정 발행률(`postsPer30`)을 쓰지 않는 이유: 50건 창이 이틀에 차는 카페는
  // `월 599건` 이 나오는데 같은 카페의 90일 실측이 46건이었다 (실측).
  // 둘이 같으면 50건 창이 최근 30일에 다 들어찼다는 뜻이다. 같은 수를 두 번
  // 쓰면 읽는 사람이 오타로 본다 — 하나만 쓴다
  const posts = postsLabel(posts30, posts90)
  return trend === 'rising' ? `${posts} · 지금 뜨는 중` : posts
}

/**
 * 이번 주 (홈) — 카카오톡 링크의 도착지.
 *
 * 10곳을 보여주고 다음 10곳으로 넘어간다. 3곳으로 시작했는데 "너무 적다" 는
 * 피드백을 받았다 — 4인 가족이 취향을 맞추려면 고를 폭이 필요하다.
 */
export default function Home() {
  const feed: FeedRow[] = homeFeed().map((c) => ({
    ...toListRow(c),
    reason: reasonLine(c.posts30, c.posts90, c.trend),
  }))

  const label = weekLabel(payload.weekOf)

  return (
    <div className="py-5">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold tracking-tight">이번 주 추천 카페</h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          {label} · 블로그 화제량과 우리집(부평) 거리로 골랐어요
        </p>
      </div>

      {feed.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-5 text-[14px] text-ink-soft">
          아직 추천할 카페가 없어요. 수집이 끝나면 채워집니다.
        </p>
      ) : (
        // HomeFeed 는 URL 의 `?p=` 를 읽으므로 클라이언트에서만 그려진다.
        // fallback 으로 **1페이지를 서버가 미리 그려** 첫 화면이 비지 않게 한다 —
        // 이 화면이 카카오톡 링크의 도착지다.
        <Suspense fallback={<FeedCards rows={feed.slice(0, PAGE_SIZE)} />}>
          <HomeFeed rows={feed} />
        </Suspense>
      )}

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        {payload.stats.regions}개 시군구에서 고른 {payload.stats.passed}곳 중에서
        <br />
        주차·메뉴·거리를 함께 보고 {Math.min(PAGE_SIZE, feed.length)}곳씩 추렸어요
      </p>
    </div>
  )
}
