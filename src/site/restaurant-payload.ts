import { restaurantDriveMinutesOf } from '../jobs/restaurant-drive-times.js'
import { STALE_DAYS, staleRestaurants, daysUnseen } from '../jobs/restaurant-liveness.js'
import { excludeVisited } from '../pipeline/maybe-closed.js'
import { zoneOf } from '../config/zones.js'
import { areaOf } from '../config/area.js'
import { isNewCafe } from '../config/newness.js'
import { isRevisitReady, REVISIT_DAYS } from '../pipeline/revisit.js'
import { REGIONS } from '../config/regions.js'
import { naverMapLink } from '../pipeline/place-query.js'
import { restaurantFamilyFit } from '../pipeline/restaurant-score.js'
import { finalScore, hotScore } from '../pipeline/score.js'
import { passesGate } from '../pipeline/gate.js'
import {
  RestaurantSitePayloadSchema,
  type Restaurant, type SiteRestaurant, type SiteRestaurantVisited, type RestaurantSitePayload,
} from '../restaurant-schema.js'
import type { BuzzSnapshot, Suggestion, Visit, Review } from '../schema.js'

export interface RestaurantPayloadInput {
  restaurants: Restaurant[]
  buzz: BuzzSnapshot[]
  visits: Visit[]
  reviews?: Review[]
  suggestions: Suggestion[]
  weekOf: string
  now: Date
  /** usage-watch.ts에서 미리 계산한 한 줄. 카페/가볼곳 페이로드도 같은 값을 받는다 */
  pipelineStatus: string
}

const COMPARABLE_SPAN_DAYS = 90
const REVIEWS_IN_PAYLOAD = 10
const WEEK_SIZE = 10

/** 카페의 trendOf와 동일한 로직 — 50건 창 포화 문제(발견 E)가 식당에도 그대로 적용된다 */
export function restaurantTrendOf(
  b: { posts30d: number; postsPrev: number; spanDays: number },
): 'rising' | 'steady' | 'unknown' {
  if (b.spanDays < COMPARABLE_SPAN_DAYS || b.postsPrev === 0) return 'unknown'
  const baseline = b.postsPrev / 2
  return b.posts30d >= baseline * 1.5 ? 'rising' : 'steady'
}

/** 카페의 dedupeListings와 동일한 로직(이름+시군구 키, 도로명 주소 있는 쪽 우선) */
export function dedupeRestaurantListings(
  rows: SiteRestaurant[],
  byId: Map<string, Restaurant>,
): SiteRestaurant[] {
  const best = new Map<string, SiteRestaurant>()
  for (const r of rows) {
    const key = `${r.name}|${r.sigungu}`
    const prev = best.get(key)
    if (!prev) {
      best.set(key, r)
      continue
    }
    if (betterListing(r, prev, byId)) best.set(key, r)
  }
  const keep = new Set([...best.values()].map((r) => r.id))
  return rows.filter((r) => keep.has(r.id))
}

function betterListing(a: SiteRestaurant, b: SiteRestaurant, byId: Map<string, Restaurant>): boolean {
  const addr = (r: SiteRestaurant) => Boolean(byId.get(r.id)?.roadAddress)
  if (addr(a) !== addr(b)) return addr(a)
  if (a.finalScore !== b.finalScore) return a.finalScore > b.finalScore
  return a.id.localeCompare(b.id) < 0
}

/** 카페의 pickWeek와 동일한 로직 (weekOf 정확 일치 실패 시 최신으로 대체) */
function pickRestaurantWeek(
  suggestions: Suggestion[],
  weekOf: string,
  ids: Set<string>,
  opts: { lastVisit?: Map<string, string>; now?: Date; size?: number } = {},
): { rank: number; id: string; finalScore: number }[] {
  const usable = suggestions.filter((s) => s.weekOf <= weekOf && ids.has(s.kakaoPlaceId))
  if (usable.length === 0) return []
  const latest = usable.reduce((m, s) => (s.weekOf > m ? s.weekOf : m), '')
  const { lastVisit, now = new Date(), size = WEEK_SIZE } = opts
  return usable
    .filter((s) => s.weekOf === latest)
    .filter((s) => isRevisitReady(lastVisit?.get(s.kakaoPlaceId) ?? null, now))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, size)
    .map((s, i) => ({ rank: i + 1, id: s.kakaoPlaceId, finalScore: s.finalScore }))
}

export function buildRestaurantSitePayload(input: RestaurantPayloadInput): RestaurantSitePayload {
  const { restaurants, buzz, visits, suggestions, weekOf, now, reviews = [], pipelineStatus } = input

  const rated = new Map<string, { sum: number; n: number }>()
  for (const r of reviews) {
    const cur = rated.get(r.kakaoPlaceId) ?? { sum: 0, n: 0 }
    rated.set(r.kakaoPlaceId, { sum: cur.sum + r.rating, n: cur.n + 1 })
  }
  const byRestaurantReviews = new Map<string, SiteRestaurant['familyReviews']>()
  for (const r of [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const list = byRestaurantReviews.get(r.kakaoPlaceId) ?? []
    if (list.length >= REVIEWS_IN_PAYLOAD) continue
    list.push({ nickname: r.nickname, rating: r.rating, comment: r.comment, createdAt: r.createdAt })
    byRestaurantReviews.set(r.kakaoPlaceId, list)
  }

  const latestBuzz = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latestBuzz.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latestBuzz.set(b.kakaoPlaceId, b)
  }
  const lastVisit = new Map<string, string>()
  for (const v of visits) {
    const prev = lastVisit.get(v.kakaoPlaceId)
    if (!prev || v.visitedOn > prev) lastVisit.set(v.kakaoPlaceId, v.visitedOn)
  }

  const rows: SiteRestaurant[] = []
  for (const r of restaurants) {
    if (r.status !== 'active') continue
    const a = r.attributes
    if (!a) continue
    if (!passesGate({ tags: r.tags, parkingGrade: a.parkingGrade }, { cityMode: true }).pass) continue
    const b = latestBuzz.get(r.kakaoPlaceId)
    if (!b) continue

    const hot = hotScore(b, now)
    const fit = restaurantFamilyFit(
      {
        driveMinutes: restaurantDriveMinutesOf(r) ?? 90,
        parkingGrade: a.parkingGrade,
        hasRoom: a.hasRoom,
        reservable: a.reservable,
        lastVisitedOn: lastVisit.get(r.kakaoPlaceId) ?? null,
        outdoorOnly: false,
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    rows.push({
      id: r.kakaoPlaceId,
      lat: r.lat,
      lng: r.lng,
      name: r.name,
      sigungu: r.sigungu,
      zone: zoneOf(r),
      area: areaOf({ ...r, zone: zoneOf(r) }),
      driveMinutes: restaurantDriveMinutesOf(r),
      cuisineType: a.cuisineType,
      hasRoom: a.hasRoom,
      reservable: a.reservable,
      parkingGrade: a.parkingGrade,
      tags: r.tags,
      evidence: a.evidence,
      parkingEvidence: a.parkingEvidence,
      viewTypes: a.viewTypes ?? [],
      outdoorSeating: a.outdoorSeating ?? null,
      teenAppeal: a.teenAppeal ?? null,
      naverMapUrl: naverMapLink(r),
      kakaoPlaceUrl: r.kakaoPlaceUrl ?? null,
      imageUrl: r.imageUrl ?? null,
      hotScore: Number(hot.toFixed(1)),
      // 소수 1자리 — 이유는 src/site/payload.ts의 같은 줄 참고 (git 커밋 용량).
      finalScore: Number(finalScore(hot, fit).toFixed(1)),
      postsPer30: b.postsPer30,
      posts30: b.posts30d,
      posts90: b.posts30d + b.postsPrev,
      acceleration: b.acceleration,
      trend: restaurantTrendOf(b),
      ratingAvg: Number(((rated.get(r.kakaoPlaceId)?.sum ?? 0)
        / (rated.get(r.kakaoPlaceId)?.n || 1)).toFixed(1)),
      ratingCount: rated.get(r.kakaoPlaceId)?.n ?? 0,
      familyReviews: byRestaurantReviews.get(r.kakaoPlaceId) ?? [],
      cityOnly: a.parkingGrade === 'C',
      visitedOn: lastVisit.get(r.kakaoPlaceId) ?? null,
      firstSeenAt: r.firstSeenAt,
      isNew: isNewCafe(r.firstSeenAt, now),
      lastSeenAt: r.lastSeenAt ?? null,
    })
  }

  rows.sort((x, y) => y.finalScore - x.finalScore || x.id.localeCompare(y.id))

  const byId = new Map(restaurants.map((r) => [r.kakaoPlaceId, r]))
  const deduped = dedupeRestaurantListings(rows, byId)

  const visited: SiteRestaurantVisited[] = [...lastVisit.entries()]
    .flatMap(([id, on]) => {
      const r = byId.get(id)
      if (!r) return []
      const note = visits.find((v) => v.kakaoPlaceId === id && v.visitedOn === on)?.note ?? ''
      const rt = rated.get(id)
      return [{
        id, name: r.name, sigungu: r.sigungu, area: areaOf({ ...r, zone: zoneOf(r) }),
        visitedOn: on, note, tags: r.tags,
        naverMapUrl: naverMapLink(r), imageUrl: r.imageUrl ?? null,
        ratingAvg: Number(((rt?.sum ?? 0) / (rt?.n || 1)).toFixed(1)),
        ratingCount: rt?.n ?? 0,
      }]
    })
    .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))

  const ids = new Set(deduped.map((r) => r.id))
  const week = pickRestaurantWeek(suggestions, weekOf, ids, { lastVisit, now })

  const maybeClosed = excludeVisited(staleRestaurants(restaurants, now), visits).map((r) => ({
    id: r.kakaoPlaceId,
    name: r.name,
    sigungu: r.sigungu,
    days: daysUnseen(r, now) ?? 0,
    naverMapUrl: naverMapLink(r),
  }))

  return RestaurantSitePayloadSchema.parse({
    generatedAt: now.toISOString(),
    weekOf,
    pipelineStatus,
    week,
    restaurants: deduped,
    visited,
    maybeClosed,
    stats: {
      discovered: restaurants.length,
      passed: deduped.filter((r) => !r.cityOnly).length,
      regions: new Set(deduped.map((r) => r.sigungu)).size,
      scannedRegions: REGIONS.filter((r) => !r.excluded).length,
      driveMeasured: deduped.filter((r) => byId.get(r.id)?.driveMinutes != null).length,
      revisitDays: REVISIT_DAYS,
      cityOnly: deduped.filter((r) => r.cityOnly).length,
      staleDays: STALE_DAYS,
    },
  })
}
