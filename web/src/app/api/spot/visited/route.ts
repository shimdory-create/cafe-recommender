import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { spotById } from '@/lib/spot-site'
import { addVisit, removeVisit, todayInSeoul, SPOT_VISITS_PATH, type VisitRow } from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ visits: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<VisitRow>(SPOT_VISITS_PATH)
    return NextResponse.json({ visits: rows, enabled: true, writable: writeOk, ok: true })
  } catch (e) {
    return NextResponse.json({
      visits: [], enabled: true, writable: writeOk, ok: false, error: (e as Error).message,
    })
  }
}

export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 기록 저장이 설정되지 않았어요' }, { status: 503 })
  }
  if (!store.writable || !hostCanWrite(req.headers.get('host'))) {
    return NextResponse.json({ error: '열람 전용 페이지예요' }, { status: 403 })
  }

  let spot = ''
  let remove = false
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown; action?: unknown }
    spot = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
    remove = body.action === 'remove'
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!spot) return NextResponse.json({ error: '장소를 알 수 없습니다' }, { status: 400 })
  if (!remove && !spotById(spot)) {
    return NextResponse.json({ error: '목록에 없는 장소입니다' }, { status: 400 })
  }

  const visitedOn = todayInSeoul()
  try {
    const rows = await store.update<VisitRow>(
      SPOT_VISITS_PATH,
      remove ? 'data: 다녀왔어요 취소' : `data: 다녀왔어요 ${visitedOn}`,
      (prev) => (remove ? removeVisit(prev, spot) : addVisit(prev, spot, visitedOn)),
    )
    const visited = rows.some((v) => v.kakaoPlaceId === spot)
    return NextResponse.json({ visited, visitedOn: remove ? null : visitedOn })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
