import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { addVisit, removeVisit, todayInSeoul, VISITS_PATH, type VisitRow } from '@/lib/reviews'

export async function GET() {
  const store = await writeStore()
  try {
    const rows = await store.read<VisitRow>(VISITS_PATH, 30)
    return NextResponse.json({ visits: rows, enabled: store.enabled })
  } catch (e) {
    return NextResponse.json({ visits: [], enabled: true, error: (e as Error).message })
  }
}

/**
 * 다녀왔어요 기록·취소. `action` 을 명시적으로 받는다.
 *
 * 토글로 두었더니 "같은 날" 만 취소되는 문제가 있었다 — 어제 잘못 누른 것을
 * 오늘 취소하면 오늘 방문이 새로 추가된다. 화면은 자기 상태를 알고 있으니
 * 무엇을 원하는지 그대로 보내는 것이 맞다.
 *
 * 누가 눌렀는지 남기지 않는다 — 4명이 쓰는 페이지에서 "누가 체크했나" 는
 * 아무 가치가 없고, 그것을 알려면 인증을 붙여야 한다.
 */
export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 기록 저장이 설정되지 않았어요' }, { status: 503 })
  }

  let cafe = ''
  let remove = false
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown; action?: unknown }
    cafe = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
    remove = body.action === 'remove'
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!cafe) return NextResponse.json({ error: '카페를 알 수 없습니다' }, { status: 400 })

  const visitedOn = todayInSeoul()
  try {
    const rows = await store.update<VisitRow>(
      VISITS_PATH,
      remove ? 'data: 다녀왔어요 취소' : `data: 다녀왔어요 ${visitedOn}`,
      (prev) => (remove ? removeVisit(prev, cafe) : addVisit(prev, cafe, visitedOn)),
    )
    const visited = rows.some((v) => v.kakaoPlaceId === cafe)
    return NextResponse.json({ visited, visitedOn: remove ? null : visitedOn })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
