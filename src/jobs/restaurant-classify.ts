import { RESTAURANT_PROMPT_VERSION } from '../llm/prompts.js'
import { passesLayer2 } from '../pipeline/buzz.js'
import { extractRestaurantAttributes } from '../pipeline/restaurant-extract.js'
import { assignRestaurantTags } from '../pipeline/restaurant-tag.js'
import { passesHardGate } from '../pipeline/gate.js'
import { recordFailure, recordQuotaError, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
import type { BuzzSnapshot } from '../schema.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { LlmClient } from '../llm/types.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export interface RestaurantClassifyDeps {
  store: Pick<
    RestaurantStore,
    'readRestaurants' | 'writeRestaurants' | 'readRestaurantBuzz' | 'appendRaw'
    | 'readHealth' | 'writeHealth'
  >
  blog: {
    search: (
      q: string, o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  llm: LlmClient
  now?: Date
  /** 주입 가능 — 테스트에서 실제로 기다리지 않는다 */
  sleep?: (ms: number) => Promise<void>
}

export interface RestaurantClassifyResult {
  classified: number
  excluded: number
  skipped: number
  failed: number
  quotaExhausted: boolean
}

const QUOTA_GIVE_UP = 3
const FLUSH_EVERY = 20
const NEAR_SHARE = 0.3
/** 카페용 classify.ts 와 같은 이유(2026-09-29) — 실제 429를 맞으면 추가로 쉰다 */
const COOLDOWN_ON_QUOTA_ERROR_MS = 60_000
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function isStaleRestaurantExtraction(r: Restaurant): boolean {
  return r.attributes != null && !r.attributes.modelVersion.endsWith(`+${RESTAURANT_PROMPT_VERSION}`)
}

const driveOf = (r: Restaurant): number =>
  r.driveMinutes ?? r.driveMinutesEst ?? Number.POSITIVE_INFINITY

export function orderPendingRestaurants(
  pending: Restaurant[],
  latest: Map<string, BuzzSnapshot>,
  opts: { order: 'hot' | 'near' | 'file' | 'mixed'; limit?: number },
): Restaurant[] {
  const { order, limit } = opts
  if (order === 'file') return pending

  const rate = (r: Restaurant) => latest.get(r.kakaoPlaceId)?.postsPer30 ?? -1
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
  const out: Restaurant[] = []
  for (const r of byNear) {
    if (out.length >= nearQuota) break
    picked.add(r.kakaoPlaceId)
    out.push(r)
  }
  for (const r of byHot) {
    if (picked.has(r.kakaoPlaceId)) continue
    out.push(r)
  }
  return out
}

export async function runRestaurantClassify(
  deps: RestaurantClassifyDeps,
  opts: { limit?: number; redoStale?: boolean; order?: 'hot' | 'near' | 'file' | 'mixed' } = {},
): Promise<RestaurantClassifyResult> {
  const { store, blog, llm, now = new Date(), sleep = realSleep } = deps
  const restaurants = await store.readRestaurants()
  const buzz = await store.readRestaurantBuzz()

  const latest = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latest.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latest.set(b.kakaoPlaceId, b)
  }

  const stale = opts.redoStale ? restaurants.filter(isStaleRestaurantExtraction) : []
  const pending = restaurants.filter((r) => r.status === 'pending_extraction')
  const ordered = orderPendingRestaurants(pending, latest, {
    order: opts.order ?? 'mixed', limit: opts.limit,
  })
  const targets: Restaurant[] = [...stale, ...ordered].slice(0, opts.limit ?? Infinity)

  let classified = 0
  let excluded = 0
  let skipped = 0
  let failed = 0
  let quotaErrors = 0
  let quotaExhausted = false

  for (const [i, r] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeRestaurants(restaurants)
    try {
      const b = latest.get(r.kakaoPlaceId)
      if (!b) {
        skipped++
        continue
      }

      const l2 = passesLayer2(b, { now, driveMinutes: driveOf(r) })
      if (!l2.pass) {
        r.status = 'excluded_auto'
        r.excludeReason = l2.reason ?? 'Layer 2 탈락'
        excluded++
        continue
      }

      const parkingQuery = `${r.sigungu} ${r.name} 주차`
      const parkingRes = await blog.search(parkingQuery, { size: 10, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-parking-restaurant', parkingQuery, parkingRes.payload, now)

      const mainQuery = `${r.sigungu} ${r.name}`
      const mainRes = await blog.search(mainQuery, { size: 15, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-extract-restaurant', mainQuery, mainRes.payload, now)

      const attributes = await extractRestaurantAttributes({ llm, now }, {
        name: r.name, sigungu: r.sigungu, categoryName: r.categoryName ?? '',
        snippets: mainRes.docs.map((d) => `${d.title} ${d.contents}`),
        parkingSnippets: parkingRes.docs.map((d) => `${d.title} ${d.contents}`),
      })
      r.attributes = attributes
      r.tags = assignRestaurantTags(attributes)

      const gate = passesHardGate({ tags: r.tags, parkingGrade: attributes.parkingGrade })
      if (!gate.pass) {
        r.status = 'excluded_auto'
        r.excludeReason = gate.reason ?? 'Layer 5 탈락'
        excluded++
      } else {
        r.status = 'active'
        r.excludeReason = null
        classified++
      }
      quotaErrors = 0
    } catch (e) {
      failed++
      await recordFailure(store, 'classify-restaurant', e, now)
      if (e instanceof SourceError && e.status === 429) {
        await recordQuotaError(store, 'classify-restaurant', now)
        if (++quotaErrors >= QUOTA_GIVE_UP) {
          quotaExhausted = true
          break
        }
        await sleep(COOLDOWN_ON_QUOTA_ERROR_MS)
      } else {
        quotaErrors = 0
      }
    }
  }

  await store.writeRestaurants(restaurants)
  // targets 가 0곳이면 판정 대기 큐가 실제로 비어 있는 정상 상태다 — 카페와
  // 같은 이유로 구분한다 (jobs/classify.ts 참고, daily-watch 오탐 방지)
  if (targets.length === 0 || classified + excluded > 0) {
    await recordSuccess(store, 'classify-restaurant', now)
  }
  return { classified, excluded, skipped, failed, quotaExhausted }
}
