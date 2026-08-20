import type { ListRow } from './site'

export type Sort = 'hot' | 'near'

export interface FilterState {
  tags: string[]
  sort: Sort
  /** 주차 C 카페까지 보여줄지 (스펙 7.3 도심 모드) */
  city: boolean
}

/**
 * 전체 리스트의 필터·정렬. 순수 함수로 두어 테스트가 가능하게 한다.
 *
 * 칩 여러 개는 AND 다 — "대형카페 + 뷰맛집" 을 찾는 것이 자연스럽고,
 * OR 로 하면 칩을 늘릴수록 결과가 늘어나 필터의 의미가 사라진다.
 */
export function filterAndSort<T extends ListRow>(cafes: T[], s: FilterState): T[] {
  const rows = cafes.filter((c) => {
    if (c.cityOnly && !s.city) return false
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
