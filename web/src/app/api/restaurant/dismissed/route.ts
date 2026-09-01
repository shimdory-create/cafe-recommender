import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import {
  addDismiss, RESTAURANT_DISMISSED_PATH, removeDismiss, todayInSeoul, type DismissRow,
} from '@/lib/reviews'

/**
 * `/api/restaurant/visited`·`/api/restaurant/wishlist` 와 같은 모양이다. 여기서는
 * 목록에 없는 식당(폐업 확정으로 파이프라인이 이미 내린 곳)도 숨길 수 있어야
 * 하므로 `restaurantById` 로 존재를 확인하지 않는다 — 확인해도 다음 빌드부터는
 * 어차피 빠진다.
 */
export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ dismissed: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<DismissRow>(RESTAURANT_DISMISSED_PATH)
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
    const rows = await store.update<DismissRow>(
      RESTAURANT_DISMISSED_PATH,
      remove ? 'data: 폐업 의심 숨김 취소' : 'data: 폐업 의심 숨기기',
      (prev) => (remove ? removeDismiss(prev, restaurant) : addDismiss(prev, restaurant, todayInSeoul())),
    )
    const dismissed = rows.some((d) => d.kakaoPlaceId === restaurant)
    return NextResponse.json({ dismissed })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
