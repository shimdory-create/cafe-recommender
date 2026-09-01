import { computeBuzz, pickThumbnail } from '../pipeline/buzz.js'
import { isRestaurantRelevant } from '../pipeline/restaurant-relevance.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export const PENDING_PER_DAY = 800

export interface RestaurantDailyBuzzDeps {
  store: Pick<
    RestaurantStore,
    'readRestaurants' | 'writeRestaurants' | 'readRestaurantBuzz' | 'writeRestaurantBuzz'
    | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: { search: (q: string, o?: object) => Promise<{ docs: BlogDoc[]; payload: unknown }> }
  now?: Date
}

export interface RestaurantDailyBuzzResult {
  updated: number
  failed: number
  dropped: number
  images: number
  active: number
  rotated: number
}

export async function runRestaurantDailyBuzz(
  deps: RestaurantDailyBuzzDeps,
  opts: { limit?: number; pendingPerDay?: number } = {},
): Promise<RestaurantDailyBuzzResult> {
  const { store, blog, now = new Date() } = deps
  const restaurants = await store.readRestaurants()
  const rows = await store.readRestaurantBuzz()

  const active = restaurants.filter((r) => r.status === 'active')
  const measuredAt = new Map(rows.map((r) => [r.kakaoPlaceId, r.capturedAt]))
  const pending = restaurants
    .filter((r) => r.status === 'pending_extraction')
    .sort((a, b) => {
      const x = measuredAt.get(a.kakaoPlaceId) ?? ''
      const y = measuredAt.get(b.kakaoPlaceId) ?? ''
      if (x !== y) return x.localeCompare(y)
      const da = a.driveMinutes ?? a.driveMinutesEst ?? Number.POSITIVE_INFINITY
      const db = b.driveMinutes ?? b.driveMinutesEst ?? Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return a.kakaoPlaceId.localeCompare(b.kakaoPlaceId)
    })
    .slice(0, opts.pendingPerDay ?? PENDING_PER_DAY)

  const targets = [...active, ...pending].slice(0, opts.limit ?? Infinity)
  const activeTargets = targets.filter((r) => r.status === 'active').length
  const capturedAt = now.toISOString().slice(0, 10)
  let updated = 0
  let failed = 0
  let images = 0

  for (const r of targets) {
    try {
      const query = `${r.sigungu} ${r.name}`
      const res = await blog.search(query, { size: 50, sort: 'recency' })
      await store.appendRaw('kakao-blog-restaurant', query, res.payload, now)

      const m = computeBuzz({
        docs: res.docs, cafeName: r.name, now, isRelevant: isRestaurantRelevant,
      })
      const snap: BuzzSnapshot = { kakaoPlaceId: r.kakaoPlaceId, capturedAt, ...m }
      const i = rows.findIndex(
        (row) => row.kakaoPlaceId === r.kakaoPlaceId && row.capturedAt === capturedAt,
      )
      if (i >= 0) rows[i] = snap
      else rows.push(snap)
      updated++

      const thumb = pickThumbnail({
        docs: res.docs, cafeName: r.name, isRelevant: isRestaurantRelevant,
      })
      if (thumb && thumb !== r.imageUrl) {
        r.imageUrl = thumb
        images++
      }
    } catch (e) {
      failed++
      await recordFailure(store, 'kakao-blog-restaurant', e, now)
    }
  }

  const latest = new Map<string, BuzzSnapshot>()
  for (const row of rows) {
    const prev = latest.get(row.kakaoPlaceId)
    if (!prev || row.capturedAt > prev.capturedAt) latest.set(row.kakaoPlaceId, row)
  }
  const kept = [...latest.values()]
  const dropped = rows.length - kept.length

  await store.writeRestaurantBuzz(kept)
  if (images > 0) await store.writeRestaurants(restaurants)
  if (updated > 0) await recordSuccess(store, 'kakao-blog-restaurant', now)
  return {
    updated, failed, dropped, images,
    active: activeTargets, rotated: targets.length - activeTargets,
  }
}
