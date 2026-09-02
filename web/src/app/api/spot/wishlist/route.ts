import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { spotById } from '@/lib/spot-site'
import { addWish, removeWish, todayInSeoul, SPOT_WISHLIST_PATH, type WishRow } from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ wishes: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<WishRow>(SPOT_WISHLIST_PATH)
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

  try {
    const rows = await store.update<WishRow>(
      SPOT_WISHLIST_PATH,
      remove ? 'data: 위시리스트에서 빼기' : 'data: 위시리스트에 담기',
      (prev) => (remove ? removeWish(prev, spot) : addWish(prev, spot, todayInSeoul())),
    )
    const wished = rows.some((w) => w.kakaoPlaceId === spot)
    return NextResponse.json({ wished })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
