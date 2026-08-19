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
  driveMinutesEst: z.number().int().nullable().optional(),
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
