import type { SiteVisited } from './site-types'

/**
 * 다녀온 곳 정렬.
 *
 * 두 가지 질문에 답한다 — "언제 갔더라" 와 **"어디가 제일 좋았더라"**.
 * 뒤쪽이 이 탭의 진짜 쓸모다. 기록이 스물한 곳을 넘어가면 "또 갈 만한 곳"
 * 을 눈으로 찾기 어렵다.
 *
 * 같은 기준을 다시 누르면 방향이 뒤집힌다. 화살표로 방향을 보여준다.
 */
export interface VisitedSort {
  by: 'date' | 'rating'
  desc: boolean
}

/** 다음 상태. 같은 기준이면 방향만 뒤집고, 바꾸면 그 기준의 기본 방향으로 */
export function nextSort(cur: VisitedSort, by: VisitedSort['by']): VisitedSort {
  return cur.by === by ? { by, desc: !cur.desc } : { by, desc: true }
}

/**
 * 별점이 없는 곳은 **어느 방향에서도 뒤로 보낸다.**
 *
 * 0점으로 취급하면 "낮은 별점순" 의 맨 앞이 전부 별점 없는 곳이 된다.
 * 그건 낮은 평가가 아니라 아직 평가가 없는 것이다.
 */
export function sortVisited(rows: SiteVisited[], s: VisitedSort): SiteVisited[] {
  const dir = s.desc ? 1 : -1
  return [...rows].sort((a, b) => {
    if (s.by === 'rating') {
      const ra = a.ratingCount > 0, rb = b.ratingCount > 0
      if (ra !== rb) return ra ? -1 : 1
      if (a.ratingAvg !== b.ratingAvg) return (b.ratingAvg - a.ratingAvg) * dir
      // 같은 별점이면 최근에 간 곳부터. 순서가 흔들리지 않게 id 로 마무리한다
      return b.visitedOn.localeCompare(a.visitedOn) || a.id.localeCompare(b.id)
    }
    return b.visitedOn.localeCompare(a.visitedOn) * dir || a.id.localeCompare(b.id)
  })
}

export const SORT_LABEL: Record<VisitedSort['by'], string> = {
  date: '다녀온 날',
  rating: '별점',
}
