import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import {
  addDismiss, SPOT_DISMISSED_PATH, removeDismiss, todayInSeoul, type DismissRow,
} from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ dismissed: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<DismissRow>(SPOT_DISMISSED_PATH)
    return NextResponse.json({ dismissed: rows, enabled: true, writable: writeOk, ok: true })
  } catch (e) {
    return NextResponse.json({
      dismissed: [], enabled: true, writable: writeOk, ok: false, error: (e as Error).message,
    })
  }
}

export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 숨김 저장이 설정되지 않았어요' }, { status: 503 })
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

  try {
    const rows = await store.update<DismissRow>(
      SPOT_DISMISSED_PATH,
      remove ? 'data: 폐업 의심 숨김 취소' : 'data: 폐업 의심 숨기기',
      (prev) => (remove ? removeDismiss(prev, spot) : addDismiss(prev, spot, todayInSeoul())),
    )
    const dismissed = rows.some((d) => d.kakaoPlaceId === spot)
    return NextResponse.json({ dismissed })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
