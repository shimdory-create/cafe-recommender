import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import {
  addAlive, RESTAURANT_ALIVE_PATH, removeAlive, todayInSeoul, type AliveRow,
} from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ alive: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<AliveRow>(RESTAURANT_ALIVE_PATH)
    return NextResponse.json({ alive: rows, enabled: true, writable: writeOk, ok: true })
  } catch (e) {
    return NextResponse.json({
      alive: [], enabled: true, writable: writeOk, ok: false, error: (e as Error).message,
    })
  }
}

export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 확인 기록 저장이 설정되지 않았어요' }, { status: 503 })
  }
  if (!store.writable || !hostCanWrite(req.headers.get('host'))) {
    return NextResponse.json({ error: '열람 전용 페이지예요' }, { status: 403 })
  }

  let restaurant = ''
  let remove = false
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown; action?: unknown }
    restaurant = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
    remove = body.action === 'remove'
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!restaurant) return NextResponse.json({ error: '식당을 알 수 없습니다' }, { status: 400 })

  try {
    const rows = await store.update<AliveRow>(
      RESTAURANT_ALIVE_PATH,
      remove ? 'data: 폐업 의심 확인 취소' : 'data: 폐업 의심 확인함 (아직 있음)',
      (prev) => (remove ? removeAlive(prev, restaurant) : addAlive(prev, restaurant, todayInSeoul())),
    )
    const alive = rows.some((d) => d.kakaoPlaceId === restaurant)
    return NextResponse.json({ alive })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
