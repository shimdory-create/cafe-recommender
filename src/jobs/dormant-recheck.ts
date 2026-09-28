import { computeBuzz, passesLayer2, pickThumbnail } from '../pipeline/buzz.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { Store } from '../store/types.js'

/**
 * 화제 식음(dormant)으로 넘어간 카페를 2주에 한 번 다시 재서, 화제량이
 * 회복됐으면 active 로 되돌린다 (2026-09-28, "화제 식음 후보" 설계).
 *
 * daily-buzz 의 활성 회전에는 안 낀다 — 일부러다. dormant 는 매일 다시
 * 잴 이유가 없는 곳들이라, 여기 넣으면 상한제를 만든 목적(하루 재기록
 * 비용 억제)이 도로 무너진다. 대신 신규 발굴과 같은 격주 주기로, 이
 * 잡 하나가 dormant 전체를 훑는다 — 풀이 작아서(active 대비 훨씬 적음)
 * 격주에 한 번 전량을 봐도 비용 부담이 크지 않다.
 *
 * 통과하면 이미 뽑아둔 attributes·tags 를 그대로 쓴다 — LLM 재호출이
 * 없다. 화제량만 식었던 것이지 속성이 바뀐 게 아니라서다.
 */
export interface DormantRecheckDeps {
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

export interface DormantRecheckResult {
  checked: number
  recovered: number
  stillQuiet: number
  failed: number
}

export async function runDormantRecheck(
  deps: DormantRecheckDeps,
): Promise<DormantRecheckResult> {
  const { store, blog, now = new Date() } = deps
  const cafes = await store.readCafes()
  const rows = await store.readBuzz()
  const dormant = cafes.filter((c) => c.status === 'dormant')

  const capturedAt = now.toISOString().slice(0, 10)
  const driveOf = (c: { driveMinutes?: number | null; driveMinutesEst?: number | null }): number =>
    c.driveMinutes ?? c.driveMinutesEst ?? Number.POSITIVE_INFINITY
  let recovered = 0
  let stillQuiet = 0
  let failed = 0

  for (const c of dormant) {
    try {
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

      const l2 = passesLayer2(m, { now, driveMinutes: driveOf(c) })
      if (l2.pass) {
        c.status = 'active'
        c.excludeReason = null
        c.quietSince = null
        recovered++
      } else {
        stillQuiet++
      }

      const thumb = pickThumbnail({ docs: res.docs, cafeName: c.name })
      if (thumb && thumb !== c.imageUrl) c.imageUrl = thumb
    } catch (e) {
      failed++
      await recordFailure(store, 'kakao-blog', e, now)
    }
  }

  const latest = new Map<string, BuzzSnapshot>()
  for (const r of rows) {
    const prev = latest.get(r.kakaoPlaceId)
    if (!prev || r.capturedAt > prev.capturedAt) latest.set(r.kakaoPlaceId, r)
  }
  await store.writeBuzz([...latest.values()])
  if (dormant.length > 0) await store.writeCafes(cafes)
  if (dormant.length - failed > 0) await recordSuccess(store, 'kakao-blog', now)

  return { checked: dormant.length, recovered, stillQuiet, failed }
}
