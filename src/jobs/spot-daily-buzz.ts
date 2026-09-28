import { computeBuzz, pickThumbnail } from '../pipeline/buzz.js'
import { isSpotRelevant } from '../pipeline/spot-relevance.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { SpotStore } from '../store/spot-json-store.js'

export const PENDING_PER_DAY = 800

/**
 * 하루에 다시 재는 활성 장소 수 (2026-09-28 도입, 카페의 ACTIVE_PER_DAY와
 * 같은 이유 — GitHub Actions 무료 한도 보호). 900은 지금 활성 장소 수
 * (~815곳)보다 넉넉해서 당장은 매일 전부 재는 것과 동일하고, 앞으로 늘어도
 * 하루 비용이 여기서 더 안 커지게 막아 둔 상한이다.
 */
export const ACTIVE_PER_DAY = 900

export interface SpotDailyBuzzDeps {
  store: Pick<
    SpotStore,
    'readSpots' | 'writeSpots' | 'readSpotBuzz' | 'writeSpotBuzz'
    | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: { search: (q: string, o?: object) => Promise<{ docs: BlogDoc[]; payload: unknown }> }
  now?: Date
}

export interface SpotDailyBuzzResult {
  updated: number
  failed: number
  dropped: number
  images: number
  active: number
  rotated: number
}

export async function runSpotDailyBuzz(
  deps: SpotDailyBuzzDeps,
  opts: { limit?: number; pendingPerDay?: number; activePerDay?: number } = {},
): Promise<SpotDailyBuzzResult> {
  const { store, blog, now = new Date() } = deps
  const spots = await store.readSpots()
  const rows = await store.readSpotBuzz()

  // 한 번도 안 잰 곳이 가장 먼저다. active·pending 둘 다 이 기준으로
  // 회전한다 (2026-09-28, ACTIVE_PER_DAY 주석 참고).
  const measuredAt = new Map(rows.map((r) => [r.kakaoPlaceId, r.capturedAt]))
  const byStaleness = (x: { kakaoPlaceId: string }, y: { kakaoPlaceId: string }) =>
    (measuredAt.get(x.kakaoPlaceId) ?? '').localeCompare(measuredAt.get(y.kakaoPlaceId) ?? '')

  const active = spots
    .filter((s) => s.status === 'active')
    .sort(byStaleness)
    .slice(0, opts.activePerDay ?? ACTIVE_PER_DAY)
  const pending = spots
    .filter((s) => s.status === 'pending_extraction')
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
  const activeTargets = targets.filter((s) => s.status === 'active').length
  const capturedAt = now.toISOString().slice(0, 10)
  let updated = 0
  let failed = 0
  let images = 0

  for (const s of targets) {
    try {
      const query = `${s.sigungu} ${s.name}`
      const res = await blog.search(query, { size: 50, sort: 'recency' })
      await store.appendRaw('kakao-blog-spot', query, res.payload, now)

      const m = computeBuzz({
        docs: res.docs, cafeName: s.name, now, isRelevant: isSpotRelevant,
      })
      const snap: BuzzSnapshot = { kakaoPlaceId: s.kakaoPlaceId, capturedAt, ...m }
      const i = rows.findIndex(
        (row) => row.kakaoPlaceId === s.kakaoPlaceId && row.capturedAt === capturedAt,
      )
      if (i >= 0) rows[i] = snap
      else rows.push(snap)
      updated++

      const thumb = pickThumbnail({
        docs: res.docs, cafeName: s.name, isRelevant: isSpotRelevant,
      })
      if (thumb && thumb !== s.imageUrl) {
        s.imageUrl = thumb
        images++
      }
    } catch (e) {
      failed++
      await recordFailure(store, 'kakao-blog-spot', e, now)
    }
  }

  const latest = new Map<string, BuzzSnapshot>()
  for (const row of rows) {
    const prev = latest.get(row.kakaoPlaceId)
    if (!prev || row.capturedAt > prev.capturedAt) latest.set(row.kakaoPlaceId, row)
  }
  const kept = [...latest.values()]
  const dropped = rows.length - kept.length

  await store.writeSpotBuzz(kept)
  if (images > 0) await store.writeSpots(spots)
  if (updated > 0) await recordSuccess(store, 'kakao-blog-spot', now)
  return {
    updated, failed, dropped, images,
    active: activeTargets, rotated: targets.length - activeTargets,
  }
}
