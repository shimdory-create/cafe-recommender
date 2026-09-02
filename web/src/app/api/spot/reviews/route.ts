import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { spotById } from '@/lib/spot-site'
import {
  addVisit, applyReviewPatch, parseReviewInput, removeReview, sortByNewest, summarize,
  todayInSeoul, SPOT_REVIEWS_PATH, SPOT_VISITS_PATH, type Review, type VisitRow,
} from '@/lib/reviews'

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

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  const spot = new URL(req.url).searchParams.get('spot')
  if (!store.enabled) {
    return NextResponse.json({
      reviews: [], summary: { count: 0, average: 0 }, enabled: false, writable: false, ok: false,
    })
  }
  try {
    const rows = await store.read<Review>(SPOT_REVIEWS_PATH)
    const mine = spot ? rows.filter((r) => r.kakaoPlaceId === spot) : rows
    return NextResponse.json({
      reviews: sortByNewest(mine), summary: summarize(mine),
      enabled: store.enabled, writable: writeOk, ok: true,
    })
  } catch (e) {
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
  if (!spotById(parsed.review.kakaoPlaceId)) {
    return NextResponse.json({ error: '목록에 없는 장소입니다' }, { status: 400 })
  }

  try {
    const rows = await store.update<Review>(
      SPOT_REVIEWS_PATH,
      `data: 후기 (${parsed.review.nickname || '가족'})`,
      (prev) => [...prev, parsed.review],
    )
    const mine = rows.filter((r) => r.kakaoPlaceId === parsed.review.kakaoPlaceId)

    let visitedOn: string | null = null
    try {
      const visits = await store.read<VisitRow>(SPOT_VISITS_PATH)
      if (!visits.some((v) => v.kakaoPlaceId === parsed.review.kakaoPlaceId)) {
        visitedOn = todayInSeoul()
        await store.update<VisitRow>(
          SPOT_VISITS_PATH,
          `data: 별점과 함께 다녀왔어요 ${visitedOn}`,
          (prev) => addVisit(prev, parsed.review.kakaoPlaceId, visitedOn!),
        )
      } else {
        visitedOn = visits.find((v) => v.kakaoPlaceId === parsed.review.kakaoPlaceId)!.visitedOn
      }
    } catch {
      // 별점은 이미 저장됐다
    }

    return NextResponse.json({ review: parsed.review, summary: summarize(mine), visitedOn })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}

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
      SPOT_REVIEWS_PATH,
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

export async function DELETE(req: Request) {
  const { store, deny } = await writable(req)
  if (deny) return deny

  let id = ''
  let spot = ''
  try {
    const body = (await req.json()) as { id?: unknown; kakaoPlaceId?: unknown }
    id = typeof body.id === 'string' ? body.id.trim() : ''
    spot = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: '어떤 후기인지 알 수 없습니다' }, { status: 400 })

  try {
    const rows = await store.update<Review>(
      SPOT_REVIEWS_PATH,
      'data: 후기 삭제',
      (prev) => removeReview(prev, id),
    )
    const mine = spot ? rows.filter((r) => r.kakaoPlaceId === spot) : []
    return NextResponse.json({ deleted: id, summary: summarize(mine) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
