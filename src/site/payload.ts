import { driveMinutesOf } from '../jobs/drive-times.js'
import { familyFit, finalScore, hotScore } from '../pipeline/score.js'
import { passesGate } from '../pipeline/gate.js'
import { SitePayloadSchema, type BuzzSnapshot, type Cafe, type SiteCafe, type SitePayload, type SiteVisited, type Suggestion, type Visit, type Review } from '../schema.js'

export interface PayloadInput {
  cafes: Cafe[]
  buzz: BuzzSnapshot[]
  visits: Visit[]
  reviews?: Review[]
  suggestions: Suggestion[]
  weekOf: string
  now: Date
}

/**
 * 웹앱이 읽을 표시용 페이로드를 만든다 (계획 3 Task 1).
 *
 * 여기가 파이프라인과 웹앱의 유일한 접점이다. 점수는 `hotScore` 를 그대로
 * 쓰고 노출 여부는 `passesGate` 를 그대로 쓴다 — 웹에서 다시 계산하면
 * 두 곳이 갈라진다.
 *
 * 주차 C 는 배제가 아니라 조건부 노출이므로(스펙 7.3) 페이로드에는 싣고
 * `cityOnly` 로 표시한다. 화면에서 토글로 켠다. 골든셋에서 이 구분을
 * 상태로 굳혔던 버그가 잡혔다.
 */
/** 이전 기간(30~90일)을 비교하려면 창이 90일을 덮어야 한다 */
const COMPARABLE_SPAN_DAYS = 90

/**
 * 화제 추이를 판정한다.
 *
 * `acceleration` 을 그대로 쓰지 않는다. 그 값은 상한 17.67 에 붙고 실측
 * 중앙값이 4.35, 26% 가 10 이상이었다 — "급증" 이 아니라 **50건 창이
 * 최근에 몰려 잘렸다는 신호**다 (발견 E).
 *
 * 창이 90일을 덮지 못하면 `postsPrev` 자체가 절단된 값이므로 비교가
 * 성립하지 않는다. 그때는 늘었다고 말하지 않는다. 신뢰는 과장하지 않는
 * 데서 온다.
 */
export function trendOf(
  b: { posts30d: number; postsPrev: number; spanDays: number },
): 'rising' | 'steady' | 'unknown' {
  if (b.spanDays < COMPARABLE_SPAN_DAYS || b.postsPrev === 0) return 'unknown'
  const baseline = b.postsPrev / 2
  return b.posts30d >= baseline * 1.5 ? 'rising' : 'steady'
}

export function buildSitePayload(input: PayloadInput): SitePayload {
  const { cafes, buzz, visits, suggestions, weekOf, now, reviews = [] } = input

  // 카페별 별점 요약
  const rated = new Map<string, { sum: number; n: number }>()
  for (const r of reviews) {
    const cur = rated.get(r.kakaoPlaceId) ?? { sum: 0, n: 0 }
    rated.set(r.kakaoPlaceId, { sum: cur.sum + r.rating, n: cur.n + 1 })
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

  const rows: SiteCafe[] = []
  for (const c of cafes) {
    if (c.status !== 'active') continue
    const a = c.attributes
    if (!a) continue
    // 도심 모드까지 포함해 통과하는 것만 싣는다. 하드 게이트 탈락은 제외.
    if (!passesGate({ tags: c.tags, parkingGrade: a.parkingGrade }, { cityMode: true }).pass) continue
    const b = latestBuzz.get(c.kakaoPlaceId)
    if (!b) continue

    const hot = hotScore(b, now)
    const fit = familyFit(
      {
        driveMinutes: driveMinutesOf(c) ?? 90,
        parkingGrade: a.parkingGrade,
        menuLevel: a.menuLevel,
        lastVisitedOn: lastVisit.get(c.kakaoPlaceId) ?? null,
        outdoorOnly: Boolean(a.outdoorSeating) && a.menuLevel === 1,
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    rows.push({
      id: c.kakaoPlaceId,
      name: c.name,
      sigungu: c.sigungu,
      driveMinutes: driveMinutesOf(c),
      scale: a.scale ?? null,
      parkingGrade: a.parkingGrade,
      menuLevel: a.menuLevel,
      tags: c.tags,
      evidence: a.evidence,
      parkingEvidence: a.parkingEvidence,
      signatureMenu: a.signatureMenu ?? null,
      viewTypes: a.viewTypes ?? [],
      mealTypes: a.mealTypes ?? [],
      outdoorSeating: a.outdoorSeating ?? null,
      teenAppeal: a.teenAppeal ?? null,
      stayDuration: a.stayDuration ?? null,
      naverMapUrl: c.naverMapUrl
        ?? `https://map.naver.com/p/search/${encodeURIComponent(`${c.sigungu} ${c.name}`)}`,
      kakaoPlaceUrl: c.kakaoPlaceUrl ?? null,
      hotScore: Number(hot.toFixed(1)),
      finalScore: Number(finalScore(hot, fit).toFixed(3)),
      postsPer30: b.postsPer30,
      acceleration: b.acceleration,
      trend: trendOf(b),
      ratingAvg: Number(((rated.get(c.kakaoPlaceId)?.sum ?? 0)
        / (rated.get(c.kakaoPlaceId)?.n || 1)).toFixed(1)),
      ratingCount: rated.get(c.kakaoPlaceId)?.n ?? 0,
      cityOnly: a.parkingGrade === 'C',
      visitedOn: lastVisit.get(c.kakaoPlaceId) ?? null,
    })
  }

  // 종합점수 내림차순. 동점은 id 로 안정 정렬해 빌드마다 순서가 흔들리지 않게.
  rows.sort((x, y) => y.finalScore - x.finalScore || x.id.localeCompare(y.id))

  // 다녀온 곳은 통과 여부와 무관하게 싣는다. 기록이 사라지면 안 된다.
  const byPlaceId = new Map(cafes.map((c) => [c.kakaoPlaceId, c]))
  const visited: SiteVisited[] = [...lastVisit.entries()]
    .flatMap(([id, on]) => {
      const c = byPlaceId.get(id)
      if (!c) return []
      const note = visits.find((v) => v.kakaoPlaceId === id && v.visitedOn === on)?.note ?? ''
      return [{
        id,
        name: c.name,
        sigungu: c.sigungu,
        visitedOn: on,
        note,
        tags: c.tags,
        scale: c.attributes?.scale ?? null,
        naverMapUrl: c.naverMapUrl
          ?? `https://map.naver.com/p/search/${encodeURIComponent(`${c.sigungu} ${c.name}`)}`,
      }]
    })
    // 최근에 다녀온 것부터
    .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))

  const ids = new Set(rows.map((r) => r.id))
  const week = suggestions
    .filter((s) => s.weekOf === weekOf && ids.has(s.kakaoPlaceId))
    .sort((a, b) => a.rank - b.rank)
    .map((s) => ({ rank: s.rank, id: s.kakaoPlaceId, finalScore: s.finalScore }))

  return SitePayloadSchema.parse({
    generatedAt: now.toISOString(),
    weekOf,
    week,
    cafes: rows,
    visited,
    stats: {
      discovered: cafes.length,
      passed: rows.filter((r) => !r.cityOnly).length,
      regions: new Set(rows.map((r) => r.sigungu)).size,
      cityOnly: rows.filter((r) => r.cityOnly).length,
    },
  })
}
