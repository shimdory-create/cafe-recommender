import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { spotById } from '@/lib/spot-site'
import {
  addBlacklist, removeBlacklist, todayInSeoul, SPOT_BLACKLIST_PATH, type BlacklistRow,
} from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ blacklist: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<BlacklistRow>(SPOT_BLACKLIST_PATH)
    return NextResponse.json({ blacklist: rows, enabled: true, writable: writeOk, ok: true })
  } catch (e) {
    return NextResponse.json({
      blacklist: [], enabled: true, writable: writeOk, ok: false, error: (e as Error).message,
    })
  }
}

export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 블랙리스트 저장이 설정되지 않았어요' }, { status: 503 })
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
    const rows = await store.update<BlacklistRow>(
      SPOT_BLACKLIST_PATH,
      remove ? 'data: 블랙리스트에서 빼기' : 'data: 블랙리스트에 담기',
      (prev) => (remove ? removeBlacklist(prev, spot) : addBlacklist(prev, spot, todayInSeoul())),
    )
    const blacklisted = rows.some((b) => b.kakaoPlaceId === spot)
    return NextResponse.json({ blacklisted })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
