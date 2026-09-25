import { z } from 'zod'
import { HealthSchema, BlacklistEntrySchema, SiteReviewSchema, MaybeClosedSchema } from './schema.js'

export { HealthSchema, BlacklistEntrySchema, MaybeClosedSchema }
export type { Health, BlacklistEntry, MaybeClosed } from './schema.js'

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

/** 2단계 웹 표시용 스키마. SiteCafeSchema(src/schema.ts)와 동등한 필드를 갖는다 —
 * scale/menuLevel/mealTypes/stayDuration 자리에 cuisineType/hasRoom/reservable을 쓴다. */
export const SiteRestaurantSchema = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  name: z.string(),
  sigungu: z.string(),
  zone: z.enum(['near', 'seoul', 'north', 'east', 'south', 'west']),
  area: z.string(),
  driveMinutes: z.number().int().nullable(),

  cuisineType: z.enum(CUISINE_TYPES).nullable(),
  hasRoom: z.boolean().nullable(),
  reservable: z.boolean().nullable(),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),

  tags: z.array(z.string()),
  evidence: z.string(),
  parkingEvidence: z.string(),
  viewTypes: z.array(z.string()),
  outdoorSeating: z.boolean().nullable(),
  teenAppeal: z.number().nullable(),

  naverMapUrl: z.string(),
  kakaoPlaceUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),

  hotScore: z.number(),
  finalScore: z.number(),
  postsPer30: z.number(),
  posts30: z.number().int(),
  posts90: z.number().int(),
  acceleration: z.number(),
  trend: z.enum(['rising', 'steady', 'unknown']),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  familyReviews: z.array(SiteReviewSchema),

  cityOnly: z.boolean(),
  visitedOn: z.string().nullable(),
  firstSeenAt: z.string(),
  isNew: z.boolean(),
  lastSeenAt: z.string().nullable(),
})
export type SiteRestaurant = z.infer<typeof SiteRestaurantSchema>

export const SiteRestaurantVisitedSchema = z.object({
  id: z.string(),
  name: z.string(),
  sigungu: z.string(),
  area: z.string(),
  visitedOn: z.string(),
  note: z.string(),
  tags: z.array(z.string()),
  naverMapUrl: z.string(),
  imageUrl: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
})
export type SiteRestaurantVisited = z.infer<typeof SiteRestaurantVisitedSchema>

export const RestaurantSitePayloadSchema = z.object({
  generatedAt: z.string(),
  weekOf: z.string(),
  /** usage-watch.ts의 statusLine() 한 줄. 세 도메인 페이로드가 같은 값을 공유한다(health.json이 공용) */
  pipelineStatus: z.string(),
  week: z.array(z.object({
    rank: z.number().int(),
    id: z.string(),
    finalScore: z.number(),
  })),
  restaurants: z.array(SiteRestaurantSchema),
  visited: z.array(SiteRestaurantVisitedSchema),
  maybeClosed: z.array(MaybeClosedSchema),
  stats: z.object({
    discovered: z.number().int(),
    passed: z.number().int(),
    regions: z.number().int(),
    scannedRegions: z.number().int(),
    driveMeasured: z.number().int(),
    cityOnly: z.number().int(),
    staleDays: z.number().int(),
  }),
})
export type RestaurantSitePayload = z.infer<typeof RestaurantSitePayloadSchema>
