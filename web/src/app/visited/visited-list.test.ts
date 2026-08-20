import { describe, it, expect } from 'vitest'
import { mergeVisits, type KnownCafe } from './visited-list'
import type { SiteVisited } from '@/lib/site'

const built = (over: Partial<SiteVisited> & { id: string }): SiteVisited => ({
  name: `카페${over.id}`,
  sigungu: '양평군',
  visitedOn: '2026-05-01',
  note: '',
  tags: ['대형카페'],
  scale: '대형',
  naverMapUrl: 'https://map.naver.com/p/search/x',
  ...over,
})

const known = (ids: string[]): Map<string, KnownCafe> =>
  new Map(ids.map((id) => [id, {
    id,
    name: `카페${id}`,
    sigungu: '김포시',
    scale: '대형',
    tags: ['대형카페', '뷰맛집'],
    naverMapUrl: 'https://map.naver.com/p/search/y',
  }]))

describe('mergeVisits', () => {
  it('방금 누른 체크를 합친다', () => {
    // 합치지 않으면 다녀왔어요를 눌러도 이 탭은 다음 배치까지 비어 있다
    const rows = mergeVisits([], [{ kakaoPlaceId: '1', visitedOn: '2026-08-21' }], known(['1']))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.visitedOn).toBe('2026-08-21')
    expect(rows[0]!.sigungu).toBe('김포시')
  })

  it('빌드 타임 기록과 실시간 기록을 함께 보여준다', () => {
    const rows = mergeVisits(
      [built({ id: 'old' })],
      [{ kakaoPlaceId: 'new', visitedOn: '2026-08-21' }],
      known(['new']),
    )
    expect(rows.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('같은 카페면 더 최근 방문만 남긴다', () => {
    const rows = mergeVisits(
      [built({ id: '1', visitedOn: '2026-05-01' })],
      [{ kakaoPlaceId: '1', visitedOn: '2026-08-21' }],
      known(['1']),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.visitedOn).toBe('2026-08-21')
  })

  it('실시간 기록이 더 오래되면 무시한다', () => {
    const rows = mergeVisits(
      [built({ id: '1', visitedOn: '2026-08-16' })],
      [{ kakaoPlaceId: '1', visitedOn: '2026-01-01' }],
      known(['1']),
    )
    expect(rows[0]!.visitedOn).toBe('2026-08-16')
  })

  it('게이트에서 빠진 카페도 기록은 남는다', () => {
    // known 에 없어도 빌드 타임 기록에 있으면 이름을 안다
    const rows = mergeVisits([built({ id: 'gone', name: '없어진카페' })], [], known([]))
    expect(rows[0]!.name).toBe('없어진카페')
  })

  it('이름을 모르는 카페는 띄우지 않는다 (빈 카드를 만들지 않는다)', () => {
    const rows = mergeVisits([], [{ kakaoPlaceId: '없는곳', visitedOn: '2026-08-21' }], known([]))
    expect(rows).toEqual([])
  })

  it('최근 방문이 위로 온다', () => {
    const rows = mergeVisits(
      [
        built({ id: 'a', visitedOn: '2026-03-01' }),
        built({ id: 'b', visitedOn: '2026-08-01' }),
        built({ id: 'c', visitedOn: '2026-06-01' }),
      ],
      [],
      known([]),
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('메모를 실시간 기록에서도 가져온다', () => {
    const rows = mergeVisits(
      [],
      [{ kakaoPlaceId: '1', visitedOn: '2026-08-21', note: '빵이 맛있었다' }],
      known(['1']),
    )
    expect(rows[0]!.note).toBe('빵이 맛있었다')
  })

  it('빈 입력에서도 던지지 않는다', () => {
    expect(mergeVisits([], [], new Map())).toEqual([])
  })
})
