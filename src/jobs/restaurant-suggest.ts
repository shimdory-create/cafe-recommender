import { hotScore, finalScore, pickWeekendCandidates } from '../pipeline/score.js'
import { restaurantFamilyFit } from '../pipeline/restaurant-score.js'
import { passesGate } from '../pipeline/gate.js'
import { restaurantDriveMinutesOf } from './restaurant-drive-times.js'
import { mondayOf } from './weekly-suggest.js'
import type { BuzzSnapshot, Suggestion } from '../schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export interface RestaurantSuggestDeps {
  store: Pick<
    RestaurantStore,
    'readRestaurants' | 'readRestaurantBuzz' | 'readRestaurantSuggestions'
    | 'writeRestaurantSuggestions'
  >
  now?: Date
}

const KEEP_WEEKS = 12
const DEFAULT_COUNT = 20

export async function runRestaurantWeeklySuggest(
  deps: RestaurantSuggestDeps,
  opts: { count?: number; cityMode?: boolean } = {},
): Promise<{ picked: Suggestion[] }> {
  const { store, now = new Date() } = deps
  const count = opts.count ?? DEFAULT_COUNT
  const restaurants = await store.readRestaurants()
  const buzz = await store.readRestaurantBuzz()

  const latestBuzz = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latestBuzz.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latestBuzz.set(b.kakaoPlaceId, b)
  }

  const scored = restaurants.flatMap((r) => {
    if (r.status !== 'active') return []
    const a = r.attributes
    if (!a) return []
    if (!passesGate({ tags: r.tags, parkingGrade: a.parkingGrade }, opts).pass) return []
    const b = latestBuzz.get(r.kakaoPlaceId)
    if (!b) return []

    const hot = hotScore(b, now)
    const fit = restaurantFamilyFit(
      {
        driveMinutes: restaurantDriveMinutesOf(r) ?? 90,
        parkingGrade: a.parkingGrade,
        hasRoom: a.hasRoom,
        reservable: a.reservable,
        lastVisitedOn: null,
        // 카페는 menuLevel === 1(실내 식사 불가) 일 때만 야외석을 계절 배수로
        // 다뤘다. 식당은 전부 식사가 되므로 그 신호가 없다 — 테라스가 있어도
        // 실내 식사가 본업인 식당까지 계절 배수를 주면 안 된다. 그래서
        // 이 단계에서는 식당에 계절 배수를 아예 주지 않는다.
        outdoorOnly: false,
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    return [{
      id: r.kakaoPlaceId, score: finalScore(hot, fit), tags: r.tags, region: r.sigungu, hot, fit,
    }]
  })

  const picked = pickWeekendCandidates(scored, count)
  const weekOf = mondayOf(now)
  const rows: Suggestion[] = picked.map((p, i) => ({
    weekOf, kakaoPlaceId: p.id, rank: i + 1, finalScore: Number(p.score.toFixed(3)),
    reason: { hot: Number(p.hot.toFixed(1)), fit: Number(p.fit.toFixed(3)), tags: p.tags },
  }))

  const prev = await store.readRestaurantSuggestions()
  const kept = prev.filter((s) => s.weekOf !== weekOf).slice(-(KEEP_WEEKS * count))
  await store.writeRestaurantSuggestions([...kept, ...rows])
  return { picked: rows }
}
