import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { byId } from '@/lib/site'
import { addVisit, removeVisit, todayInSeoul, VISITS_PATH, type VisitRow } from '@/lib/reviews'

/**
 * `ok` 는 **이 빈 배열이 진짜 빈 기록인지** 를 알려준다.
 *
 * 토큰이 없거나 GitHub 읽기가 실패해도 200 과 `visits: []` 가 나간다.
 * 화면이 그것을 실제 기록으로 믿으면 **다녀온 곳 탭이 통째로 비어 보인다** —
 * 가족에게는 기록이 지워진 것으로 보인다. 그래서 실패는 실패라고 말한다.
 */
export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ visits: [], enabled: false, writable: false, ok: false })
  }
  try {
    // 캐시를 두지 않는다. 30초 캐시를 뒀더니 체크한 직후 "다녀온 곳" 이 비어
    // 보이고 이번 주 추천에도 그대로 남았다 — 눌린 것이 안 눌린 것처럼 보인다.
    // 월 몇 번 열리는 페이지라 매번 읽어도 GitHub 한도(5,000/시간)에 닿지 않는다.
    const rows = await store.read<VisitRow>(VISITS_PATH)
    return NextResponse.json({ visits: rows, enabled: true, writable: writeOk, ok: true })
  } catch (e) {
    return NextResponse.json({
      visits: [], enabled: true, writable: writeOk, ok: false, error: (e as Error).message,
    })
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
  // 열람 전용 배포. 화면에서 버튼을 감추지만 그것만으로는 못 막는다.
  // host 를 보는 이유는 `lib/view-only.ts` 에 적었다 — 모르는 주소는 거절한다
  if (!store.writable || !hostCanWrite(req.headers.get('host'))) {
    return NextResponse.json({ error: '열람 전용 페이지예요' }, { status: 403 })
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

  // 추가할 때만 목록에 있는 카페인지 본다. 취소는 검사하지 않는다 — 목록에서
  // 빠진 카페의 기록도 취소할 수 있어야 한다.
  if (!remove && !byId(cafe)) {
    return NextResponse.json({ error: '목록에 없는 카페입니다' }, { status: 400 })
  }

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
