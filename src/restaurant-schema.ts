import { z } from 'zod'
import { HealthSchema, BlacklistEntrySchema } from './schema.js'

export { HealthSchema, BlacklistEntrySchema }
export type { Health, BlacklistEntry } from './schema.js'

/** 음식 종류. 여기서 늘리지 않는다 — 카페 성격 태그와 같은 이유(스펙 참고) */
export const CUISINE_TYPES = ['한식', '일식', '중식', '양식', '분식', '고기구이'] as const
export type CuisineType = (typeof CUISINE_TYPES)[number]

export const RestaurantAttributesSchema = z.object({
  /** 모르면 null — 카페의 scale 널 규칙과 동일 */
  cuisineType: z.enum(CUISINE_TYPES).nullable(),
  evidence: z.string(),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),
  parkingEvidence: z.string(),
  /** 룸·개별공간 여부 (부모님 모시고 가는 경우 대비) */
  hasRoom: z.boolean().nullable(),
  /** 예약 가능 여부 — 웨이팅 회피 신호 */
  reservable: z.boolean().nullable(),
  viewStrength: z.number().int().min(0).max(5),
  viewTypes: z.array(z.string()),
  outdoorSeating: z.boolean().nullable(),
  teenAppeal: z.number().min(0).max(5).nullable(),
  confidence: z.number().min(0).max(1),
  extractedAt: z.string(),
  modelVersion: z.string().min(1),
})
export type RestaurantAttributes = z.infer<typeof RestaurantAttributesSchema>

export const RestaurantSchema = z.object({
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
  driveMinutes: z.number().int().nullable().optional(),
  driveKm: z.number().nullable().optional(),
  tollWon: z.number().int().nullable().optional(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string().optional(),
  status: z.enum(['active', 'hidden', 'excluded_auto', 'pending_extraction']),
  excludeReason: z.string().nullable().optional(),
  ambiguousName: z.boolean().default(false),
  imageUrl: z.string().nullable().optional(),
  attributes: RestaurantAttributesSchema.nullable().optional(),
  /** Layer 4 태그. cuisineType 이 null 이면 빈 배열 — 카페의 "태그 0개 배제"와 같은 게이트를 그대로 쓴다 */
  tags: z.array(z.string()).default([]),
})
export type Restaurant = z.infer<typeof RestaurantSchema>

/** 2단계 웹 표시용 간소화된 스키마 — 지금은 타입만 정의해 둔다 */
export const SiteRestaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  sigungu: z.string(),
  cuisineType: z.enum(CUISINE_TYPES).nullable(),
  hasRoom: z.boolean().nullable(),
  reservable: z.boolean().nullable(),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),
  naverMapUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  tags: z.array(z.string()),
})
export type SiteRestaurant = z.infer<typeof SiteRestaurantSchema>
