import { computeBuzz, pickThumbnail } from '../pipeline/buzz.js'
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

/**
 * 하루에 다시 재는 판정 대기 카페 수.
 *
 * 대기 5,100곳 / 800 = 약 6~7일에 한 바퀴. 판정이 하루 최대 200곳(무료 쿼터)
 * 이므로 이보다 자주 잴 이유가 없다.
 */
export const PENDING_PER_DAY = 800

export interface DailyBuzzDeps {
  store: Pick<
    Store,
    'readCafes' | 'writeCafes' | 'readBuzz' | 'writeBuzz'
    | 'appendRaw' | 'readHealth' | 'writeHealth'
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
  /** 대표 이미지를 새로 얻은 카페 수 */
  images: number
}

/**
 * 카페별 화제량을 재수집해 buzz.json 을 갱신한다.
 *
 * 카페 하나가 실패해도 나머지를 계속한다. health 에 기록만 남긴다.
 */
export async function runDailyBuzz(
  deps: DailyBuzzDeps,
  opts: { limit?: number; pendingPerDay?: number } = {},
): Promise<DailyBuzzResult> {
  const { store, blog, now = new Date() } = deps
  const cafes = await store.readCafes()
  const rows = await store.readBuzz()

  // 화면에 보이는 카페(active)는 **매일** 다시 잰다. 순위와 대표 이미지가
  // 여기서 나오므로 하루라도 낡으면 그대로 보인다.
  const active = cafes.filter((c) => c.status === 'active')

  // 판정 대기는 **돌려가며** 잰다. 화면에 뜨지 않는 5,000곳을 매일 재는 것은
  // 순수한 낭비였다 — 카카오 호출 5,900회/일, Actions 18분/일. 대기 카페의
  // 화제량은 "판정 우선순위" 에만 쓰이므로 주 1회면 충분하다.
  //
  // 가장 오래된 것부터 고른다. 그러면 전체가 PENDING_PER_DAY 주기로 한 바퀴 돈다.
  const measuredAt = new Map(rows.map((r) => [r.kakaoPlaceId, r.capturedAt]))
  const pending = cafes
    .filter((c) => c.status === 'pending_extraction')
    .sort((a, b) => {
      // 한 번도 안 잰 곳이 가장 먼저다 ('' 가 어떤 날짜보다 작다)
      const x = measuredAt.get(a.kakaoPlaceId) ?? ''
      const y = measuredAt.get(b.kakaoPlaceId) ?? ''
      return x === y ? a.kakaoPlaceId.localeCompare(b.kakaoPlaceId) : x.localeCompare(y)
    })
    .slice(0, opts.pendingPerDay ?? PENDING_PER_DAY)

  const targets = [...active, ...pending].slice(0, opts.limit ?? Infinity)
  const capturedAt = now.toISOString().slice(0, 10)
  let updated = 0
  let failed = 0
  let images = 0

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

      // 대표 이미지도 여기서 얻는다. 이 잡이 이미 카페별로 블로그를 부르므로
      // 추가 호출이 없고, 매일 돌면서 깨진 URL 이 자동으로 회복된다.
      const thumb = pickThumbnail({ docs: res.docs, cafeName: c.name })
      if (thumb && thumb !== c.imageUrl) {
        c.imageUrl = thumb
        images++
      }
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
  if (images > 0) await store.writeCafes(cafes)
  if (updated > 0) await recordSuccess(store, 'kakao-blog', now)
  return { updated, failed, dropped, images }
}
