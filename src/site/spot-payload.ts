import { spotDriveMinutesOf } from '../jobs/spot-drive-times.js'
import { STALE_DAYS, staleSpots, daysUnseen } from '../jobs/spot-liveness.js'
import { excludeVisited } from '../pipeline/maybe-closed.js'
import { zoneOf } from '../config/zones.js'
import { areaOf } from '../config/area.js'
import { isNewCafe } from '../config/newness.js'
import { isRevisitReady, REVISIT_DAYS } from '../pipeline/revisit.js'
import { REGIONS } from '../config/regions.js'
import { naverMapLink } from '../pipeline/place-query.js'
import { spotFamilyFit } from '../pipeline/spot-score.js'
import { finalScore, hotScore } from '../pipeline/score.js'
import { passesGate } from '../pipeline/gate.js'
import {
  SpotSitePayloadSchema,
  type Spot, type SiteSpot, type SiteSpotVisited, type SpotSitePayload,
} from '../spot-schema.js'
import type { BuzzSnapshot, Suggestion, Visit, Review } from '../schema.js'

export interface SpotPayloadInput {
  spots: Spot[]
  buzz: BuzzSnapshot[]
  visits: Visit[]
  reviews?: Review[]
  suggestions: Suggestion[]
  weekOf: string
  now: Date
  /** usage-watch.ts에서 미리 계산한 한 줄. 카페/식당 페이로드도 같은 값을 받는다 */
  pipelineStatus: string
}

const COMPARABLE_SPAN_DAYS = 90
const REVIEWS_IN_PAYLOAD = 10
const WEEK_SIZE = 10
const KIDS_TAG = '아이와 가기 좋은 곳'

export function spotTrendOf(
  b: { posts30d: number; postsPrev: number; spanDays: number },
): 'rising' | 'steady' | 'unknown' {
  if (b.spanDays < COMPARABLE_SPAN_DAYS || b.postsPrev === 0) return 'unknown'
  const baseline = b.postsPrev / 2
  return b.posts30d >= baseline * 1.5 ? 'rising' : 'steady'
}

export function dedupeSpotListings(
  rows: SiteSpot[],
  byId: Map<string, Spot>,
): SiteSpot[] {
  const best = new Map<string, SiteSpot>()
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

function betterListing(a: SiteSpot, b: SiteSpot, byId: Map<string, Spot>): boolean {
  const addr = (r: SiteSpot) => Boolean(byId.get(r.id)?.roadAddress)
  if (addr(a) !== addr(b)) return addr(a)
  if (a.finalScore !== b.finalScore) return a.finalScore > b.finalScore
  return a.id.localeCompare(b.id) < 0
}

function pickSpotWeek(
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

export function buildSpotSitePayload(input: SpotPayloadInput): SpotSitePayload {
  const { spots, buzz, visits, suggestions, weekOf, now, reviews = [], pipelineStatus } = input

  const rated = new Map<string, { sum: number; n: number }>()
  for (const r of reviews) {
    const cur = rated.get(r.kakaoPlaceId) ?? { sum: 0, n: 0 }
    rated.set(r.kakaoPlaceId, { sum: cur.sum + r.rating, n: cur.n + 1 })
  }
  const bySpotReviews = new Map<string, SiteSpot['familyReviews']>()
  for (const r of [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const list = bySpotReviews.get(r.kakaoPlaceId) ?? []
    if (list.length >= REVIEWS_IN_PAYLOAD) continue
    list.push({ nickname: r.nickname, rating: r.rating, comment: r.comment, createdAt: r.createdAt })
    bySpotReviews.set(r.kakaoPlaceId, list)
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

  const rows: SiteSpot[] = []
  for (const s of spots) {
    if (s.status !== 'active') continue
    const a = s.attributes
    if (!a) continue
    if (!passesGate({ tags: s.tags, parkingGrade: a.parkingGrade }, { cityMode: true }).pass) continue
    const b = latestBuzz.get(s.kakaoPlaceId)
    if (!b) continue

    const hot = hotScore(b, now)
    const fit = spotFamilyFit(
      {
        driveMinutes: spotDriveMinutesOf(s) ?? 90,
        parkingGrade: a.parkingGrade,
        hasKidsTag: s.tags.includes(KIDS_TAG),
        lastVisitedOn: lastVisit.get(s.kakaoPlaceId) ?? null,
        outdoorOnly: a.indoorOutdoor === 'outdoor',
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    rows.push({
      id: s.kakaoPlaceId,
      lat: s.lat,
      lng: s.lng,
      name: s.name,
      sigungu: s.sigungu,
      zone: zoneOf(s),
      area: areaOf({ ...s, zone: zoneOf(s) }),
      driveMinutes: spotDriveMinutesOf(s),
      tags: s.tags,
      parkingGrade: a.parkingGrade,
      evidence: a.evidence,
      parkingEvidence: a.parkingEvidence,
      stayDuration: a.stayDuration,
      indoorOutdoor: a.indoorOutdoor,
      season: a.season,
      teenAppeal: a.teenAppeal ?? null,
      naverMapUrl: naverMapLink(s),
      kakaoPlaceUrl: s.kakaoPlaceUrl ?? null,
      imageUrl: s.imageUrl ?? null,
      hotScore: Number(hot.toFixed(1)),
      // 소수 1자리 — 이유는 src/site/payload.ts의 같은 줄 참고 (git 커밋 용량).
      finalScore: Number(finalScore(hot, fit).toFixed(1)),
      postsPer30: b.postsPer30,
      posts30: b.posts30d,
      posts90: b.posts30d + b.postsPrev,
      acceleration: b.acceleration,
      trend: spotTrendOf(b),
      ratingAvg: Number(((rated.get(s.kakaoPlaceId)?.sum ?? 0)
        / (rated.get(s.kakaoPlaceId)?.n || 1)).toFixed(1)),
      ratingCount: rated.get(s.kakaoPlaceId)?.n ?? 0,
      familyReviews: bySpotReviews.get(s.kakaoPlaceId) ?? [],
      cityOnly: a.parkingGrade === 'C',
      visitedOn: lastVisit.get(s.kakaoPlaceId) ?? null,
      firstSeenAt: s.firstSeenAt,
      isNew: isNewCafe(s.firstSeenAt, now),
      lastSeenAt: s.lastSeenAt ?? null,
    })
  }

  rows.sort((x, y) => y.finalScore - x.finalScore || x.id.localeCompare(y.id))

  const byId = new Map(spots.map((s) => [s.kakaoPlaceId, s]))
  const deduped = dedupeSpotListings(rows, byId)

  const visited: SiteSpotVisited[] = [...lastVisit.entries()]
    .flatMap(([id, on]) => {
      const s = byId.get(id)
      if (!s) return []
      const note = visits.find((v) => v.kakaoPlaceId === id && v.visitedOn === on)?.note ?? ''
      const rt = rated.get(id)
      return [{
        id, name: s.name, sigungu: s.sigungu, area: areaOf({ ...s, zone: zoneOf(s) }),
        visitedOn: on, note, tags: s.tags,
        naverMapUrl: naverMapLink(s), imageUrl: s.imageUrl ?? null,
        ratingAvg: Number(((rt?.sum ?? 0) / (rt?.n || 1)).toFixed(1)),
        ratingCount: rt?.n ?? 0,
      }]
    })
    .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))

  const ids = new Set(deduped.map((r) => r.id))
  const week = pickSpotWeek(suggestions, weekOf, ids, { lastVisit, now })

  const maybeClosed = excludeVisited(staleSpots(spots, now), visits).map((s) => ({
    id: s.kakaoPlaceId,
    name: s.name,
    sigungu: s.sigungu,
    days: daysUnseen(s, now) ?? 0,
    naverMapUrl: naverMapLink(s),
  }))

  return SpotSitePayloadSchema.parse({
    generatedAt: now.toISOString(),
    weekOf,
    pipelineStatus,
    week,
    spots: deduped,
    visited,
    maybeClosed,
    stats: {
      discovered: spots.length,
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
