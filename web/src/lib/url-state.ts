import { PAGE_CHUNK, type Sort } from './filter'
import type { VisitedSort } from './visited-sort'

/**
 * 목록 상태를 주소창에 싣는다.
 *
 * 이유는 하나다 — **뒤로가기.** 칩을 고르고 카페를 열었다가 돌아오면 고른
 * 것이 풀려 처음부터 다시 찾아야 했다. 상태가 주소에 있으면 브라우저가
 * 알아서 복원한다. 이번 주 탭은 `?p=` 로 이미 그렇게 돼 있었고, 나머지 두
 * 탭만 빠져 있었다.
 *
 * 키를 한 글자로 줄인 것은 주소를 카카오톡으로 주고받기 때문이다.
 */
export interface ListParams {
  /** 업소명 검색어 */
  q: string
  /** 고른 지역(시 단위). null 이면 전체 */
  area: string | null
  tags: string[]
  sort: Sort
  /** 도심(주차 C) 포함 */
  city: boolean
  /** NEW 만 */
  newOnly: boolean
  /** 다녀온 곳 정렬. 전체 탭에서는 쓰지 않는다 */
  visitedSort: VisitedSort
  /**
   * 전체 리스트에서 지금까지 펼친 카드 수.
   *
   * 주소에 싣는 이유는 하나 — 300곳까지 펼쳐 놓고 카페를 열었다 돌아왔을 때
   * 다시 60곳으로 접히면 보던 자리를 잃는다.
   */
  shown: number
}

export const EMPTY_PARAMS: ListParams = {
  q: '', area: null, tags: [], sort: 'hot', city: false, newOnly: false,
  visitedSort: { by: 'date', desc: true },
  shown: PAGE_CHUNK,
}

type Raw = Record<string, string | string[] | undefined>

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? ''

export function readListParams(raw: Raw): ListParams {
  const area = one(raw.a).trim()
  const tags = one(raw.t).split(',').map((s) => s.trim()).filter(Boolean)
  return {
    q: one(raw.q),
    area: area || null,
    tags,
    sort: one(raw.s) === 'near' || one(raw.s) === 'new' ? one(raw.s) as Sort : 'hot',
    city: one(raw.c) === '1',
    newOnly: one(raw.n) === '1',
    visitedSort: {
      by: one(raw.o).startsWith('rating') ? 'rating' : 'date',
      desc: !one(raw.o).endsWith('.asc'),
    },
    shown: shownFromParam(one(raw.v)),
  }
}

/** 이상한 값은 기본값으로. 청크 배수로 맞춰 화면과 주소가 어긋나지 않게 한다 */
function shownFromParam(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < PAGE_CHUNK) return PAGE_CHUNK
  return Math.ceil(Math.min(n, 100_000) / PAGE_CHUNK) * PAGE_CHUNK
}

/**
 * 기본값은 주소에 쓰지 않는다. 아무것도 안 고른 상태의 주소가 `/list` 로
 * 남아야 카카오톡에 붙일 때 지저분하지 않다.
 */
export function listParamsToQuery(p: ListParams): string {
  const sp = new URLSearchParams()
  if (p.q) sp.set('q', p.q)
  if (p.area) sp.set('a', p.area)
  if (p.tags.length) sp.set('t', p.tags.join(','))
  if (p.sort !== 'hot') sp.set('s', p.sort)
  if (p.city) sp.set('c', '1')
  if (p.newOnly) sp.set('n', '1')
  const vs = p.visitedSort
  if (vs.by !== 'date' || !vs.desc) sp.set('o', `${vs.by}.${vs.desc ? 'desc' : 'asc'}`)
  if (p.shown > PAGE_CHUNK) sp.set('v', String(p.shown))
  const s = sp.toString()
  return s ? `?${s}` : ''
}
