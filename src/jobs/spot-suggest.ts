import { hotScore, pickWeekendCandidates, finalScore } from '../pipeline/score.js'
import { spotFamilyFit } from '../pipeline/spot-score.js'
import { passesGate } from '../pipeline/gate.js'
import { spotDriveMinutesOf } from './spot-drive-times.js'
import { mondayOf } from './weekly-suggest.js'
import type { BuzzSnapshot, Suggestion } from '../schema.js'
import type { SpotStore } from '../store/spot-json-store.js'

export interface SpotSuggestDeps {
  store: Pick<
    SpotStore, 'readSpots' | 'readSpotBuzz' | 'readSpotSuggestions' | 'writeSpotSuggestions'
  >
  now?: Date
}

const KEEP_WEEKS = 12
const DEFAULT_COUNT = 20

export async function runSpotWeeklySuggest(
  deps: SpotSuggestDeps,
  opts: { count?: number; cityMode?: boolean } = {},
): Promise<{ picked: Suggestion[] }> {
  const { store, now = new Date() } = deps
  const count = opts.count ?? DEFAULT_COUNT
  const spots = await store.readSpots()
  const buzz = await store.readSpotBuzz()

  const latestBuzz = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latestBuzz.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latestBuzz.set(b.kakaoPlaceId, b)
  }

  const scored = spots.flatMap((s) => {
    if (s.status !== 'active') return []
    const a = s.attributes
    if (!a) return []
    if (!passesGate({ tags: s.tags, parkingGrade: a.parkingGrade }, opts).pass) return []
    const b = latestBuzz.get(s.kakaoPlaceId)
    if (!b) return []

    const hot = hotScore(b, now)
    const fit = spotFamilyFit(
      {
        driveMinutes: spotDriveMinutesOf(s) ?? 90,
        parkingGrade: a.parkingGrade,
        hasKidsTag: s.tags.includes('아이와 가기 좋은 곳'),
        lastVisitedOn: null,
        outdoorOnly: a.indoorOutdoor === 'outdoor',
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    return [{
      id: s.kakaoPlaceId, score: finalScore(hot, fit), tags: s.tags, region: s.sigungu, hot, fit,
    }]
  })

  const picked = pickWeekendCandidates(scored, count)
  const weekOf = mondayOf(now)
  const rows: Suggestion[] = picked.map((p, i) => ({
    weekOf, kakaoPlaceId: p.id, rank: i + 1, finalScore: Number(p.score.toFixed(3)),
    reason: { hot: Number(p.hot.toFixed(1)), fit: Number(p.fit.toFixed(3)), tags: p.tags },
  }))

  const prev = await store.readSpotSuggestions()
  const kept = prev.filter((r) => r.weekOf !== weekOf).slice(-(KEEP_WEEKS * count))
  await store.writeSpotSuggestions([...kept, ...rows])
  return { picked: rows }
}
