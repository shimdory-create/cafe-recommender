export interface Review {
  id: string
  kakaoPlaceId: string
  rating: number
  nickname: string
  comment: string
  createdAt: string
  /** 고친 적이 있으면 그 시각. 없으면 한 번도 안 고친 것 */
  updatedAt?: string
}

export interface VisitRow {
  kakaoPlaceId: string
  visitedOn: string
  note?: string
}

export const REVIEWS_PATH = 'data/reviews.json'
export const VISITS_PATH = 'data/visits.json'

export const MAX_NICKNAME = 20
export const MAX_COMMENT = 100

export interface ReviewInput {
  kakaoPlaceId: unknown
  rating: unknown
  nickname?: unknown
  comment?: unknown
}

/**
 * 들어온 값을 검사한다.
 *
 * zod 를 쓰지 않는 이유: 필드가 4개다. 웹 쪽에 의존성을 하나 더 넣는 값이
 * 없다. 파이프라인 쪽(`src/schema.ts`)은 읽을 때 zod 로 검증하므로,
 * 여기서 통과한 것이 저장소 스키마를 깨뜨릴 수는 없다.
 */
export function parseReviewInput(
  body: ReviewInput,
  now: Date,
): { ok: true; review: Review } | { ok: false; error: string } {
  const id = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
  if (!id) return { ok: false, error: '카페를 알 수 없습니다' }

  // 반개 단위 (0.5, 1, 1.5 ... 5). x2 가 정수인지로 검사한다
  const rating = Number(body.rating)
  if (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || rating * 2 !== Math.round(rating * 2)) {
    return { ok: false, error: '별점은 0.5~5 사이 반개 단위여야 합니다' }
  }

  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : ''
  if (nickname.length > MAX_NICKNAME) {
    return { ok: false, error: `별명은 ${MAX_NICKNAME}자까지예요` }
  }

  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (comment.length > MAX_COMMENT) {
    return { ok: false, error: `후기는 ${MAX_COMMENT}자까지예요` }
  }

  return {
    ok: true,
    review: {
      // 같은 사람이 두 번 눌러도 서로 다른 후기가 되도록 시각 + 난수
      id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kakaoPlaceId: id,
      rating,
      nickname,
      comment,
      createdAt: now.toISOString(),
    },
  }
}

export interface RatingSummary {
  count: number
  average: number
}

/** 별점 단계 — 반개까지. 0.5 부터 5.0 까지 10단계 */
export const RATING_STEPS = Array.from({ length: 10 }, (_, i) => (i + 1) / 2)

/** 카페별 별점 요약. 0건이면 average 0 */
export function summarize(reviews: Review[]): RatingSummary {
  if (reviews.length === 0) return { count: 0, average: 0 }
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
  return { count: reviews.length, average: Number((sum / reviews.length).toFixed(1)) }
}

/** 최근 후기부터 */
export function sortByNewest(reviews: Review[]): Review[] {
  return [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** 방문 기록 추가. 같은 날 두 번 눌러도 한 건이다 */
export function addVisit(rows: VisitRow[], kakaoPlaceId: string, visitedOn: string): VisitRow[] {
  if (rows.some((v) => v.kakaoPlaceId === kakaoPlaceId && v.visitedOn === visitedOn)) return rows
  return [...rows, { kakaoPlaceId, visitedOn }]
}

/**
 * 방문 기록 취소. **가장 최근 1건만** 지운다.
 *
 * 전부 지우면 작년에 갔던 기록까지 사라진다. 잘못 누른 것을 되돌리는 것이
 * 목적이므로 마지막 것만 지우는 것이 맞다.
 *
 * 날짜를 받지 않는 이유: 취소는 "오늘 누른 것" 만이 아니다. 어제 잘못 누른
 * 것도 취소해야 하고, 화면은 그 날짜를 모른다.
 */
export function removeVisit(rows: VisitRow[], kakaoPlaceId: string): VisitRow[] {
  const mine = rows
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v.kakaoPlaceId === kakaoPlaceId)
    .sort((a, b) => b.v.visitedOn.localeCompare(a.v.visitedOn))
  const target = mine[0]
  if (!target) return rows
  return rows.filter((_, i) => i !== target.i)
}

export interface ReviewPatch {
  rating: unknown
  nickname?: unknown
  comment?: unknown
}

/**
 * 남긴 별점 고치기.
 *
 * **누가 남겼는지 확인하지 않는다.** 이 페이지에는 인증이 없고, 4명이 쓰는
 * 화면에 로그인을 붙이면 아무도 쓰지 않는다 (`schema.ts` ReviewSchema 주석과
 * 같은 판단이다). 대신 화면이 별명을 보여주고 지울 때 한 번 묻는다.
 *
 * `createdAt` 은 그대로 둔다 — 언제 다녀왔는지의 단서이고, 고쳤다고 목록
 * 순서가 튀어 오르면 "새 후기가 올라왔나" 로 읽힌다.
 */
export function applyReviewPatch(
  rows: Review[],
  id: string,
  patch: ReviewPatch,
  now: Date,
): { ok: true; rows: Review[]; review: Review } | { ok: false; error: string } {
  const target = rows.find((r) => r.id === id)
  if (!target) return { ok: false, error: '없는 후기예요. 새로 고쳐보세요' }

  const parsed = parseReviewInput(
    { kakaoPlaceId: target.kakaoPlaceId, ...patch },
    now,
  )
  if (!parsed.ok) return parsed

  const review: Review = {
    ...target,
    rating: parsed.review.rating,
    nickname: parsed.review.nickname,
    comment: parsed.review.comment,
    updatedAt: now.toISOString(),
  }
  return { ok: true, rows: rows.map((r) => (r.id === id ? review : r)), review }
}

/** 후기 지우기. 없는 id 면 아무것도 하지 않는다 (두 번 눌러도 안전하다) */
export function removeReview(rows: Review[], id: string): Review[] {
  return rows.filter((r) => r.id !== id)
}

export function todayInSeoul(now = new Date()): string {
  // 서버가 UTC 로 돌아도 한국 날짜로 기록해야 한다 (밤 10시에 누르면
  // UTC 로는 어제다)
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
