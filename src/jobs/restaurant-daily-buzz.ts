import { computeBuzz, passesLayer2, pickThumbnail } from '../pipeline/buzz.js'
import { nextQuietState } from '../pipeline/dormancy.js'
import { isRestaurantRelevant } from '../pipeline/restaurant-relevance.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export const PENDING_PER_DAY = 800

/**
 * 하루에 다시 재는 활성 식당 수 (2026-09-28 도입, 카페의 ACTIVE_PER_DAY와
 * 같은 이유). 식당은 활성 4,200여 곳까지 늘면서 이 잡 혼자 하루 20분대,
 * GitHub Actions 무료 한도(월 2,000분) 소진의 주원인이 됐다. 1,500은
 * 카페 기준(1,600/1,550곳 ≈ 7분)과 비슷한 하루 소요시간이 나오도록 잡은
 * 값이다 — 회전 주기는 약 2.8일(4,200 / 1,500).
 */
export const ACTIVE_PER_DAY = 1500

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
  /** 오늘 화제 식음으로 넘어간 수 (연속 21일 기준 미달) */
  dormant: number
}

export async function runRestaurantDailyBuzz(
  deps: RestaurantDailyBuzzDeps,
  opts: { limit?: number; pendingPerDay?: number; activePerDay?: number } = {},
): Promise<RestaurantDailyBuzzResult> {
  const { store, blog, now = new Date() } = deps
  const restaurants = await store.readRestaurants()
  const rows = await store.readRestaurantBuzz()

  // 한 번도 안 잰 곳이 가장 먼저다. active·pending 둘 다 이 기준으로
  // 회전한다 (2026-09-28, ACTIVE_PER_DAY 주석 참고).
  const measuredAt = new Map(rows.map((r) => [r.kakaoPlaceId, r.capturedAt]))
  const byStaleness = (x: { kakaoPlaceId: string }, y: { kakaoPlaceId: string }) =>
    (measuredAt.get(x.kakaoPlaceId) ?? '').localeCompare(measuredAt.get(y.kakaoPlaceId) ?? '')

  const active = restaurants
    .filter((r) => r.status === 'active')
    .sort(byStaleness)
    .slice(0, opts.activePerDay ?? ACTIVE_PER_DAY)
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
  const driveOf = (r: { driveMinutes?: number | null; driveMinutesEst?: number | null }): number =>
    r.driveMinutes ?? r.driveMinutesEst ?? Number.POSITIVE_INFINITY
  let updated = 0
  let failed = 0
  let images = 0
  let dormant = 0

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

      if (r.status === 'active') {
        const l2 = passesLayer2(m, { now, driveMinutes: driveOf(r) })
        const q = nextQuietState({
          quietSince: r.quietSince ?? null,
          firstSeenAt: r.firstSeenAt,
          passesBuzz: l2.pass,
          now,
          today: capturedAt,
        })
        r.quietSince = q.quietSince
        if (q.shouldGoDormant) {
          r.status = 'dormant'
          r.excludeReason = '화제 식음 — 21일 연속 화제량 미달'
          dormant++
        }
      }

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
  if (images > 0 || activeTargets > 0) await store.writeRestaurants(restaurants)
  if (updated > 0) await recordSuccess(store, 'kakao-blog-restaurant', now)
  return {
    updated, failed, dropped, images, dormant,
    active: activeTargets, rotated: targets.length - activeTargets,
  }
}
