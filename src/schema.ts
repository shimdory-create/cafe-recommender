import { z } from 'zod'

/**
 * zod 스키마가 타입과 런타임 검증의 단일 진실 원천이다 (스펙 v3 9절).
 * SQL DDL 과 TypeScript 타입을 따로 관리하며 어긋나는 문제가 없다.
 * 읽을 때마다 parse 하므로 손으로 편집한 JSON 이 깨져도 즉시 잡힌다.
 */

export const CafeAttributesSchema = z.object({
  scale: z.enum(['대형', '중형', '소형']).nullable().optional(),
  seatsEstimate: z.number().int().nullable().optional(),
  floors: z.number().int().nullable().optional(),

  hasBakery: z.boolean().nullable().optional(),
  breadBakedOnsite: z.boolean().nullable().optional(),
  bakerySignal: z.string().nullable().optional(),

  menuLevel: z.number().int().min(1).max(3),
  mealTypes: z.array(z.string()).default([]),
  signatureMenu: z.string().nullable().optional(),

  viewStrength: z.number().int().min(0).max(5),
  viewTypes: z.array(z.string()).default([]),
  outdoorSeating: z.boolean().nullable().optional(),

  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),
  parkingEvidence: z.string().default(''),

  photoSpot: z.number().int().min(0).max(5).nullable().optional(),
  teenAppeal: z.number().int().min(0).max(5).nullable().optional(),
  stayDuration: z.string().nullable().optional(),

  confidence: z.number().min(0).max(1).nullable().optional(),

  // 인용 없는 LLM 출력을 스키마 수준에서 막는다 (스펙 Layer 3).
  // 근거를 못 대는 출력은 환각이다.
  evidence: z.string().min(1, 'evidence 인용은 필수다'),

  extractedAt: z.string(),
  // 프롬프트 개선 시 재처리 대상을 식별하는 근거
  modelVersion: z.string().min(1),
})
export type CafeAttributes = z.infer<typeof CafeAttributesSchema>

export const CafeSchema = z.object({
  // 정규화 기준키. 상호명은 표기가 흔들리므로 기준키로 쓰지 않는다.
  kakaoPlaceId: z.string().min(1),
  name: z.string().min(1),
  sigungu: z.string().min(1),
  roadAddress: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  lat: z.number(),
  lng: z.number(),
  categoryName: z.string().nullable().optional(),
  kakaoPlaceUrl: z.string().nullable().optional(),
  naverMapUrl: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  straightKm: z.number().nullable().optional(),
  /** 직선거리 x 1.35 근사. 강화·파주를 과소, 양평·가평을 과대 추정한다 */
  driveMinutesEst: z.number().int().nullable().optional(),
  /** 카카오 자동차 길찾기 실측. 있으면 이 값을 쓴다 (카페는 움직이지 않는다) */
  driveMinutes: z.number().int().nullable().optional(),
  driveKm: z.number().nullable().optional(),
  tollWon: z.number().int().nullable().optional(),
  firstSeenAt: z.string(),
  /**
   * 카카오 장소 검색에서 **마지막으로 확인된** 시각.
   *
   * 발굴 잡은 새 카페만 넣고 사라진 카페는 보지 않는다. 그래서 폐업해도
   * 목록에 영원히 남는다 — 한 시간 운전해서 닫힌 문 앞에 서는 경로다.
   * `npm run liveness` 가 주 1회 다시 찾아보고 이 값을 갱신한다.
   */
  lastSeenAt: z.string().optional(),
  status: z.enum(['active', 'hidden', 'excluded_auto', 'pending_extraction']),
  excludeReason: z.string().nullable().optional(),
  /** 일반명사 상호. 골든셋 경계 구간으로 강제 편입된다 (스펙 Layer 2) */
  ambiguousName: z.boolean().default(false),
  /** 대표 이미지 (카카오 블로그 썸네일 130x130). 매일 갱신되므로 깨지면 회복된다 */
  imageUrl: z.string().nullable().optional(),
  attributes: CafeAttributesSchema.nullable(),
  tags: z.array(z.string()).default([]),
})
export type Cafe = z.infer<typeof CafeSchema>

export const BuzzSnapshotSchema = z.object({
  kakaoPlaceId: z.string(),
  capturedAt: z.string(), // YYYY-MM-DD
  receivedCount: z.number().int(),
  relevantCount: z.number().int(),
  precision: z.number().min(0).max(1),
  spanDays: z.number(),
  postsPer30: z.number(),
  posts30d: z.number(),
  postsPrev: z.number(),
  firstPostDate: z.string().nullable(),
  latestPostDate: z.string().nullable(),
  acceleration: z.number(),
  /** 발행률 과다 — 일반명사 오염 의심 */
  suspectAmbiguous: z.boolean().default(false),
})
export type BuzzSnapshot = z.infer<typeof BuzzSnapshotSchema>

export const VisitSchema = z.object({
  kakaoPlaceId: z.string(),
  visitedOn: z.string(), // YYYY-MM-DD
  /** 그날 어땠는지 한 줄. 아빠가 CLI 로 남기는 메모 */
  note: z.string().optional(),
})
export type Visit = z.infer<typeof VisitSchema>

/**
 * 다녀온 뒤 남기는 별점·후기.
 *
 * 링크로 들어온 사람 누구나 남길 수 있다 — 즉 **가족 구성원을 식별하지
 * 않는다.** 별명만 받는다. 4명이 쓰는 페이지에 인증을 붙이면 아무도
 * 쓰지 않는다.
 *
 * v3 의 "쓰기 엔드포인트 0개" 원칙을 되돌리는 유일한 기능이다. 대신
 * 쓰기 대상을 이 스키마 하나로 좁혀 공격 표면을 최소화한다.
 */
export const ReviewSchema = z.object({
  id: z.string().min(1),
  kakaoPlaceId: z.string().min(1),
  /** 0.5~5.0, 반개 단위. 별 5개에 반개까지 */
  rating: z.number().min(0.5).max(5).refine((v) => v * 2 === Math.round(v * 2), {
    message: '별점은 반개 단위여야 한다',
  }),
  /** 별명. 비어 있으면 "가족" 으로 표시한다 */
  nickname: z.string().max(20).default(''),
  /** 아주 짧은 한 줄. 길게 쓰라고 하면 아무도 쓰지 않는다 */
  comment: z.string().max(100).default(''),
  createdAt: z.string(),
  /** 고친 적이 있으면 그 시각. 고쳐도 createdAt 은 그대로 둔다 */
  updatedAt: z.string().optional(),
})
export type Review = z.infer<typeof ReviewSchema>

export const SuggestionSchema = z.object({
  weekOf: z.string(),
  kakaoPlaceId: z.string(),
  rank: z.number().int().min(1),
  finalScore: z.number(),
  reason: z.record(z.string(), z.unknown()).default({}),
})
export type Suggestion = z.infer<typeof SuggestionSchema>

export const GoldenLabelSchema = z.object({
  kakaoPlaceId: z.string(),
  verdict: z.enum(['O', 'X', 'UNKNOWN']),
  rejectReason: z
    .enum(['neighborhood', 'parking', 'too_small', 'too_far', 'taste'])
    .nullable()
    .optional(),
  stratum: z.enum(['top', 'mid', 'boundary', 'rejected']),
  modelVersion: z.string(),
  labeledAt: z.string(),
})
export type GoldenLabel = z.infer<typeof GoldenLabelSchema>

/**
 * 카카오톡 발송 기록.
 *
 * 발송은 이 PC 의 커넥터로 나가므로 클라우드는 그것이 나갔는지 알 수 없다.
 * 한 줄을 남겨 커밋하면 **감시가 "지난주에 안 나갔다" 를 잡을 수 있다** —
 * 조용한 누락이 실제로 있었다 (2026-08-21 정오, 예약 세션이 승인 대기로 멈춤).
 */
export const NotifyLogSchema = z.object({
  sentAt: z.string(),
  /** 문구 길이. 200자 제한을 넘겼는지 나중에 볼 수 있다 */
  chars: z.number().int().nonnegative(),
  /** 그때의 자동수집 상태 한 줄 */
  status: z.string(),
})
export type NotifyLog = z.infer<typeof NotifyLogSchema>

export const HealthSchema = z.object({
  source: z.string(),
  lastSuccessAt: z.string().nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: z.number().int().default(0),
  updatedAt: z.string(),
})
export type Health = z.infer<typeof HealthSchema>

/** 코드가 아니라 데이터다. 신규 프랜차이즈가 생겨도 배포가 필요 없다. */
export const BlacklistEntrySchema = z.object({
  pattern: z.string().min(1),
  matchType: z.enum(['contains', 'exact', 'regex']).default('contains'),
  note: z.string().optional(),
})
export type BlacklistEntry = z.infer<typeof BlacklistEntrySchema>

/**
 * 웹앱이 읽는 표시용 페이로드 (계획 3 Task 1).
 *
 * 웹앱은 `data/*.json` 6,216곳을 직접 읽지 않는다. 파이프라인이 통과분만
 * 골라 이 모양으로 만들어 주고, 웹앱은 이 스키마로 검증해 쓴다. 점수·게이트
 * 로직이 두 곳에 생기는 것을 막고, 4.7MB 를 모바일로 내려보내지 않는다.
 */
/**
 * 빌드 시점의 가족 후기 (카페당 최대 10건, 최근순).
 *
 * 화면은 평소 실시간 API 로 읽는다. 이것을 페이로드에도 싣는 이유는
 * **열람 전용 배포** 때문이다 (스펙 10.15) — 거기에는 GitHub 토큰을 주지
 * 않을 수 있고, 그러면 별점이 통째로 빈 화면이 된다. 하루 낡은 후기가
 * 아무것도 없는 것보다 낫다.
 *
 * 실시간 읽기가 성공하면 그 값이 이것을 덮는다.
 */
export const SiteReviewSchema = z.object({
  nickname: z.string(),
  rating: z.number(),
  comment: z.string(),
  createdAt: z.string(),
})
export type SiteReview = z.infer<typeof SiteReviewSchema>

export const SiteCafeSchema = z.object({
  id: z.string(),
  name: z.string(),
  sigungu: z.string(),
  /** 방향 구획 (집 기준). 감사 규칙이 시도 정합성을 볼 때 쓴다 */
  zone: z.enum(['near', 'seoul', 'north', 'east', 'south', 'west']),
  /** 시 단위 묶음 키. 전체 리스트의 지역 칩 (서울·인천은 하나로) */
  area: z.string(),
  driveMinutes: z.number().int().nullable(),

  // 카드 상단 고정 3종 (스펙 10절 v3.1)
  scale: z.enum(['대형', '중형', '소형']).nullable(),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),
  menuLevel: z.number().int().min(1).max(3),

  tags: z.array(z.string()),
  /** 판단 근거 인용. 없으면 신뢰가 생기지 않는다 */
  evidence: z.string(),
  parkingEvidence: z.string(),
  signatureMenu: z.string().nullable(),
  viewTypes: z.array(z.string()),
  mealTypes: z.array(z.string()),
  outdoorSeating: z.boolean().nullable(),
  teenAppeal: z.number().int().nullable(),
  stayDuration: z.string().nullable(),

  naverMapUrl: z.string(),
  kakaoPlaceUrl: z.string().nullable(),
  /** 대표 이미지 (130x130 정사각). 없으면 null */
  imageUrl: z.string().nullable(),

  hotScore: z.number(),
  /** 화제도 x 가족 적합도. 홈 피드 정렬 기준 */
  finalScore: z.number(),
  /**
   * 화제량 산출용 **추정 발행률** (`글수 x 30 / 관측기간`). 점수에만 쓴다.
   *
   * 화면에 그대로 쓰면 안 된다 — 50건 창이 이틀에 다 차면 `월 599건` 이
   * 나오는데 같은 카페의 90일 실측이 46건이다. 한 줄에 나란히 놓으면 서로를
   * 부정한다. 화면에는 `posts30`·`posts90` 실측을 쓴다.
   */
  postsPer30: z.number(),
  /** 최근 30일 블로그 글 수 (검증 통과분, 실측) */
  posts30: z.number().int(),
  /**
   * 최근 90일 블로그 글 수 (검증 통과분).
   *
   * "네이버 리뷰수" 자리에 놓는 값이다. 네이버·카카오 어느 공식 API 도
   * 리뷰수를 주지 않아 대신 우리가 직접 센 것을 쓴다 — 총합(total_count)이
   * 아니라 **상호 일치를 검증한 글만** 센 수다.
   */
  posts90: z.number().int(),
  acceleration: z.number(),
  /**
   * 화제 추이. 가속도 숫자를 그대로 보여주지 않는 이유는 그 값이
   * 17.67 에서 포화되기 때문이다 — 50건 창이 최근 30일 안에 다 들어차면
   * 이전 기간이 0이 되어 비교가 성립하지 않는다 (발견 E).
   *   rising  이전 기간과 비교해 실제로 늘었다
   *   steady  비슷하다
   *   unknown 창이 잘려 비교할 수 없다. 늘었다고 말하지 않는다
   */
  trend: z.enum(['rising', 'steady', 'unknown']),
  /** 가족 별점 (없으면 0). 카드에 붙이는 우리 집 신호 */
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  /** 빌드 시점 후기. 실시간 읽기가 되면 덮인다 */
  familyReviews: z.array(SiteReviewSchema),
  /** 주차 C — 도심 모드에서만 노출한다 (스펙 7.3) */
  cityOnly: z.boolean(),
  visitedOn: z.string().nullable(),
  /** 우리 목록에 처음 들어온 시각. NEW 정렬 기준 */
  firstSeenAt: z.string(),
  /** 최초 대량 수집 이후 30일 안에 들어온 곳 (src/config/newness.ts) */
  isNew: z.boolean(),
})
export type SiteCafe = z.infer<typeof SiteCafeSchema>

/**
 * 다녀온 곳. 게이트 통과 여부와 무관하게 싣는다 — 한 번 다녀온 곳이
 * 목록에서 빠졌다고 기록까지 사라지면 안 된다.
 */
export const SiteVisitedSchema = z.object({
  id: z.string(),
  name: z.string(),
  sigungu: z.string(),
  /** 시 단위 묶음 키. 다녀온 곳 탭도 같은 지역 칩을 쓴다 */
  area: z.string(),
  visitedOn: z.string(),
  note: z.string(),
  tags: z.array(z.string()),
  scale: z.enum(['대형', '중형', '소형']).nullable(),
  naverMapUrl: z.string(),
  imageUrl: z.string().nullable(),
  /** 가족 별점 요약 (빌드 시점). 화면은 실시간 값으로 덮어쓴다 */
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
})
export type SiteVisited = z.infer<typeof SiteVisitedSchema>

export const SitePayloadSchema = z.object({
  generatedAt: z.string(),
  weekOf: z.string(),
  week: z.array(z.object({
    rank: z.number().int(),
    id: z.string(),
    finalScore: z.number(),
  })),
  cafes: z.array(SiteCafeSchema),
  visited: z.array(SiteVisitedSchema),
  stats: z.object({
    discovered: z.number().int(),
    passed: z.number().int(),
    /** 표시 카페가 있는 시군구 수 */
    regions: z.number().int(),
    /** 훑고 있는 시군구 수. 화면 문구가 지역 개편을 못 따라가는 것을 막는다 */
    scannedRegions: z.number().int(),
    /** 실제 길찾기로 이동시간을 잰 카페 수 (나머지는 직선거리 근사) */
    driveMeasured: z.number().int(),
    /** 다녀온 곳을 추천에서 내리는 기간(일). 웹이 이 값을 그대로 쓴다 */
    revisitDays: z.number().int(),
    cityOnly: z.number().int(),
  }),
})
export type SitePayload = z.infer<typeof SitePayloadSchema>
