import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { restaurantById } from '@/lib/restaurant-site'
import { addWish, removeWish, todayInSeoul, RESTAURANT_WISHLIST_PATH, type WishRow } from '@/lib/reviews'

/**
 * `/api/restaurant/visited` 와 같은 모양이다 — `ok` 로 "진짜 빈 위시리스트" 와
 * "읽기 실패" 를 구분한다. 구분하지 않으면 읽기가 실패했을 때 하트가 전부 꺼진
 * 것처럼 보인다.
 */
export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ wishes: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<WishRow>(RESTAURANT_WISHLIST_PATH)
    return NextResponse.json({ wishes: rows, enabled: true, writable: writeOk, ok: true })
  } catch (e) {
    return NextResponse.json({
      wishes: [], enabled: true, writable: writeOk, ok: false, error: (e as Error).message,
    })
  }
}

export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 위시리스트 저장이 설정되지 않았어요' }, { status: 503 })
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
  if (!remove && !restaurantById(restaurant)) {
    return NextResponse.json({ error: '목록에 없는 식당입니다' }, { status: 400 })
  }

  try {
    const rows = await store.update<WishRow>(
      RESTAURANT_WISHLIST_PATH,
      remove ? 'data: 위시리스트에서 빼기' : 'data: 위시리스트에 담기',
      (prev) => (remove ? removeWish(prev, restaurant) : addWish(prev, restaurant, todayInSeoul())),
    )
    const wished = rows.some((w) => w.kakaoPlaceId === restaurant)
    return NextResponse.json({ wished })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
