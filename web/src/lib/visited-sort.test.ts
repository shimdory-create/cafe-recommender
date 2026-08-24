import { describe, expect, it } from 'vitest'
import { nextSort, sortVisited, type VisitedSort } from './visited-sort'
import type { SiteVisited } from './site-types'

const row = (over: Partial<SiteVisited> & { id: string }): SiteVisited => ({
  name: `카페${over.id}`,
  sigungu: '김포시',
  area: '김포시',
  visitedOn: '2026-08-01',
  note: '',
  tags: [],
  scale: '대형',
  naverMapUrl: 'x',
  imageUrl: null,
  ratingAvg: 0,
  ratingCount: 0,
  ...over,
})

const ids = (rows: SiteVisited[], s: VisitedSort) => sortVisited(rows, s).map((r) => r.id)

describe('nextSort', () => {
  it('같은 기준을 다시 누르면 방향이 뒤집힌다', () => {
    expect(nextSort({ by: 'date', desc: true }, 'date')).toEqual({ by: 'date', desc: false })
    expect(nextSort({ by: 'date', desc: false }, 'date')).toEqual({ by: 'date', desc: true })
  })

  it('기준을 바꾸면 내림차순부터 시작한다', () => {
    expect(nextSort({ by: 'date', desc: false }, 'rating')).toEqual({ by: 'rating', desc: true })
  })
})

describe('sortVisited', () => {
  const rows = [
    row({ id: 'a', visitedOn: '2026-08-01', ratingAvg: 3, ratingCount: 1 }),
    row({ id: 'b', visitedOn: '2026-08-20', ratingAvg: 5, ratingCount: 2 }),
    row({ id: 'c', visitedOn: '2026-07-01', ratingAvg: 4, ratingCount: 1 }),
  ]

  it('날짜 내림차순이 기본이다', () => {
    expect(ids(rows, { by: 'date', desc: true })).toEqual(['b', 'a', 'c'])
  })

  it('날짜 오름차순은 오래된 것부터', () => {
    expect(ids(rows, { by: 'date', desc: false })).toEqual(['c', 'a', 'b'])
  })

  it('별점 내림차순', () => {
    expect(ids(rows, { by: 'rating', desc: true })).toEqual(['b', 'c', 'a'])
  })

  it('별점 오름차순', () => {
    expect(ids(rows, { by: 'rating', desc: false })).toEqual(['a', 'c', 'b'])
  })

  it('별점 없는 곳은 어느 방향에서도 뒤로 간다', () => {
    // 0점으로 취급하면 "낮은 별점순" 맨 앞이 전부 미평가가 된다.
    // 그건 낮은 평가가 아니라 아직 평가가 없는 것이다
    const withNone = [...rows, row({ id: 'none', visitedOn: '2026-09-01' })]
    expect(ids(withNone, { by: 'rating', desc: true }).at(-1)).toBe('none')
    expect(ids(withNone, { by: 'rating', desc: false }).at(-1)).toBe('none')
  })

  it('같은 별점이면 최근에 간 곳부터', () => {
    const tie = [
      row({ id: 'old', visitedOn: '2026-01-01', ratingAvg: 4, ratingCount: 1 }),
      row({ id: 'new', visitedOn: '2026-08-01', ratingAvg: 4, ratingCount: 1 }),
    ]
    expect(ids(tie, { by: 'rating', desc: true })).toEqual(['new', 'old'])
    expect(ids(tie, { by: 'rating', desc: false })).toEqual(['new', 'old'])
  })

  it('원본을 건드리지 않는다', () => {
    const copy = [...rows]
    sortVisited(rows, { by: 'rating', desc: true })
    expect(rows).toEqual(copy)
  })
})
