export interface Review {
  id: string
  kakaoPlaceId: string
  rating: number
  nickname: string
  comment: string
  createdAt: string
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

/**
 * 방문 기록 토글.
 *
 * 같은 날 같은 카페를 두 번 누르면 취소로 본다 — 잘못 눌렀을 때 되돌릴
 * 길이 없으면 사람은 누르기를 망설인다.
 */
export function toggleVisit(rows: VisitRow[], kakaoPlaceId: string, visitedOn: string): VisitRow[] {
  const exists = rows.some((v) => v.kakaoPlaceId === kakaoPlaceId && v.visitedOn === visitedOn)
  if (exists) {
    return rows.filter((v) => !(v.kakaoPlaceId === kakaoPlaceId && v.visitedOn === visitedOn))
  }
  return [...rows, { kakaoPlaceId, visitedOn }]
}

export function todayInSeoul(now = new Date()): string {
  // 서버가 UTC 로 돌아도 한국 날짜로 기록해야 한다 (밤 10시에 누르면
  // UTC 로는 어제다)
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
