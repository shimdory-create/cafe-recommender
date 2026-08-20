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
  status: z.enum(['active', 'hidden', 'excluded_auto', 'pending_extraction']),
  excludeReason: z.string().nullable().optional(),
  /** 일반명사 상호. 골든셋 경계 구간으로 강제 편입된다 (스펙 Layer 2) */
  ambiguousName: z.boolean().default(false),
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

/** 서비스 전체에서 유일한 쓰기 대상. 익명 — 누가 눌렀는지 남기지 않는다. */
export const VisitSchema = z.object({
  kakaoPlaceId: z.string(),
  visitedOn: z.string(), // YYYY-MM-DD
})
export type Visit = z.infer<typeof VisitSchema>

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
export const SiteCafeSchema = z.object({
  id: z.string(),
  name: z.string(),
  sigungu: z.string(),
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

  hotScore: z.number(),
  /** 화제도 x 가족 적합도. 홈 피드 정렬 기준 */
  finalScore: z.number(),
  postsPer30: z.number(),
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
  /** 주차 C — 도심 모드에서만 노출한다 (스펙 7.3) */
  cityOnly: z.boolean(),
  visitedOn: z.string().nullable(),
})
export type SiteCafe = z.infer<typeof SiteCafeSchema>

export const SitePayloadSchema = z.object({
  generatedAt: z.string(),
  weekOf: z.string(),
  week: z.array(z.object({
    rank: z.number().int(),
    id: z.string(),
    finalScore: z.number(),
  })),
  cafes: z.array(SiteCafeSchema),
  stats: z.object({
    discovered: z.number().int(),
    passed: z.number().int(),
    regions: z.number().int(),
    cityOnly: z.number().int(),
  }),
})
export type SitePayload = z.infer<typeof SitePayloadSchema>
