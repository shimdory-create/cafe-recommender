import { SourceError } from './rate-limiter.js'
import type { Fetcher, Limiter } from './types.js'

export interface BlogDoc {
  /** HTML 태그·엔티티가 제거된 상태 */
  title: string
  /** HTML 태그·엔티티가 제거된 상태 */
  contents: string
  url: string
  blogName: string
  dateTime: Date
}

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

/**
 * 카카오는 검색어를 <b> 로 감싸서 준다. 관련성 판정 전에 벗긴다.
 * 이걸 놓치면 상호명 포함 여부 판정이 어긋난다.
 *
 * 태그를 먼저 지우고 엔티티를 되돌린다. 순서를 바꾸면 &lt;b&gt; 가
 * <b> 로 복원된 뒤 태그로 오인되어 지워진다.
 */
function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:lt|gt|amp|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
}

export function parseKakaoBlog(payload: unknown): { docs: BlogDoc[]; totalCount: number } {
  const p = payload as { documents?: unknown[]; meta?: { total_count?: number } } | null
  const raw = p?.documents
  if (!Array.isArray(raw)) return { docs: [], totalCount: 0 }

  const docs = raw.map((d) => {
    const r = (d ?? {}) as Record<string, string>
    return {
      title: clean(r.title ?? ''),
      contents: clean(r.contents ?? ''),
      url: r.url ?? '',
      blogName: clean(r.blogname ?? ''),
      dateTime: new Date(r.datetime ?? 0),
    }
  })
  return { docs, totalCount: p?.meta?.total_count ?? 0 }
}

export interface KakaoBlogSearchOptions {
  size?: number
  sort?: 'recency' | 'accuracy'
  page?: number
}

export interface KakaoBlogDeps {
  apiKey: string
  fetcher: Fetcher
  limit: Limiter
}

/**
 * 카카오(다음) 블로그 검색 어댑터. 네이버 검색 API 를 대체한다 (스펙 v3 6절).
 *
 * 다음 검색이 네이버 블로그를 충실히 색인하므로 네이버 블로그라는 신호를
 * 카카오라는 창구로 그대로 얻는다 (실측: 관련 문서의 대부분이 naver.com).
 *
 * 일일 쿼터: 카카오 콘솔 > 내 애플리케이션 > 쿼터 > 검색 에서 확인해야 한다.
 * 로컬 API 는 10만/일로 확인됐으나 검색 API 는 별도 쿼터일 수 있다.
 * 예상 사용량 약 1,500/일.
 */
export function createKakaoBlog(deps: KakaoBlogDeps) {
  const { apiKey, fetcher, limit } = deps

  return {
    name: 'kakao-blog' as const,

    async search(query: string, opts: KakaoBlogSearchOptions = {}) {
      const { size = 50, sort = 'recency', page = 1 } = opts
      const url =
        'https://dapi.kakao.com/v2/search/blog'
        + `?query=${encodeURIComponent(query)}&size=${size}&sort=${sort}&page=${page}`
      return limit(async () => {
        const res = await fetcher(url, { headers: { Authorization: `KakaoAK ${apiKey}` } })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new SourceError(`kakao-blog HTTP ${res.status}: ${body.slice(0, 200)}`, res.status)
        }
        const payload = await res.json()
        return { ...parseKakaoBlog(payload), payload }
      })
    },
  }
}
