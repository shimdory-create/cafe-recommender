import { computeBuzz, passesLayer2, pickThumbnail } from '../pipeline/buzz.js'
import { isSpotRelevant } from '../pipeline/spot-relevance.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { SpotStore } from '../store/spot-json-store.js'

/** 카페용 dormant-recheck.ts 와 같은 이유(2026-09-28). 격주로, 회전 없이 전량 재확인한다 */
export interface SpotDormantRecheckDeps {
  store: Pick<
    SpotStore,
    'readSpots' | 'writeSpots' | 'readSpotBuzz' | 'writeSpotBuzz'
    | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: { search: (q: string, o?: object) => Promise<{ docs: BlogDoc[]; payload: unknown }> }
  now?: Date
}

export interface SpotDormantRecheckResult {
  checked: number
  recovered: number
  stillQuiet: number
  failed: number
}

export async function runSpotDormantRecheck(
  deps: SpotDormantRecheckDeps,
): Promise<SpotDormantRecheckResult> {
  const { store, blog, now = new Date() } = deps
  const spots = await store.readSpots()
  const rows = await store.readSpotBuzz()
  const dormant = spots.filter((s) => s.status === 'dormant')

  const capturedAt = now.toISOString().slice(0, 10)
  const driveOf = (s: { driveMinutes?: number | null; driveMinutesEst?: number | null }): number =>
    s.driveMinutes ?? s.driveMinutesEst ?? Number.POSITIVE_INFINITY
  let recovered = 0
  let stillQuiet = 0
  let failed = 0

  for (const s of dormant) {
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

      const l2 = passesLayer2(m, { now, driveMinutes: driveOf(s) })
      if (l2.pass) {
        s.status = 'active'
        s.excludeReason = null
        s.quietSince = null
        recovered++
      } else {
        stillQuiet++
      }

      const thumb = pickThumbnail({ docs: res.docs, cafeName: s.name, isRelevant: isSpotRelevant })
      if (thumb && thumb !== s.imageUrl) s.imageUrl = thumb
    } catch (e) {
      failed++
      await recordFailure(store, 'kakao-blog-spot', e, now)
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
    await store.writeSpotBuzz([...latest.values()])
    await store.writeSpots(spots)
  }
  if (dormant.length - failed > 0) await recordSuccess(store, 'kakao-blog-spot', now)

  return { checked: dormant.length, recovered, stillQuiet, failed }
}
