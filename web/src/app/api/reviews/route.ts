import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { byId } from '@/lib/site'
import {
  parseReviewInput, sortByNewest, summarize, REVIEWS_PATH, type Review,
} from '@/lib/reviews'

/**
 * 후기 읽기에 캐시를 두지 않는다.
 *
 * 30초 캐시를 뒀더니 별점을 남기고 "다녀온 곳" 을 열면 **"아직 별점이 없어요"**
 * 가 떴다 (감사 중 실측). 남긴 사람에게 그 문구는 "저장이 안 됐다" 로 읽히고,
 * 그러면 다시 남겨 중복이 생긴다.
 *
 * 방문 기록과 같은 판단이다 — 월 몇 번 열리는 페이지라 매번 읽어도 GitHub
 * 한도(5,000/시간)에 닿지 않는다.
 */

export async function GET(req: Request) {
  const store = await writeStore()
  const cafe = new URL(req.url).searchParams.get('cafe')
  try {
    const rows = await store.read<Review>(REVIEWS_PATH)
    const mine = cafe ? rows.filter((r) => r.kakaoPlaceId === cafe) : rows
    return NextResponse.json({
      reviews: sortByNewest(mine),
      summary: summarize(mine),
      enabled: store.enabled,
      ok: true,
    })
  } catch (e) {
    // 읽기 실패가 화면을 깨뜨리지 않게 한다 (스펙 6.6 우아한 저하).
    // 단 `ok: false` 로 알린다 — 빈 목록을 "후기가 없다" 로 읽으면 이미 남긴
    // 사람이 다시 남겨 중복이 생긴다.
    return NextResponse.json(
      {
        reviews: [], summary: { count: 0, average: 0 }, enabled: true, ok: false,
        error: (e as Error).message,
      },
      { status: 200 },
    )
  }
}

export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 후기 저장이 설정되지 않았어요' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }

  const parsed = parseReviewInput(body as never, new Date())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  // 목록에 없는 카페에는 후기를 붙이지 않는다 — 화면에 보이지 않는 곳에
  // 데이터가 쌓이면 지울 방법도 화면에 없다.
  if (!byId(parsed.review.kakaoPlaceId)) {
    return NextResponse.json({ error: '목록에 없는 카페입니다' }, { status: 400 })
  }

  try {
    const rows = await store.update<Review>(
      REVIEWS_PATH,
      `data: 후기 (${parsed.review.nickname || '가족'})`,
      // 순수 함수여야 한다 — 충돌 시 다시 호출된다
      (prev) => [...prev, parsed.review],
    )
    const mine = rows.filter((r) => r.kakaoPlaceId === parsed.review.kakaoPlaceId)
    return NextResponse.json({ review: parsed.review, summary: summarize(mine) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
