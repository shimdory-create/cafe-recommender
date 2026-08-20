import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { todayInSeoul, toggleVisit, VISITS_PATH, type VisitRow } from '@/lib/reviews'

export async function GET() {
  const store = writeStore()
  try {
    const rows = await store.read<VisitRow>(VISITS_PATH, 30)
    return NextResponse.json({ visits: rows, enabled: store.enabled })
  } catch (e) {
    return NextResponse.json({ visits: [], enabled: true, error: (e as Error).message })
  }
}

/**
 * 다녀왔어요 토글. 같은 날 다시 누르면 취소된다.
 *
 * 누가 눌렀는지 남기지 않는다 — 4명이 쓰는 페이지에서 "누가 체크했나" 는
 * 아무 가치가 없고, 그것을 알려면 인증을 붙여야 한다.
 */
export async function POST(req: Request) {
  const store = writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 기록 저장이 설정되지 않았어요' }, { status: 503 })
  }

  let cafe = ''
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown }
    cafe = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!cafe) return NextResponse.json({ error: '카페를 알 수 없습니다' }, { status: 400 })

  const visitedOn = todayInSeoul()
  try {
    const rows = await store.update<VisitRow>(
      VISITS_PATH,
      `data: 다녀왔어요 ${visitedOn}`,
      (prev) => toggleVisit(prev, cafe, visitedOn),
    )
    const visited = rows.some((v) => v.kakaoPlaceId === cafe && v.visitedOn === visitedOn)
    return NextResponse.json({ visited, visitedOn })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
