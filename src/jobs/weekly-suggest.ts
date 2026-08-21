import { hotScore, familyFit, finalScore, pickWeekendCandidates } from '../pipeline/score.js'
import { passesGate } from '../pipeline/gate.js'
import { driveMinutesOf } from './drive-times.js'
import type { BuzzSnapshot, Suggestion } from '../schema.js'
import type { Store } from '../store/types.js'

export interface SuggestDeps {
  store: Pick<
    Store,
    'readCafes' | 'readBuzz' | 'readVisits' | 'readSuggestions' | 'writeSuggestions'
  >
  now?: Date
}

/** 그 주의 월요일(UTC 기준 YYYY-MM-DD). 주간 키로 쓴다. */
export function mondayOf(d: Date): string {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
  return x.toISOString().slice(0, 10)
}

/** 최근 12주 보관 */
const KEEP_WEEKS = 12

/**
 * 한 주에 보여줄 후보 수.
 *
 * 3곳으로 시작했는데 "너무 적다" 는 피드백을 받았다. 4인 가족이 취향을
 * 맞추려면 고를 수 있는 폭이 필요하다. 10곳을 뽑고, 화면에서 다음 10곳으로
 * 넘길 수 있게 했다.
 */
const DEFAULT_COUNT = 10

export async function runWeeklySuggest(
  deps: SuggestDeps,
  opts: { count?: number; cityMode?: boolean } = {},
): Promise<{ picked: Suggestion[] }> {
  const { store, now = new Date() } = deps
  const count = opts.count ?? DEFAULT_COUNT
  const cafes = await store.readCafes()
  const buzz = await store.readBuzz()
  const visits = await store.readVisits()

  // 카페별 최신 스냅샷
  const latestBuzz = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latestBuzz.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latestBuzz.set(b.kakaoPlaceId, b)
  }
  // 카페별 최근 방문일
  const lastVisit = new Map<string, string>()
  for (const v of visits) {
    const prev = lastVisit.get(v.kakaoPlaceId)
    if (!prev || v.visitedOn > prev) lastVisit.set(v.kakaoPlaceId, v.visitedOn)
  }

  const scored = cafes.flatMap((c) => {
    if (c.status !== 'active') return []
    const a = c.attributes
    if (!a) return []
    if (!passesGate({ tags: c.tags, parkingGrade: a.parkingGrade }, opts).pass) return []
    const b = latestBuzz.get(c.kakaoPlaceId)
    if (!b) return []

    const hot = hotScore(b, now)
    const fit = familyFit(
      {
        driveMinutes: driveMinutesOf(c) ?? 90,
        parkingGrade: a.parkingGrade,
        menuLevel: a.menuLevel,
        lastVisitedOn: lastVisit.get(c.kakaoPlaceId) ?? null,
        // 야외석이 있고 실내 식사가 안 되면 계절 영향을 크게 받는다
        outdoorOnly: Boolean(a.outdoorSeating) && a.menuLevel === 1,
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    return [{
      id: c.kakaoPlaceId, score: finalScore(hot, fit), tags: c.tags,
      region: c.sigungu, hot, fit,
    }]
  })

  const picked = pickWeekendCandidates(scored, count)
  const weekOf = mondayOf(now)
  const rows: Suggestion[] = picked.map((p, i) => ({
    weekOf,
    kakaoPlaceId: p.id,
    rank: i + 1,
    finalScore: Number(p.score.toFixed(3)),
    reason: {
      hot: Number(p.hot.toFixed(1)),
      fit: Number(p.fit.toFixed(3)),
      tags: p.tags,
    },
  }))

  const prev = await store.readSuggestions()
  const kept = prev.filter((s) => s.weekOf !== weekOf).slice(-(KEEP_WEEKS * count))
  await store.writeSuggestions([...kept, ...rows])
  return { picked: rows }
}
