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
  imageUrl: null,
  ratingAvg: 0,
  ratingCount: 0,
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
    imageUrl: null,
  }]))

describe('mergeVisits', () => {
  it('방금 누른 체크를 합친다', () => {
    // 합치지 않으면 다녀왔어요를 눌러도 이 탭은 다음 배치까지 비어 있다
    const rows = mergeVisits([], [{ kakaoPlaceId: '1', visitedOn: '2026-08-21' }], known(['1']))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.visitedOn).toBe('2026-08-21')
    expect(rows[0]!.sigungu).toBe('김포시')
  })

  it('실시간 기록에 없는 것은 취소된 것으로 본다', () => {
    // 빌드 타임 목록과 실시간 기록은 **같은 저장소**에서 나온다. 따라서
    // 실시간에 없다는 것은 취소되었다는 뜻이다. 합집합으로 두면 취소를 눌러도
    // 다음 배포까지 카드가 남는다 (실측 버그).
    const rows = mergeVisits(
      [built({ id: 'old' })],
      [{ kakaoPlaceId: 'new', visitedOn: '2026-08-21' }],
      known(['new']),
    )
    expect(rows.map((r) => r.id)).toEqual(['new'])
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

  it('최근 방문만 취소되면 그 이전 방문 날짜로 돌아간다', () => {
    // 취소는 가장 최근 1건만 지운다. 작년에 한 번 갔던 기록은 남아야 한다.
    const rows = mergeVisits(
      [built({ id: '1', visitedOn: '2026-08-16' })],
      [{ kakaoPlaceId: '1', visitedOn: '2026-01-01' }],
      known(['1']),
    )
    expect(rows[0]!.visitedOn).toBe('2026-01-01')
  })

  it('게이트에서 빠진 카페도 기록은 남는다', () => {
    // known 에 없어도 빌드 타임 기록에 있으면 이름을 안다
    const rows = mergeVisits(
      [built({ id: 'gone', name: '없어진카페' })],
      [{ kakaoPlaceId: 'gone', visitedOn: '2026-05-01' }],
      known([]),
    )
    expect(rows[0]!.name).toBe('없어진카페')
  })

  it('읽기가 실패하면 빌드 타임 기록을 지우지 않는다', () => {
    // 토큰이 없거나 GitHub 읽기가 실패하면 빈 배열이 온다. 그것을 믿으면
    // 가족에게는 기록이 통째로 지워진 것으로 보인다.
    const rows = mergeVisits([built({ id: 'a' }), built({ id: 'b' })], [], known([]), false)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
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
      [
        { kakaoPlaceId: 'a', visitedOn: '2026-03-01' },
        { kakaoPlaceId: 'b', visitedOn: '2026-08-01' },
        { kakaoPlaceId: 'c', visitedOn: '2026-06-01' },
      ],
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
