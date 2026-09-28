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

/**
 * 하루에 다시 재는 활성 카페 수 (2026-09-28 도입).
 *
 * 그전엔 활성 카페 **전부**를 매일 쟀다 — "화면에 뜨는 곳이니 하루라도
 * 낡으면 그대로 보인다"는 판단이었다. 그런데 카페 수가 늘면서 이 잡 하나가
 * GitHub Actions 무료 한도(월 2,000분)를 갉아먹는 가장 큰 원인이 됐다
 * (식당판은 활성 4,200여 곳으로 늘면서 하루 20분대까지 커졌다 — 2026-09월
 * 한도 소진의 주원인). 1,600 은 지금 활성 카페 수(~1,550)보다 넉넉히 커서
 * **당장은 매일 전부 재는 것과 동일**하지만, 앞으로 카페가 계속 늘어도
 * 하루 비용이 여기서 더 안 커지게 막아 둔 상한이다. 카페 수가 이 값을
 * 넘어서면 오래 안 잰 곳부터 도는 회전제로 자연스럽게 전환된다.
 */
export const ACTIVE_PER_DAY = 1600

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
  /** 매일 재는 추천 대상 수 */
  active: number
  /** 오늘 회전분으로 잡힌 판정 대기 수 */
  rotated: number
}

/**
 * 카페별 화제량을 재수집해 buzz.json 을 갱신한다.
 *
 * 카페 하나가 실패해도 나머지를 계속한다. health 에 기록만 남긴다.
 */
export async function runDailyBuzz(
  deps: DailyBuzzDeps,
  opts: { limit?: number; pendingPerDay?: number; activePerDay?: number } = {},
): Promise<DailyBuzzResult> {
  const { store, blog, now = new Date() } = deps
  const cafes = await store.readCafes()
  const rows = await store.readBuzz()

  // 한 번도 안 잰 곳이 가장 먼저다 ('' 가 어떤 날짜보다 작다). active·pending
  // 둘 다 이 기준으로 회전한다 — active 도 더 이상 무조건 전부는 아니다
  // (2026-09-28, ACTIVE_PER_DAY 주석 참고).
  const measuredAt = new Map(rows.map((r) => [r.kakaoPlaceId, r.capturedAt]))
  const byStaleness = (x: { kakaoPlaceId: string }, y: { kakaoPlaceId: string }) =>
    (measuredAt.get(x.kakaoPlaceId) ?? '').localeCompare(measuredAt.get(y.kakaoPlaceId) ?? '')

  // 화면에 보이는 카페(active)는 오래 안 잰 곳부터 하루 ACTIVE_PER_DAY 개씩
  // 돈다. 순위와 대표 이미지가 여기서 나오므로 완전히 방치하지는 않되,
  // 카페 수가 늘어도 하루 비용은 여기서 더 안 커진다.
  const active = cafes
    .filter((c) => c.status === 'active')
    .sort(byStaleness)
    .slice(0, opts.activePerDay ?? ACTIVE_PER_DAY)

  // 판정 대기는 **돌려가며** 잰다. 화면에 뜨지 않는 5,000곳을 매일 재는 것은
  // 순수한 낭비였다 — 카카오 호출 5,900회/일, Actions 18분/일. 대기 카페의
  // 화제량은 "판정 우선순위" 에만 쓰이므로 주 1회면 충분하다.
  //
  // 가장 오래된 것부터 고른다. 그러면 전체가 PENDING_PER_DAY 주기로 한 바퀴 돈다.
  //
  // **같은 날짜 안에서는 가까운 곳부터** 잰다. 한 번도 안 잰 곳이 하루 몫보다
  // 많으면 그 안에서 순서가 결과를 가른다. id 순으로 두었더니 영종구 66곳이
  // 몇 주째 미측정으로 남았고, 화제량이 없으면 판정 자체가 보류된다 —
  // 순서를 앞당겨도(11.5) 잴 것이 없어 넘어간다.
  const pending = cafes
    .filter((c) => c.status === 'pending_extraction')
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
  const activeTargets = targets.filter((c) => c.status === 'active').length
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
  return {
    updated, failed, dropped, images,
    active: activeTargets,
    rotated: targets.length - activeTargets,
  }
}
