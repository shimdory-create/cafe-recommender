import { driveMinutesOf } from '../jobs/drive-times.js'
import { zoneOf } from '../config/zones.js'
import { areaOf } from '../config/area.js'
import { isNewCafe } from '../config/newness.js'
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

/**
 * 같은 카페가 두 번 등록된 것을 하나로 줄인다.
 *
 * 실측: 카카오에 `비루개`(남양주)와 `터프이너프 로스터스`(평택)가 각각 **두 개의
 * 장소 id** 로 올라와 있었다. 하나는 도로명 주소가 없는 빈 껍데기다.
 * 그대로 두면 목록에 같은 이름이 두 번 나오고, 더 나쁜 경우 이번 주 추천
 * 10칸 중 두 칸을 같은 카페가 먹는다.
 *
 * 판단 기준은 **이름 + 시군구**다. 우리 데이터의 상호에는 지점명이 붙어 있어
 * (`경성빵공장 남한산성점`) 서로 다른 지점이 같은 키가 되는 일은 없다.
 * 좌표 근접으로 묶는 방법도 있지만, 같은 건물의 다른 카페를 잘못 합칠 위험이
 * 더 크다 — 이름이 같을 때만 손대는 편이 안전하다.
 *
 * 남길 것을 고르는 순서:
 *   1. 도로명 주소가 있는 쪽 (빈 껍데기가 아닌 쪽)
 *   2. 종합점수가 높은 쪽 (화제량 측정이 제대로 된 쪽)
 *   3. id 가 작은 쪽 (빌드마다 결과가 흔들리지 않게)
 */
export function dedupeListings(
  rows: SiteCafe[],
  byId: Map<string, Cafe>,
): SiteCafe[] {
  const best = new Map<string, SiteCafe>()
  for (const r of rows) {
    const key = `${r.name}|${r.sigungu}`
    const prev = best.get(key)
    if (!prev) {
      best.set(key, r)
      continue
    }
    if (betterListing(r, prev, byId)) best.set(key, r)
  }
  // 원래 순서(점수 내림차순)를 지킨다
  const keep = new Set([...best.values()].map((r) => r.id))
  return rows.filter((r) => keep.has(r.id))
}

function betterListing(a: SiteCafe, b: SiteCafe, byId: Map<string, Cafe>): boolean {
  const addr = (r: SiteCafe) => Boolean(byId.get(r.id)?.roadAddress)
  if (addr(a) !== addr(b)) return addr(a)
  if (a.finalScore !== b.finalScore) return a.finalScore > b.finalScore
  return a.id.localeCompare(b.id) < 0
}

/**
 * 이번 주 추천을 고른다. **정확히 일치하지 않으면 가장 최근 것으로 내려온다.**
 *
 * 원래는 `s.weekOf === weekOf` 만 봤는데 그러면 **월~목 사흘 동안 추천이
 * 사라진다.** 후보 확정은 목요일 밤에 돌고 그때 붙는 `weekOf` 는 그 주의
 * 월요일이다. 월요일 09시(KST)가 지나면 `weekOf` 가 다음 주로 넘어가는데
 * 새 후보는 아직 없다 — 실측으로 2026-08-24 에 `week: []` 가 나왔다.
 *
 * 화면에서는 목록이 통째로 비지는 않고 종합점수 순으로 대체되지만, 그것은
 * 지역 다양성과 주차 등급을 지키며 고른 열 곳이 아니다. 금요일에 받은
 * 목록은 다음 목록이 나올 때까지 유효하다고 보는 편이 맞다.
 */
export function pickWeek(
  suggestions: Suggestion[],
  weekOf: string,
  ids: Set<string>,
): { rank: number; id: string; finalScore: number }[] {
  const usable = suggestions.filter((s) => s.weekOf <= weekOf && ids.has(s.kakaoPlaceId))
  if (usable.length === 0) return []
  const latest = usable.reduce((m, s) => (s.weekOf > m ? s.weekOf : m), '')
  return usable
    .filter((s) => s.weekOf === latest)
    .sort((a, b) => a.rank - b.rank)
    .map((s) => ({ rank: s.rank, id: s.kakaoPlaceId, finalScore: s.finalScore }))
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
      zone: zoneOf(c),
      area: areaOf({ ...c, zone: zoneOf(c) }),
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
      imageUrl: c.imageUrl ?? null,
      hotScore: Number(hot.toFixed(1)),
      finalScore: Number(finalScore(hot, fit).toFixed(3)),
      postsPer30: b.postsPer30,
      posts30: b.posts30d,
      // 30일 + 이전 기간(31~90일). 창이 90일을 못 덮으면 그만큼만 센 값이다
      posts90: b.posts30d + b.postsPrev,
      acceleration: b.acceleration,
      trend: trendOf(b),
      ratingAvg: Number(((rated.get(c.kakaoPlaceId)?.sum ?? 0)
        / (rated.get(c.kakaoPlaceId)?.n || 1)).toFixed(1)),
      ratingCount: rated.get(c.kakaoPlaceId)?.n ?? 0,
      cityOnly: a.parkingGrade === 'C',
      visitedOn: lastVisit.get(c.kakaoPlaceId) ?? null,
      firstSeenAt: c.firstSeenAt,
      isNew: isNewCafe(c.firstSeenAt, now),
    })
  }

  // 종합점수 내림차순. 동점은 id 로 안정 정렬해 빌드마다 순서가 흔들리지 않게.
  rows.sort((x, y) => y.finalScore - x.finalScore || x.id.localeCompare(y.id))

  const byId = new Map(cafes.map((c) => [c.kakaoPlaceId, c]))
  const deduped = dedupeListings(rows, byId)

  // 다녀온 곳은 통과 여부와 무관하게 싣는다. 기록이 사라지면 안 된다.
  const visited: SiteVisited[] = [...lastVisit.entries()]
    .flatMap(([id, on]) => {
      const c = byId.get(id)
      if (!c) return []
      const note = visits.find((v) => v.kakaoPlaceId === id && v.visitedOn === on)?.note ?? ''
      const r = rated.get(id)
      return [{
        id,
        name: c.name,
        sigungu: c.sigungu,
        area: areaOf({ ...c, zone: zoneOf(c) }),
        visitedOn: on,
        note,
        tags: c.tags,
        scale: c.attributes?.scale ?? null,
        naverMapUrl: c.naverMapUrl
          ?? `https://map.naver.com/p/search/${encodeURIComponent(`${c.sigungu} ${c.name}`)}`,
        imageUrl: c.imageUrl ?? null,
        ratingAvg: Number(((r?.sum ?? 0) / (r?.n || 1)).toFixed(1)),
        ratingCount: r?.n ?? 0,
      }]
    })
    // 최근에 다녀온 것부터
    .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))

  const ids = new Set(deduped.map((r) => r.id))
  const week = pickWeek(suggestions, weekOf, ids)

  return SitePayloadSchema.parse({
    generatedAt: now.toISOString(),
    weekOf,
    week,
    cafes: deduped,
    visited,
    stats: {
      discovered: cafes.length,
      passed: deduped.filter((r) => !r.cityOnly).length,
      regions: new Set(deduped.map((r) => r.sigungu)).size,
      cityOnly: deduped.filter((r) => r.cityOnly).length,
    },
  })
}
