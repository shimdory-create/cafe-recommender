import type { ListRow } from './site'

export type Sort = 'hot' | 'near'

/**
 * 지역 묶음의 짧은 이름. 파이프라인 `src/config/area.ts` 와 같은 규칙이다.
 *
 * 한 줄짜리 규칙을 옮겨 적는 편이, 웹에서 `src/` 를 import 해 Vercel 빌드를
 * 깨뜨리는 것보다 낫다 (그 실패는 두 번 겪었다 — `site-types.ts` 주석 참고).
 */
export function areaLabel(area: string): string {
  if (area === '서울' || area === '인천') return area
  return area.replace(/[시군]$/, '')
}

/** 서울은 늘 마지막이다 — "거의 안 간다" 는 것이 이 목록의 전제다 */
export const LAST_AREA = '서울'

/**
 * 검색어 정규화. 공백과 대소문자를 무시한다.
 *
 * `커피 앤 로스터`로 저장된 곳을 `커피앤`으로 찾을 수 있어야 한다. 한 글자
 * 상호가 실제로 있으므로(`콩`, `숲`) 최소 길이를 두지 않는다.
 */
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

export function matchesQuery(name: string, query: string): boolean {
  const q = norm(query)
  return q === '' || norm(name).includes(q)
}

export interface FilterState {
  tags: string[]
  sort: Sort
  /** 주차 C 카페까지 보여줄지 (스펙 7.3 도심 모드) */
  city: boolean
  /** 고른 지역(시 단위). null 이면 전체 */
  area?: string | null
  /** 업소명 검색어 */
  query?: string
  /** NEW 만 보기 */
  newOnly?: boolean
}

/**
 * 전체 리스트의 필터·정렬. 순수 함수로 두어 테스트가 가능하게 한다.
 *
 * 칩 여러 개는 AND 다 — "대형카페 + 뷰맛집" 을 찾는 것이 자연스럽고,
 * OR 로 하면 칩을 늘릴수록 결과가 늘어나 필터의 의미가 사라진다.
 * 지역은 하나만 고른다 (라디오) — "김포 아니면 파주" 는 실제로 하는 결정이 아니다.
 *
 * **NEW 는 정렬과 무관하게 맨 앞으로 띄운다.** 새로 들어온 곳을 보려고 목록을
 * 여는데 종합점수 순으로는 300번째에 있을 수 있다. 띄우되 NEW 안에서는
 * 고른 정렬 기준을 그대로 지킨다.
 */
export function filterAndSort<T extends ListRow>(cafes: T[], s: FilterState): T[] {
  const rows = cafes.filter((c) => {
    if (c.cityOnly && !s.city) return false
    if (s.area && c.area !== s.area) return false
    if (s.newOnly && !c.isNew) return false
    if (s.query && !matchesQuery(c.name, s.query)) return false
    return s.tags.every((t) => c.tags.includes(t))
  })

  const rank = (a: T, b: T) => {
    if (s.sort === 'near') {
      // 거리 미확인은 뒤로 보낸다. null 을 0 으로 취급하면 맨 앞에 온다.
      const da = a.driveMinutes ?? Number.POSITIVE_INFINITY
      const db = b.driveMinutes ?? Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return b.hotScore - a.hotScore
    }
    if (b.hotScore !== a.hotScore) return b.hotScore - a.hotScore
    return a.id.localeCompare(b.id)
  }

  return [...rows].sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1
    return rank(a, b)
  })
}

export interface AreaCount {
  area: string
  label: string
  count: number
  /** 그 지역에서 가장 가까운 카페의 이동시간. 칩 순서 기준 */
  nearest: number
}

/**
 * 지역별 개수. 칩에 숫자를 붙여 "눌러도 빈 화면" 을 막는다.
 *
 * 순서는 **가까운 지역부터**, 서울은 맨 뒤. 차로 나가는 사람에게는 그게
 * 순서다 — 이름 순으로 하면 가평(1시간 20분)이 고양(40분) 앞에 온다.
 */
export function areaCounts<T extends ListRow>(
  cafes: T[],
  opts: { city: boolean },
): AreaCount[] {
  const map = new Map<string, { count: number; nearest: number }>()
  for (const c of cafes) {
    if (c.cityOnly && !opts.city) continue
    const cur = map.get(c.area) ?? { count: 0, nearest: Number.POSITIVE_INFINITY }
    cur.count += 1
    cur.nearest = Math.min(cur.nearest, c.driveMinutes ?? Number.POSITIVE_INFINITY)
    map.set(c.area, cur)
  }
  return [...map.entries()]
    .map(([area, v]) => ({ area, label: areaLabel(area), count: v.count, nearest: v.nearest }))
    .sort((a, b) => {
      if ((a.area === LAST_AREA) !== (b.area === LAST_AREA)) return a.area === LAST_AREA ? 1 : -1
      if (a.nearest !== b.nearest) return a.nearest - b.nearest
      return a.area.localeCompare(b.area)
    })
}

/**
 * 서울·인천만 안에서 다시 가른다.
 *
 * 나머지 시군은 칩 하나가 곧 한 지역이라 더 쪼갤 것이 없다. 서울 175곳과
 * 인천 58곳은 한 덩어리로 두면 스크롤이 길어져서 구별로 묶는다.
 */
export const SPLIT_AREAS = new Set(['서울', '인천'])

export interface SigunguGroup<T> {
  sigungu: string
  rows: T[]
  /** 그 지역에서 가장 가까운 카페의 이동시간. 그룹 정렬 기준 */
  nearest: number
}

export function groupBySigungu<T extends ListRow>(rows: T[]): SigunguGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const list = map.get(r.sigungu)
    if (list) list.push(r)
    else map.set(r.sigungu, [r])
  }
  return [...map.entries()]
    .map(([sigungu, list]) => ({
      sigungu,
      rows: list,
      nearest: Math.min(...list.map((r) => r.driveMinutes ?? Number.POSITIVE_INFINITY)),
    }))
    .sort((a, b) => (a.nearest !== b.nearest
      ? a.nearest - b.nearest
      : a.sigungu.localeCompare(b.sigungu)))
}

/** 칩을 접었을 때 보여줄 개수. 두 줄에 들어가는 만큼 */
export const AREA_CHIPS_COLLAPSED = 8
