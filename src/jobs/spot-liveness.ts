import type { KakaoPlace } from '../sources/kakao-local.js'
import type { Spot } from '../spot-schema.js'
import type { SpotStore } from '../store/spot-json-store.js'
import { placeQuery } from '../pipeline/place-query.js'
import { recordFailure, recordSuccess } from '../sources/health.js'

/**
 * 아직 있는 곳인가 — 폐업 감지.
 *
 * 카페의 `jobs/liveness.ts` 를 그대로 옮긴 얇은 복사본이다 (일부러
 * 공용화하지 않았다 — 카페 폐업 감지 로직을 건드리지 않기 위해).
 * 동작 설명은 `jobs/liveness.ts` 참고.
 */

/** watch 잡이 "이 소스가 조용하다" 를 판단할 때 쓰는 이름. WEEKLY_SOURCES 에도 같은 값이 있다 */
export const SPOT_LIVENESS_SOURCE = 'kakao-local-liveness-spot'

export interface SpotLivenessDeps {
  store: Pick<SpotStore, 'readSpots' | 'writeSpots' | 'appendRaw'>
    & Pick<SpotStore, 'readHealth' | 'writeHealth'>
  local: { searchKeyword(query: string, page?: number): Promise<{ places: KakaoPlace[]; payload: unknown }> }
  now?: Date
}

export interface SpotLivenessResult {
  checked: number
  seen: number
  missing: number
  failed: number
  stale: { name: string; sigungu: string; days: number }[]
}

export const STALE_DAYS = 21

export function daysUnseen(s: Spot, now: Date): number | null {
  const at = s.lastSeenAt ?? null
  if (!at) return null
  return Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000)
}

export function staleSpots(rows: Spot[], now: Date, days = STALE_DAYS): Spot[] {
  return rows.filter((s) => {
    if (s.status !== 'active') return false
    const d = daysUnseen(s, now)
    return d !== null && d > days
  })
}

export async function runSpotLiveness(
  deps: SpotLivenessDeps,
  opts: { limit?: number } = {},
): Promise<SpotLivenessResult> {
  const { store, local, now = new Date() } = deps
  const spots = await store.readSpots()

  const targets = spots
    .filter((s) => s.status === 'active')
    .sort((a, b) => (a.lastSeenAt ?? '').localeCompare(b.lastSeenAt ?? ''))
    .slice(0, opts.limit ?? Infinity)

  let seen = 0
  let missing = 0
  let failed = 0

  for (const s of targets) {
    const query = placeQuery(s as never)
    try {
      const res = await local.searchKeyword(query, 1)
      await store.appendRaw(SPOT_LIVENESS_SOURCE, query, res.payload, now)
      if (res.places.some((p) => p.id === s.kakaoPlaceId)) {
        s.lastSeenAt = now.toISOString()
        seen++
      } else {
        missing++
      }
    } catch (e) {
      failed++
      await recordFailure(store, SPOT_LIVENESS_SOURCE, e, now)
    }
  }

  await store.writeSpots(spots)
  if (seen > 0) await recordSuccess(store, SPOT_LIVENESS_SOURCE, now)

  return {
    checked: targets.length, seen, missing, failed,
    stale: staleSpots(spots, now).map((s) => ({
      name: s.name, sigungu: s.sigungu, days: daysUnseen(s, now) ?? 0,
    })),
  }
}
