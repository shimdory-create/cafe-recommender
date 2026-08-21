import type { ListRow } from './site'

export type Sort = 'hot' | 'near'

/** 방향 구획. 파이프라인의 `src/config/zones.ts` 와 같은 값이다 */
export type ZoneId = 'near' | 'seoul' | 'north' | 'east' | 'south' | 'west'

export interface ZoneMeta {
  id: ZoneId
  label: string
}

/**
 * 화면에 보여줄 방향과 순서. 가까운 쪽부터.
 *
 * 파이프라인(`src/config/zones.ts`)이 각 카페에 `zone` 을 붙여 내려보내므로
 * 여기서는 이름만 안다. 배정 규칙이 두 곳에 생기지 않게 하려는 것이다.
 */
export const ZONES: ZoneMeta[] = [
  { id: 'near', label: '가까운 곳' },
  { id: 'seoul', label: '서울' },
  { id: 'west', label: '서쪽' },
  { id: 'north', label: '북쪽' },
  { id: 'east', label: '동쪽' },
  { id: 'south', label: '남쪽' },
]

export interface FilterState {
  tags: string[]
  sort: Sort
  /** 주차 C 카페까지 보여줄지 (스펙 7.3 도심 모드) */
  city: boolean
  /** 고른 방향. null 이면 전체 */
  zone?: ZoneId | null
}

/**
 * 전체 리스트의 필터·정렬. 순수 함수로 두어 테스트가 가능하게 한다.
 *
 * 칩 여러 개는 AND 다 — "대형카페 + 뷰맛집" 을 찾는 것이 자연스럽고,
 * OR 로 하면 칩을 늘릴수록 결과가 늘어나 필터의 의미가 사라진다.
 * 방향은 하나만 고른다 (라디오) — "북쪽 아니면 동쪽" 은 실제로 하는 결정이 아니다.
 */
export function filterAndSort<T extends ListRow>(cafes: T[], s: FilterState): T[] {
  const rows = cafes.filter((c) => {
    if (c.cityOnly && !s.city) return false
    if (s.zone && c.zone !== s.zone) return false
    return s.tags.every((t) => c.tags.includes(t))
  })

  return [...rows].sort((a, b) => {
    if (s.sort === 'near') {
      // 거리 미확인은 뒤로 보낸다. null 을 0 으로 취급하면 맨 앞에 온다.
      const da = a.driveMinutes ?? Number.POSITIVE_INFINITY
      const db = b.driveMinutes ?? Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return b.hotScore - a.hotScore
    }
    if (b.hotScore !== a.hotScore) return b.hotScore - a.hotScore
    return a.id.localeCompare(b.id)
  })
}

/** 방향별 개수. 칩에 숫자를 붙여 "눌러도 빈 화면" 을 막는다 */
export function zoneCounts<T extends ListRow>(
  cafes: T[],
  opts: { city: boolean },
): Record<ZoneId, number> {
  const out = { near: 0, seoul: 0, north: 0, east: 0, south: 0, west: 0 }
  for (const c of cafes) {
    if (c.cityOnly && !opts.city) continue
    out[c.zone] += 1
  }
  return out
}

export interface SigunguGroup<T> {
  sigungu: string
  rows: T[]
  /** 그 지역에서 가장 가까운 카페의 이동시간. 그룹 정렬 기준 */
  nearest: number
}

/**
 * 방향 안에서 **시군구별로** 묶는다. 원래 요청("구 단위로 모아 보기")이 여기서 충족된다.
 *
 * 방향을 고르지 않았을 때는 묶지 않는다 — 표시 대상 210곳이 43개 시군구에
 * 흩어져 있어 그대로 묶으면 1~2곳짜리 그룹이 17개 생긴다 (실측).
 *
 * 그룹 순서는 **가까운 지역부터**다. 차로 나가는 사람에게는 그게 순서다.
 * 이름 순으로 하면 "가평군" 이 "고양시" 앞에 오는데 거리는 두 배 차이다.
 */
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

/**
 * 방향에 어떤 지역이 들어 있는지 한 줄로. **데이터에서 계산한다.**
 *
 * 처음에는 고정 문자열이었는데 배정과 어긋났다 — '동쪽' 설명에 이천·여주가
 * 빠져 있어서 그 지역 카페를 찾는 사람은 동쪽을 눌러볼 이유가 없었다.
 * 곳수 많은 순으로 몇 개만 보여주고 나머지는 "등" 으로 줄인다.
 */
export function zoneHint<T extends ListRow>(
  cafes: T[],
  zone: ZoneId,
  opts: { city: boolean; top?: number },
): string {
  const count = new Map<string, number>()
  for (const c of cafes) {
    if (c.zone !== zone) continue
    if (c.cityOnly && !opts.city) continue
    count.set(c.sigungu, (count.get(c.sigungu) ?? 0) + 1)
  }
  const sorted = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const top = opts.top ?? 4
  const head = sorted.slice(0, top).map(([s]) => s).join('·')
  return sorted.length > top ? `${head} 등 ${sorted.length}개 지역` : head
}
