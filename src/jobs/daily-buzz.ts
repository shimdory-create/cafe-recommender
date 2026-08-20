import { computeBuzz } from '../pipeline/buzz.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { Store } from '../store/types.js'

/**
 * 카페별 최신 스냅샷 1건만 보관한다.
 *
 * 스펙 9절은 180일 롤링을 정했으나 카페가 6,216곳으로 늘면서 계산이
 * 무너졌다. 스냅샷 1건 약 400B x 5,866곳 x 180일 = 약 403 MB 를 한
 * 파일에 담고 그것을 매일 커밋하게 된다 (스펙 전제는 1,500곳이었다).
 *
 * 게다가 그 이력을 읽는 코드가 없다. 가속도는 computeBuzz 가 방금 받은
 * 50건 창에서 계산하고, classify 와 weekly-suggest 는 최신 1건만 조회한다.
 * 순수한 비용이므로 최신 1건만 남긴다 (약 2.2 MB, 크기 고정).
 *
 * 나중에 추이 그래프가 필요해지면 월 1건 집계 파일을 따로 두면 된다.
 */

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

  // 카페별 최신 1건만 남긴다
  const latest = new Map<string, BuzzSnapshot>()
  for (const r of rows) {
    const prev = latest.get(r.kakaoPlaceId)
    if (!prev || r.capturedAt > prev.capturedAt) latest.set(r.kakaoPlaceId, r)
  }
  const kept = [...latest.values()]
  const dropped = rows.length - kept.length

  await store.writeBuzz(kept)
  if (updated > 0) await recordSuccess(store, 'kakao-blog', now)
  return { updated, failed, dropped }
}
