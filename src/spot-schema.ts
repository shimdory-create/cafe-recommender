import { z } from 'zod'
import { HealthSchema } from './schema.js'

export { HealthSchema }
export type { Health } from './schema.js'

/** 가볼 곳 성격 태그. 카페 성격 태그와 같은 이유로 여기서 늘리지 않는다(스펙 참고) */
export const SPOT_TAGS = [
  '자연/공원', '관광지/명소', '시장/전통거리', '쇼핑/아울렛', '전시/박물관',
  '소품샵/편집숍', '드라이브', '체험', '계절명소', '아이와 가기 좋은 곳',
] as const
export type SpotTag = (typeof SPOT_TAGS)[number]

export const SpotAttributesSchema = z.object({
  /** 다중 선택 — 카페 성격 태그와 같은 방식. 하나도 못 고르면 빈 배열 */
  tags: z.array(z.enum(SPOT_TAGS)),
  evidence: z.string(),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),
  parkingEvidence: z.string(),
  /** 자유 문구, 예: "1~2시간". 카페의 stayDuration 필드와 같은 형태 */
  stayDuration: z.string().nullable(),
  indoorOutdoor: z.enum(['indoor', 'outdoor', 'mixed']).nullable(),
  season: z.enum(['봄', '여름', '가을', '겨울', '사계절']).nullable(),
  teenAppeal: z.number().min(0).max(5).nullable(),
  confidence: z.number().min(0).max(1),
  extractedAt: z.string(),
  modelVersion: z.string().min(1),
})
export type SpotAttributes = z.infer<typeof SpotAttributesSchema>

export const SpotSchema = z.object({
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
  attributes: SpotAttributesSchema.nullable().optional(),
  /** Layer 4 태그. attributes.tags 가 빈 배열이면 여기도 빈 배열 — "태그 0개 배제" 게이트 그대로 */
  tags: z.array(z.string()),
})
export type Spot = z.infer<typeof SpotSchema>
