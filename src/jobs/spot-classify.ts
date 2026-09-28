import { SPOT_PROMPT_VERSION } from '../llm/prompts.js'
import { passesLayer2 } from '../pipeline/buzz.js'
import { extractSpotAttributes } from '../pipeline/spot-extract.js'
import { assignSpotTags } from '../pipeline/spot-tag.js'
import { passesHardGate } from '../pipeline/gate.js'
import { isFoodCategory } from '../pipeline/spot-relevance.js'
import { recordFailure, recordQuotaError, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
import type { BuzzSnapshot } from '../schema.js'
import type { Spot } from '../spot-schema.js'
import type { LlmClient } from '../llm/types.js'
import type { SpotStore } from '../store/spot-json-store.js'

export interface SpotClassifyDeps {
  store: Pick<
    SpotStore,
    'readSpots' | 'writeSpots' | 'readSpotBuzz' | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: {
    search: (
      q: string, o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  llm: LlmClient
  now?: Date
}

export interface SpotClassifyResult {
  classified: number
  excluded: number
  skipped: number
  failed: number
  quotaExhausted: boolean
}

const QUOTA_GIVE_UP = 3
const FLUSH_EVERY = 20
const NEAR_SHARE = 0.3

export function isStaleSpotExtraction(s: Spot): boolean {
  return s.attributes != null && !s.attributes.modelVersion.endsWith(`+${SPOT_PROMPT_VERSION}`)
}

const driveOf = (s: Spot): number =>
  s.driveMinutes ?? s.driveMinutesEst ?? Number.POSITIVE_INFINITY

export function orderPendingSpots(
  pending: Spot[],
  latest: Map<string, BuzzSnapshot>,
  opts: { order: 'hot' | 'near' | 'file' | 'mixed'; limit?: number },
): Spot[] {
  const { order, limit } = opts
  if (order === 'file') return pending

  const rate = (s: Spot) => latest.get(s.kakaoPlaceId)?.postsPer30 ?? -1
  const byHot = [...pending].sort(
    (a, b) => rate(b) - rate(a) || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId),
  )
  if (order === 'hot') return byHot

  const byNear = [...pending].sort(
    (a, b) => driveOf(a) - driveOf(b) || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId),
  )
  if (order === 'near') return byNear

  if (!limit || limit >= pending.length) return byHot

  const nearQuota = Math.floor(limit * NEAR_SHARE)
  const picked = new Set<string>()
  const out: Spot[] = []
  for (const s of byNear) {
    if (out.length >= nearQuota) break
    picked.add(s.kakaoPlaceId)
    out.push(s)
  }
  for (const s of byHot) {
    if (picked.has(s.kakaoPlaceId)) continue
    out.push(s)
  }
  return out
}

export async function runSpotClassify(
  deps: SpotClassifyDeps,
  opts: { limit?: number; redoStale?: boolean; order?: 'hot' | 'near' | 'file' | 'mixed' } = {},
): Promise<SpotClassifyResult> {
  const { store, blog, llm, now = new Date() } = deps
  const spots = await store.readSpots()
  const buzz = await store.readSpotBuzz()

  const latest = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latest.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latest.set(b.kakaoPlaceId, b)
  }

  const stale = opts.redoStale ? spots.filter(isStaleSpotExtraction) : []
  const pending = spots.filter((s) => s.status === 'pending_extraction')
  const ordered = orderPendingSpots(pending, latest, {
    order: opts.order ?? 'mixed', limit: opts.limit,
  })
  const targets: Spot[] = [...stale, ...ordered].slice(0, opts.limit ?? Infinity)

  let classified = 0
  let excluded = 0
  let skipped = 0
  let failed = 0
  let quotaErrors = 0
  let quotaExhausted = false

  for (const [i, s] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeSpots(spots)
    try {
      const b = latest.get(s.kakaoPlaceId)
      if (!b) {
        skipped++
        continue
      }

      const l2 = passesLayer2(b, { now, driveMinutes: driveOf(s) })
      if (!l2.pass) {
        s.status = 'excluded_auto'
        s.excludeReason = l2.reason ?? 'Layer 2 탈락'
        excluded++
        continue
      }

      // discover 단계에서 걸러지지만, 그 전에 들어온 기존 데이터를 위한
      // 안전망 — 여기서 걸러야 블로그 검색·LLM 호출을 아낀다.
      if (isFoodCategory(s.categoryName)) {
        s.status = 'excluded_auto'
        s.excludeReason = '음식점으로 분류됨 (가볼 곳 아님)'
        excluded++
        continue
      }

      const parkingQuery = `${s.sigungu} ${s.name} 주차`
      const parkingRes = await blog.search(parkingQuery, { size: 10, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-parking-spot', parkingQuery, parkingRes.payload, now)

      const mainQuery = `${s.sigungu} ${s.name}`
      const mainRes = await blog.search(mainQuery, { size: 15, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-extract-spot', mainQuery, mainRes.payload, now)

      const attributes = await extractSpotAttributes({ llm, now }, {
        name: s.name, sigungu: s.sigungu, categoryName: s.categoryName ?? '',
        snippets: mainRes.docs.map((d) => `${d.title} ${d.contents}`),
        parkingSnippets: parkingRes.docs.map((d) => `${d.title} ${d.contents}`),
      })
      s.attributes = attributes
      s.tags = assignSpotTags(attributes)

      const gate = passesHardGate({ tags: s.tags, parkingGrade: attributes.parkingGrade })
      if (!gate.pass) {
        s.status = 'excluded_auto'
        s.excludeReason = gate.reason ?? 'Layer 5 탈락'
        excluded++
      } else {
        s.status = 'active'
        s.excludeReason = null
        classified++
      }
      quotaErrors = 0
    } catch (e) {
      failed++
      await recordFailure(store, 'classify-spot', e, now)
      if (e instanceof SourceError && e.status === 429) {
        await recordQuotaError(store, 'classify-spot', now)
        if (++quotaErrors >= QUOTA_GIVE_UP) {
          quotaExhausted = true
          break
        }
      } else {
        quotaErrors = 0
      }
    }
  }

  await store.writeSpots(spots)
  // targets 가 0곳이면 판정 대기 큐가 실제로 비어 있는 정상 상태다 — 카페와
  // 같은 이유로 구분한다 (jobs/classify.ts 참고, daily-watch 오탐 방지)
  if (targets.length === 0 || classified + excluded > 0) {
    await recordSuccess(store, 'classify-spot', now)
  }
  return { classified, excluded, skipped, failed, quotaExhausted }
}
