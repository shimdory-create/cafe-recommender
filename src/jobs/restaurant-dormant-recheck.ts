import { computeBuzz, passesLayer2, pickThumbnail } from '../pipeline/buzz.js'
import { isRestaurantRelevant } from '../pipeline/restaurant-relevance.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

/** 카페용 dormant-recheck.ts 와 같은 이유(2026-09-28). 격주로, 회전 없이 전량 재확인한다 */
export interface RestaurantDormantRecheckDeps {
  store: Pick<
    RestaurantStore,
    'readRestaurants' | 'writeRestaurants' | 'readRestaurantBuzz' | 'writeRestaurantBuzz'
    | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: { search: (q: string, o?: object) => Promise<{ docs: BlogDoc[]; payload: unknown }> }
  now?: Date
}

export interface RestaurantDormantRecheckResult {
  checked: number
  recovered: number
  stillQuiet: number
  failed: number
}

export async function runRestaurantDormantRecheck(
  deps: RestaurantDormantRecheckDeps,
): Promise<RestaurantDormantRecheckResult> {
  const { store, blog, now = new Date() } = deps
  const restaurants = await store.readRestaurants()
  const rows = await store.readRestaurantBuzz()
  const dormant = restaurants.filter((r) => r.status === 'dormant')

  const capturedAt = now.toISOString().slice(0, 10)
  const driveOf = (r: { driveMinutes?: number | null; driveMinutesEst?: number | null }): number =>
    r.driveMinutes ?? r.driveMinutesEst ?? Number.POSITIVE_INFINITY
  let recovered = 0
  let stillQuiet = 0
  let failed = 0

  for (const r of dormant) {
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

      const l2 = passesLayer2(m, { now, driveMinutes: driveOf(r) })
      if (l2.pass) {
        r.status = 'active'
        r.excludeReason = null
        r.quietSince = null
        recovered++
      } else {
        stillQuiet++
      }

      const thumb = pickThumbnail({ docs: res.docs, cafeName: r.name, isRelevant: isRestaurantRelevant })
      if (thumb && thumb !== r.imageUrl) r.imageUrl = thumb
    } catch (e) {
      failed++
      await recordFailure(store, 'kakao-blog-restaurant', e, now)
    }
  }

  // dormant 0곳이면 재측정이 없었으니 buzz 파일도 그대로 둔다(카페 쪽과
  // 같은 이유 — 격주 무의미 재기록을 막는다).
  if (dormant.length > 0) {
    const latest = new Map<string, BuzzSnapshot>()
    for (const row of rows) {
      const prev = latest.get(row.kakaoPlaceId)
      if (!prev || row.capturedAt > prev.capturedAt) latest.set(row.kakaoPlaceId, row)
    }
    await store.writeRestaurantBuzz([...latest.values()])
    await store.writeRestaurants(restaurants)
  }
  if (dormant.length - failed > 0) await recordSuccess(store, 'kakao-blog-restaurant', now)

  return { checked: dormant.length, recovered, stillQuiet, failed }
}
