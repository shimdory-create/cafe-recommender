import { hotScore } from '../pipeline/score.js'
import { passesGate } from '../pipeline/gate.js'
import { SitePayloadSchema, type BuzzSnapshot, type Cafe, type SiteCafe, type SitePayload, type Suggestion, type Visit } from '../schema.js'

export interface PayloadInput {
  cafes: Cafe[]
  buzz: BuzzSnapshot[]
  visits: Visit[]
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
export function buildSitePayload(input: PayloadInput): SitePayload {
  const { cafes, buzz, visits, suggestions, weekOf, now } = input

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

    rows.push({
      id: c.kakaoPlaceId,
      name: c.name,
      sigungu: c.sigungu,
      driveMinutes: c.driveMinutesEst ?? null,
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
      hotScore: Number(hotScore(b, now).toFixed(1)),
      postsPer30: b.postsPer30,
      acceleration: b.acceleration,
      cityOnly: a.parkingGrade === 'C',
      visitedOn: lastVisit.get(c.kakaoPlaceId) ?? null,
    })
  }

  // 화제도 내림차순. 동점은 id 로 안정 정렬해 빌드마다 순서가 흔들리지 않게.
  rows.sort((x, y) => y.hotScore - x.hotScore || x.id.localeCompare(y.id))

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
    stats: {
      discovered: cafes.length,
      passed: rows.filter((r) => !r.cityOnly).length,
      regions: new Set(rows.map((r) => r.sigungu)).size,
      cityOnly: rows.filter((r) => r.cityOnly).length,
    },
  })
}
