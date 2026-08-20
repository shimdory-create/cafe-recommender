import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import {
  parseReviewInput, sortByNewest, summarize, REVIEWS_PATH, type Review,
} from '@/lib/reviews'

/** 별점이 올라오면 30초 안에 다른 가족에게도 보인다 */
const READ_REVALIDATE = 30

export async function GET(req: Request) {
  const store = writeStore()
  const cafe = new URL(req.url).searchParams.get('cafe')
  try {
    const rows = await store.read<Review>(REVIEWS_PATH, READ_REVALIDATE)
    const mine = cafe ? rows.filter((r) => r.kakaoPlaceId === cafe) : rows
    return NextResponse.json({
      reviews: sortByNewest(mine),
      summary: summarize(mine),
      enabled: store.enabled,
    })
  } catch (e) {
    // 읽기 실패가 화면을 깨뜨리지 않게 한다 (스펙 6.6 우아한 저하)
    return NextResponse.json(
      { reviews: [], summary: { count: 0, average: 0 }, enabled: true, error: (e as Error).message },
      { status: 200 },
    )
  }
}

export async function POST(req: Request) {
  const store = writeStore()
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
