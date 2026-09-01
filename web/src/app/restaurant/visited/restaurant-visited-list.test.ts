import { describe, it, expect } from 'vitest'
import {
  filterRestaurantVisited, mergeRestaurantVisits, restaurantVisitedAreas, restaurantVisitedTags,
  type KnownRestaurant,
} from './restaurant-visited-list'
import type { SiteRestaurantVisited } from '@/lib/restaurant-site'

const built = (over: Partial<SiteRestaurantVisited> & { id: string }): SiteRestaurantVisited => ({
  name: `식당${over.id}`,
  sigungu: '양평군',
  area: '서울',
  visitedOn: '2026-05-01',
  note: '',
  tags: ['한식'],
  naverMapUrl: 'https://map.naver.com/p/search/x',
  imageUrl: null,
  ratingAvg: 0,
  ratingCount: 0,
  ...over,
})

const known = (ids: string[]): Map<string, KnownRestaurant> =>
  new Map(ids.map((id) => [id, {
    id,
    name: `식당${id}`,
    sigungu: '김포시',
    area: '인천',
    tags: ['한식', '고기구이'],
    naverMapUrl: 'https://map.naver.com/p/search/y',
    imageUrl: null,
  }]))

describe('mergeRestaurantVisits', () => {
  it('방금 누른 체크를 합친다', () => {
    // 합치지 않으면 다녀왔어요를 눌러도 이 탭은 다음 배치까지 비어 있다
    const rows = mergeRestaurantVisits(
      [], [{ kakaoPlaceId: '1', visitedOn: '2026-08-21' }], known(['1']),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.visitedOn).toBe('2026-08-21')
    expect(rows[0]!.sigungu).toBe('김포시')
  })

  it('실시간 기록에 없는 것은 취소된 것으로 본다', () => {
    // 빌드 타임 목록과 실시간 기록은 **같은 저장소**에서 나온다. 따라서
    // 실시간에 없다는 것은 취소되었다는 뜻이다. 합집합으로 두면 취소를 눌러도
    // 다음 배포까지 카드가 남는다 (실측 버그).
    const rows = mergeRestaurantVisits(
      [built({ id: 'old' })],
      [{ kakaoPlaceId: 'new', visitedOn: '2026-08-21' }],
      known(['new']),
    )
    expect(rows.map((r) => r.id)).toEqual(['new'])
  })

  it('같은 식당이면 더 최근 방문만 남긴다', () => {
    const rows = mergeRestaurantVisits(
      [built({ id: '1', visitedOn: '2026-05-01' })],
      [{ kakaoPlaceId: '1', visitedOn: '2026-08-21' }],
      known(['1']),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.visitedOn).toBe('2026-08-21')
  })

  it('최근 방문만 취소되면 그 이전 방문 날짜로 돌아간다', () => {
    // 취소는 가장 최근 1건만 지운다. 작년에 한 번 갔던 기록은 남아야 한다.
    const rows = mergeRestaurantVisits(
      [built({ id: '1', visitedOn: '2026-08-16' })],
      [{ kakaoPlaceId: '1', visitedOn: '2026-01-01' }],
      known(['1']),
    )
    expect(rows[0]!.visitedOn).toBe('2026-01-01')
  })

  it('게이트에서 빠진 식당도 기록은 남는다', () => {
    // known 에 없어도 빌드 타임 기록에 있으면 이름을 안다
    const rows = mergeRestaurantVisits(
      [built({ id: 'gone', name: '없어진식당' })],
      [{ kakaoPlaceId: 'gone', visitedOn: '2026-05-01' }],
      known([]),
    )
    expect(rows[0]!.name).toBe('없어진식당')
  })

  it('읽기가 실패하면 빌드 타임 기록을 지우지 않는다', () => {
    // 토큰이 없거나 GitHub 읽기가 실패하면 빈 배열이 온다. 그것을 믿으면
    // 가족에게는 기록이 통째로 지워진 것으로 보인다.
    const rows = mergeRestaurantVisits(
      [built({ id: 'a' }), built({ id: 'b' })], [], known([]), false,
    )
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('이름을 모르는 식당은 띄우지 않는다 (빈 카드를 만들지 않는다)', () => {
    const rows = mergeRestaurantVisits(
      [], [{ kakaoPlaceId: '없는곳', visitedOn: '2026-08-21' }], known([]),
    )
    expect(rows).toEqual([])
  })

  it('최근 방문이 위로 온다', () => {
    const rows = mergeRestaurantVisits(
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
    const rows = mergeRestaurantVisits(
      [],
      [{ kakaoPlaceId: '1', visitedOn: '2026-08-21', note: '고기가 맛있었다' }],
      known(['1']),
    )
    expect(rows[0]!.note).toBe('고기가 맛있었다')
  })

  it('빈 입력에서도 던지지 않는다', () => {
    expect(mergeRestaurantVisits([], [], new Map())).toEqual([])
  })
})

describe('다녀온 곳 필터', () => {
  const rows: SiteRestaurantVisited[] = [
    built({ id: '1', name: '몽탄', area: '김포시', tags: ['고기구이'] }),
    built({ id: '2', name: '스시노미야', area: '서울', tags: ['일식'] }),
    built({ id: '3', name: '경성면가', area: '김포시', tags: ['한식', '분식'] }),
  ]

  it('지역으로 거른다', () => {
    expect(filterRestaurantVisited(rows, { q: '', area: '김포시', tags: [] }).map((r) => r.id))
      .toEqual(['1', '3'])
  })

  it('한 글자 상호도 검색된다', () => {
    expect(filterRestaurantVisited(rows, { q: '몽', area: null, tags: [] }).map((r) => r.id))
      .toEqual(['1'])
  })

  it('태그는 AND 로 걸린다', () => {
    expect(filterRestaurantVisited(rows, { q: '', area: null, tags: ['한식', '분식'] })
      .map((r) => r.id)).toEqual(['3'])
  })

  it('있는 지역만 칩이 된다 — 빈 칩 서른 개는 장식이다', () => {
    expect(restaurantVisitedAreas(rows).map((a) => `${a.label}${a.count}`)).toEqual(['김포2', '서울1'])
  })

  it('기록에 붙어 있는 태그만 칩이 된다', () => {
    expect(restaurantVisitedTags(rows).map((t) => t.tag)).toEqual(['고기구이', '분식', '일식', '한식'])
  })
})
