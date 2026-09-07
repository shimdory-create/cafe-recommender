/**
 * filter.ts 의 함수들이 실제로 쓰는 필드만 요구한다. 원래는 카페의 ListRow
 * 전체를 요구했는데, 식당의 RestaurantListRow 에는 없는 scale/menuLevel(카페
 * 전용 개념)까지 강제하고 있었다 — 이 파일 어디도 그 두 필드를 읽지 않는다.
 * 좁혀도 ListRow 는 이 인터페이스를 구조적으로 만족하므로 카페 쪽은 동작이
 * 그대로다.
 */
export interface FilterableRow {
  id: string
  name: string
  sigungu: string
  area: string
  driveMinutes: number | null
  tags: string[]
  hotScore: number
  cityOnly: boolean
  isNew: boolean
  firstSeenAt: string
}

export type Sort = 'hot' | 'near' | 'new'

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
 * NEW 를 정렬과 무관하게 맨 앞으로 띄우던 로직은 뺐다(2026-09-08) — 최신순
 * 정렬 버튼이 생긴 뒤로는 필요 없어졌고, 오히려 칩을 여러 개 걸었을 때
 * "가까운순을 골랐는데 순서가 이상하다" 는 착시를 만들었다 — NEW 최대 10곳이
 * 실제 거리와 무관하게 맨 위를 차지했기 때문이다. NEW 만 보고 싶으면
 * NEW 칩을 누르면 된다(그 안에서도 고른 정렬 기준을 그대로 따른다).
 */
/** filterAndSort 의 필터링 부분만. 정렬 없이 개수만 필요할 때 정렬 비용을 안 낸다 */
function filterRows<T extends FilterableRow>(cafes: T[], s: FilterState): T[] {
  return cafes.filter((c) => {
    if (c.cityOnly && !s.city) return false
    if (s.area && c.area !== s.area) return false
    if (s.newOnly && !c.isNew) return false
    if (s.query && !matchesQuery(c.name, s.query)) return false
    return s.tags.every((t) => c.tags.includes(t))
  })
}

/**
 * 배지 숫자용. filterAndSort 와 같은 필터 조건을 쓰되 정렬은 건너뛴다 —
 * 숫자만 필요한 곳에서 매번 정렬까지 하면 리스트가 클 때 낭비다.
 */
export function countMatching<T extends FilterableRow>(cafes: T[], s: FilterState): number {
  return filterRows(cafes, s).length
}

export function filterAndSort<T extends FilterableRow>(cafes: T[], s: FilterState): T[] {
  const rows = filterRows(cafes, s)

  const rank = (a: T, b: T) => {
    if (s.sort === 'near') {
      // 거리 미확인은 뒤로 보낸다. null 을 0 으로 취급하면 맨 앞에 온다.
      const da = a.driveMinutes ?? Number.POSITIVE_INFINITY
      const db = b.driveMinutes ?? Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return b.hotScore - a.hotScore
    }
    if (s.sort === 'new') return byNewest(a, b)
    if (b.hotScore !== a.hotScore) return b.hotScore - a.hotScore
    return a.id.localeCompare(b.id)
  }

  return [...rows].sort(rank)
}

/** 최근에 등록된 것부터. 같으면 순서가 흔들리지 않게 id 로 마무리한다 */
function byNewest<T extends FilterableRow>(a: T, b: T): number {
  return b.firstSeenAt.localeCompare(a.firstSeenAt) || a.id.localeCompare(b.id)
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
 *
 * `city` 외의 다른 활성 필터(태그·검색어·NEW)도 함께 받는다 — 안 받으면
 * 칩 숫자가 실제 눌렀을 때 나오는 결과와 어긋난다 (실측: 지역 미선택 상태에서
 * 태그를 고르면 칩 숫자만 그대로라 클릭하면 배지보다 적게 나왔다).
 */
export function areaCounts<T extends FilterableRow>(
  cafes: T[],
  opts: { city: boolean; tags?: string[]; query?: string; newOnly?: boolean },
): AreaCount[] {
  const map = new Map<string, { count: number; nearest: number }>()
  for (const c of cafes) {
    if (c.cityOnly && !opts.city) continue
    if (opts.newOnly && !c.isNew) continue
    if (opts.query && !matchesQuery(c.name, opts.query)) continue
    if (opts.tags && !opts.tags.every((t) => c.tags.includes(t))) continue
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

export function groupBySigungu<T extends FilterableRow>(rows: T[]): SigunguGroup<T>[] {
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

/**
 * 전체 리스트에서 한 번에 그리는 카드 수.
 *
 * 처음에는 전량을 그렸다 — "통과분이 수백 곳이라 전량 렌더가 더 빠르고
 * 코드도 없다" 는 판단이었다. 그 전제가 깨졌다. 판정이 밀린 것을 따라잡으며
 * 297 -> 1,035곳이 됐고, 실측으로:
 *
 * ```
 * 카드 664개 · DOM 노드 15,557개 · HTML 2.1MB · 로드 2.5초 (데스크톱 유선)
 * ```
 *
 * 모바일에서는 이보다 훨씬 느리고, 아직 판정 대기가 2,200곳 남아 있어 계속
 * 커진다. 검색과 칩으로 좁히면 대개 이 수 아래라 버튼은 잘 보이지 않는다.
 */
export const PAGE_CHUNK = 60
