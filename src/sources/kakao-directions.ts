import { SourceError } from './rate-limiter.js'
import type { Limiter } from './types.js'

const BASE = 'https://apis-navi.kakaomobility.com/v1/directions'

export interface Coord {
  lat: number
  lng: number
}

export interface Route {
  minutes: number
  km: number
  /** 통행료(원). 나들이 판단에 쓸 수 있어 함께 보관한다 */
  tollWon: number | null
}

/**
 * 자동차 길찾기 응답을 파싱한다.
 *
 * `routes[0].result_code` 가 0 이 아니면 경로를 못 찾은 것이다(출발지가
 * 너무 가깝거나 도로가 없는 섬 등). 그 경우 던지지 않고 null 을 준다 —
 * 카페 한 곳의 경로 실패가 배치를 멈춰서는 안 된다 (스펙 6.6 원칙 1).
 */
export function parseDirections(payload: unknown): Route | null {
  const routes = (payload as { routes?: unknown[] } | null)?.routes
  if (!Array.isArray(routes) || routes.length === 0) return null

  const r = routes[0] as {
    result_code?: number
    summary?: { duration?: number; distance?: number; fare?: { toll?: number } }
  }
  if (typeof r?.result_code === 'number' && r.result_code !== 0) return null

  const duration = r?.summary?.duration
  const distance = r?.summary?.distance
  if (typeof duration !== 'number' || typeof distance !== 'number') return null

  return {
    minutes: Math.round(duration / 60),
    km: Number((distance / 1000).toFixed(1)),
    tollWon: typeof r.summary?.fare?.toll === 'number' ? r.summary.fare.toll : null,
  }
}

export interface DirectionsDeps {
  apiKey: string
  fetcher: typeof fetch
  limit: Limiter
}

/**
 * 카카오내비 자동차 길찾기 (무료 10,000건/일 — 2026-08-20 콘솔 확인).
 *
 * 직선거리 x 1.35 근사는 방향까지 틀린다: 강화 46분 추정 / 실측 64분,
 * 양평 104분 추정 / 실측 85분. 다리와 우회로 때문에 수도권에서는 근사가
 * 무너진다. **카페는 움직이지 않으므로 한 번 재서 영구 보관하면 된다.**
 */
export function createKakaoDirections(deps: DirectionsDeps) {
  const { apiKey, fetcher, limit } = deps

  return {
    async route(origin: Coord, dest: Coord): Promise<{ route: Route | null; payload: unknown }> {
      return limit(async () => {
        // 카카오는 경도,위도 순서다. 뒤집으면 엉뚱한 경로가 나온다.
        const url = `${BASE}?origin=${origin.lng},${origin.lat}`
          + `&destination=${dest.lng},${dest.lat}&priority=RECOMMEND&car_fuel=GASOLINE`
        const res = await fetcher(url, { headers: { Authorization: `KakaoAK ${apiKey}` } })
        const text = await res.text()
        if (!res.ok) {
          throw new SourceError(`kakao-directions ${res.status}: ${text.slice(0, 200)}`, res.status)
        }
        const payload: unknown = text ? JSON.parse(text) : null
        return { route: parseDirections(payload), payload }
      })
    },
  }
}
