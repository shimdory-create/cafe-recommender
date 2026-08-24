import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { byId } from '@/lib/site'
import {
  addVisit, applyReviewPatch, parseReviewInput, removeReview, sortByNewest, summarize,
  todayInSeoul, REVIEWS_PATH, VISITS_PATH, type Review, type VisitRow,
} from '@/lib/reviews'

/**
 * 쓰기 관문. 열람 전용이면 여기서 끝난다.
 *
 * **host 를 본다.** 가족용 주소가 아니면 거절한다 — 화면이 버튼을 감추는
 * 것만으로는 개발자도구로 뚫린다 (스펙 10.15).
 */
async function writable(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return { store, deny: NextResponse.json({ error: '아직 후기 저장이 설정되지 않았어요' }, { status: 503 }) }
  }
  if (!store.writable || !hostCanWrite(req.headers.get('host'))) {
    return { store, deny: NextResponse.json({ error: '열람 전용 페이지예요' }, { status: 403 }) }
  }
  return { store, deny: null as null }
}

/**
 * 후기 읽기에 캐시를 두지 않는다.
 *
 * 30초 캐시를 뒀더니 별점을 남기고 "다녀온 곳" 을 열면 **"아직 별점이 없어요"**
 * 가 떴다 (감사 중 실측). 남긴 사람에게 그 문구는 "저장이 안 됐다" 로 읽히고,
 * 그러면 다시 남겨 중복이 생긴다.
 *
 * 방문 기록과 같은 판단이다 — 월 몇 번 열리는 페이지라 매번 읽어도 GitHub
 * 한도(5,000/시간)에 닿지 않는다.
 */

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  const cafe = new URL(req.url).searchParams.get('cafe')
  // 저장소가 안 붙어 있으면 **못 읽은 것**이다. `ok: true` 로 빈 배열을 주면
  // 화면이 그것을 "후기 없음" 으로 믿고 빌드 시점 사본을 지운다 — 토큰을 안
  // 준 열람 전용 배포에서 별점이 통째로 사라진다 (스펙 10.15)
  if (!store.enabled) {
    return NextResponse.json({
      reviews: [], summary: { count: 0, average: 0 }, enabled: false, writable: false, ok: false,
    })
  }
  try {
    const rows = await store.read<Review>(REVIEWS_PATH)
    const mine = cafe ? rows.filter((r) => r.kakaoPlaceId === cafe) : rows
    return NextResponse.json({
      reviews: sortByNewest(mine),
      summary: summarize(mine),
      enabled: store.enabled,
      writable: writeOk,
      ok: true,
    })
  } catch (e) {
    // 읽기 실패가 화면을 깨뜨리지 않게 한다 (스펙 6.6 우아한 저하).
    // 단 `ok: false` 로 알린다 — 빈 목록을 "후기가 없다" 로 읽으면 이미 남긴
    // 사람이 다시 남겨 중복이 생긴다.
    return NextResponse.json(
      {
        reviews: [], summary: { count: 0, average: 0 }, enabled: true,
        writable: writeOk, ok: false, error: (e as Error).message,
      },
      { status: 200 },
    )
  }
}

export async function POST(req: Request) {
  const { store, deny } = await writable(req)
  if (deny) return deny

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }

  const parsed = parseReviewInput(body as never, new Date())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  // 목록에 없는 카페에는 후기를 붙이지 않는다 — 화면에 보이지 않는 곳에
  // 데이터가 쌓이면 지울 방법도 화면에 없다.
  if (!byId(parsed.review.kakaoPlaceId)) {
    return NextResponse.json({ error: '목록에 없는 카페입니다' }, { status: 400 })
  }

  try {
    const rows = await store.update<Review>(
      REVIEWS_PATH,
      `data: 후기 (${parsed.review.nickname || '가족'})`,
      // 순수 함수여야 한다 — 충돌 시 다시 호출된다
      (prev) => [...prev, parsed.review],
    )
    const mine = rows.filter((r) => r.kakaoPlaceId === parsed.review.kakaoPlaceId)

    /*
     * 별점을 남겼으면 다녀온 것이다 — 체크를 따로 누르게 하지 않는다.
     *
     * 화면에서 두 번 호출하지 않고 여기서 처리하는 이유: 첫 요청만 성공하고
     * 두 번째가 끊기면 **별점은 있는데 다녀온 곳에는 없는** 상태가 남는다.
     * 서버에서 이어 붙이면 적어도 한 곳에서만 실패한다.
     *
     * 방문 기록 쓰기가 실패해도 별점 저장은 되살리지 않는다. 남긴 사람에게는
     * 별점이 저장된 것이 더 중요하고, 체크는 다시 누를 수 있다.
     */
    let visitedOn: string | null = null
    try {
      const visits = await store.read<VisitRow>(VISITS_PATH)
      if (!visits.some((v) => v.kakaoPlaceId === parsed.review.kakaoPlaceId)) {
        visitedOn = todayInSeoul()
        await store.update<VisitRow>(
          VISITS_PATH,
          `data: 별점과 함께 다녀왔어요 ${visitedOn}`,
          (prev) => addVisit(prev, parsed.review.kakaoPlaceId, visitedOn!),
        )
      } else {
        visitedOn = visits.find((v) => v.kakaoPlaceId === parsed.review.kakaoPlaceId)!.visitedOn
      }
    } catch {
      // 별점은 이미 저장됐다. 체크는 화면에서 다시 누를 수 있다
    }

    return NextResponse.json({ review: parsed.review, summary: summarize(mine), visitedOn })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}

/**
 * 남긴 별점 고치기.
 *
 * 화면이 아니라 저장소 수준에서 통째로 갈아끼우지 않고 `id` 로 한 건만
 * 바꾼다. 충돌 시 `store.update` 가 순수 함수를 다시 부르므로, 같은 순간
 * 다른 가족이 남긴 후기가 사라지지 않는다.
 */
export async function PATCH(req: Request) {
  const { store, deny } = await writable(req)
  if (deny) return deny

  let body: { id?: unknown } & Record<string, unknown>
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) return NextResponse.json({ error: '어떤 후기인지 알 수 없습니다' }, { status: 400 })

  const now = new Date()
  let updated: Review | null = null
  let failure = ''
  try {
    const rows = await store.update<Review>(
      REVIEWS_PATH,
      'data: 후기 수정',
      (prev) => {
        const out = applyReviewPatch(prev, id, body as never, now)
        if (!out.ok) {
          failure = out.error
          return prev
        }
        updated = out.review
        return out.rows
      },
    )
    if (failure) return NextResponse.json({ error: failure }, { status: 400 })
    const mine = rows.filter((r) => r.kakaoPlaceId === updated!.kakaoPlaceId)
    return NextResponse.json({ review: updated, summary: summarize(mine) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}

/**
 * 남긴 별점 지우기.
 *
 * 다녀온 기록은 건드리지 않는다 — 별점을 지우는 것과 안 갔다는 것은 다르다.
 * 방문 취소는 다녀온 곳 탭에 따로 있다.
 */
export async function DELETE(req: Request) {
  const { store, deny } = await writable(req)
  if (deny) return deny

  let id = ''
  let cafe = ''
  try {
    const body = (await req.json()) as { id?: unknown; kakaoPlaceId?: unknown }
    id = typeof body.id === 'string' ? body.id.trim() : ''
    cafe = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: '어떤 후기인지 알 수 없습니다' }, { status: 400 })

  try {
    const rows = await store.update<Review>(
      REVIEWS_PATH,
      'data: 후기 삭제',
      (prev) => removeReview(prev, id),
    )
    const mine = cafe ? rows.filter((r) => r.kakaoPlaceId === cafe) : []
    return NextResponse.json({ deleted: id, summary: summarize(mine) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
