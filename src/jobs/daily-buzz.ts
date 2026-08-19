import { computeBuzz } from '../pipeline/buzz.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { Store } from '../store/types.js'

const DAY = 86_400_000
/** 스펙 9절 롤링 윈도우. git 에 남는 유일한 시계열이다. */
const RETENTION_DAYS = 180

export interface DailyBuzzDeps {
  store: Pick<
    Store,
    'readCafes' | 'readBuzz' | 'writeBuzz' | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: {
    search: (
      q: string,
      o?: object,
    ) => Promise<{ docs: BlogDoc[]; payload: unknown }>
  }
  now?: Date
}

export interface DailyBuzzResult {
  updated: number
  failed: number
  dropped: number
}

/**
 * 카페별 화제량을 재수집해 buzz.json 을 갱신한다.
 *
 * 카페 하나가 실패해도 나머지를 계속한다. health 에 기록만 남긴다.
 */
export async function runDailyBuzz(
  deps: DailyBuzzDeps,
  opts: { limit?: number } = {},
): Promise<DailyBuzzResult> {
  const { store, blog, now = new Date() } = deps
  const cafes = await store.readCafes()
  const targets = cafes
    .filter((c) => c.status === 'active' || c.status === 'pending_extraction')
    .slice(0, opts.limit ?? Infinity)

  const rows = await store.readBuzz()
  const capturedAt = now.toISOString().slice(0, 10)
  let updated = 0
  let failed = 0

  for (const c of targets) {
    try {
      // 검색어는 항상 "{시군구} {상호}" 조합 (Global Constraints)
      const query = `${c.sigungu} ${c.name}`
      const res = await blog.search(query, { size: 50, sort: 'recency' })
      await store.appendRaw('kakao-blog', query, res.payload, now)

      const m = computeBuzz({ docs: res.docs, cafeName: c.name, now })
      const snap: BuzzSnapshot = { kakaoPlaceId: c.kakaoPlaceId, capturedAt, ...m }
      const i = rows.findIndex(
        (r) => r.kakaoPlaceId === c.kakaoPlaceId && r.capturedAt === capturedAt,
      )
      if (i >= 0) rows[i] = snap
      else rows.push(snap)
      updated++
    } catch (e) {
      failed++
      await recordFailure(store, 'kakao-blog', e, now)
    }
  }

  const cutoff = now.getTime() - RETENTION_DAYS * DAY
  const kept = rows.filter((r) => new Date(r.capturedAt).getTime() >= cutoff)
  const dropped = rows.length - kept.length

  await store.writeBuzz(kept)
  if (updated > 0) await recordSuccess(store, 'kakao-blog', now)
  return { updated, failed, dropped }
}
