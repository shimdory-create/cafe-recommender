import { SourceError } from './rate-limiter.js'
import type { Fetcher, Limiter } from './types.js'

export interface KakaoPlace {
  id: string
  placeName: string
  categoryName: string
  addressName: string
  roadAddressName: string
  phone: string
  placeUrl: string
  lat: number
  lng: number
}

/**
 * 예상 못한 모양이 와도 던지지 않는다. 파서가 죽으면 파이프라인 전체가
 * 멈춘다 (스펙 6.6 우아한 저하).
 */
export function parseKakaoLocal(payload: unknown): KakaoPlace[] {
  const docs = (payload as { documents?: unknown[] } | null)?.documents
  if (!Array.isArray(docs)) return []
  return docs.map((d) => {
    const r = (d ?? {}) as Record<string, string>
    return {
      id: r.id ?? '',
      placeName: r.place_name ?? '',
      categoryName: r.category_name ?? '',
      addressName: r.address_name ?? '',
      roadAddressName: r.road_address_name ?? '',
      phone: r.phone ?? '',
      placeUrl: r.place_url ?? '',
      // 카카오는 x=경도, y=위도. 뒤집으면 카페가 서해에 뜬다.
      lat: Number(r.y),
      lng: Number(r.x),
    }
  })
}

export interface KakaoLocalDeps {
  apiKey: string
  fetcher: Fetcher
  limit: Limiter
}

export function createKakaoLocal(deps: KakaoLocalDeps) {
  const { apiKey, fetcher, limit } = deps

  async function call(url: string): Promise<unknown> {
    return limit(async () => {
      const res = await fetcher(url, { headers: { Authorization: `KakaoAK ${apiKey}` } })
      if (!res.ok) {
        // 서버 원문을 메시지에 담는다. Task 0 에서 403 의 원인을 특정한 것이
        // 바로 이 원문(App disabled OPEN_MAP_AND_LOCAL service.)이었다.
        const body = await res.text().catch(() => '')
        throw new SourceError(`kakao-local HTTP ${res.status}: ${body.slice(0, 200)}`, res.status)
      }
      return res.json()
    })
  }

  return {
    name: 'kakao-local' as const,

    /**
     * 키워드로 장소 검색. 페이지당 15건, 최대 3페이지(45건)가 카카오 상한이다
     * (실측: pageable_count 45). 이 상한 때문에 도심 전수 수집이 불가능해서
     * 그물 C(블로그 큐레이션)가 필요하다.
     */
    async searchKeyword(query: string, page: number) {
      const url =
        'https://dapi.kakao.com/v2/local/search/keyword.json'
        + `?query=${encodeURIComponent(query)}&size=15&page=${page}`
      const payload = await call(url)
      const isEnd = Boolean((payload as { meta?: { is_end?: boolean } })?.meta?.is_end)
      return { places: parseKakaoLocal(payload), isEnd, payload }
    },
  }
}
