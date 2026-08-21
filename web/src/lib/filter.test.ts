import { describe, it, expect } from 'vitest'
import { filterAndSort, groupBySigungu, zoneCounts } from './filter'
import { driveLabel, recentlyVisited, type SiteCafe } from './site'

const cafe = (over: Partial<SiteCafe> & { id: string }): SiteCafe => ({
  name: `카페${over.id}`,
  sigungu: '양평군',
  zone: 'east',
  driveMinutes: 70,
  scale: '대형',
  parkingGrade: 'A',
  menuLevel: 3,
  tags: ['대형카페'],
  evidence: 'e',
  parkingEvidence: 'p',
  signatureMenu: null,
  viewTypes: [],
  mealTypes: [],
  outdoorSeating: null,
  teenAppeal: null,
  stayDuration: null,
  naverMapUrl: 'https://map.naver.com/p/search/x',
  kakaoPlaceUrl: null,
  imageUrl: null,
  hotScore: 50,
  finalScore: 25,
  postsPer30: 60,
  acceleration: 1.5,
  trend: 'steady',
  ratingAvg: 0,
  ratingCount: 0,
  cityOnly: false,
  visitedOn: null,
  ...over,
})

const base = { tags: [], sort: 'hot' as const, city: false }

describe('filterAndSort', () => {
  it('도심 전용은 기본으로 숨긴다', () => {
    const rows = filterAndSort([cafe({ id: 'a' }), cafe({ id: 'b', cityOnly: true })], base)
    expect(rows.map((c) => c.id)).toEqual(['a'])
  })

  it('도심 포함을 켜면 함께 보여준다', () => {
    const rows = filterAndSort(
      [cafe({ id: 'a' }), cafe({ id: 'b', cityOnly: true })],
      { ...base, city: true },
    )
    expect(rows).toHaveLength(2)
  })

  it('칩 여러 개는 AND 로 좁힌다', () => {
    // OR 이면 칩을 늘릴수록 결과가 늘어나 필터의 의미가 사라진다
    const rows = filterAndSort(
      [
        cafe({ id: 'both', tags: ['대형카페', '뷰맛집'] }),
        cafe({ id: 'one', tags: ['대형카페'] }),
      ],
      { ...base, tags: ['대형카페', '뷰맛집'] },
    )
    expect(rows.map((c) => c.id)).toEqual(['both'])
  })

  it('칩이 없으면 전부 보여준다', () => {
    expect(filterAndSort([cafe({ id: 'a' }), cafe({ id: 'b' })], base)).toHaveLength(2)
  })

  it('화제순은 내림차순이다', () => {
    const rows = filterAndSort(
      [cafe({ id: 'a', hotScore: 10 }), cafe({ id: 'b', hotScore: 90 })],
      base,
    )
    expect(rows.map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('화제도가 같으면 id 로 안정 정렬한다', () => {
    const rows = filterAndSort([cafe({ id: 'z' }), cafe({ id: 'a' })], base)
    expect(rows.map((c) => c.id)).toEqual(['a', 'z'])
  })

  it('가까운순은 이동시간 오름차순이다', () => {
    const rows = filterAndSort(
      [cafe({ id: 'far', driveMinutes: 90 }), cafe({ id: 'near', driveMinutes: 20 })],
      { ...base, sort: 'near' },
    )
    expect(rows.map((c) => c.id)).toEqual(['near', 'far'])
  })

  it('거리 미확인은 가까운순에서 뒤로 보낸다', () => {
    // null 을 0 으로 취급하면 맨 앞에 온다
    const rows = filterAndSort(
      [cafe({ id: 'unknown', driveMinutes: null }), cafe({ id: 'far', driveMinutes: 120 })],
      { ...base, sort: 'near' },
    )
    expect(rows.map((c) => c.id)).toEqual(['far', 'unknown'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const input = [cafe({ id: 'a', hotScore: 1 }), cafe({ id: 'b', hotScore: 9 })]
    filterAndSort(input, base)
    expect(input.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('빈 입력에서도 던지지 않는다', () => {
    expect(filterAndSort([], base)).toEqual([])
  })
})

describe('driveLabel', () => {
  it('한 시간 미만은 분으로 쓴다', () => {
    expect(driveLabel(21)).toBe('차로 21분')
  })

  it('한 시간 이상은 시간과 분으로 쓴다', () => {
    // "차로 104분" 은 감이 안 온다
    expect(driveLabel(104)).toBe('차로 1시간 44분')
    expect(driveLabel(120)).toBe('차로 2시간')
  })

  it('모르면 모른다고 쓴다', () => {
    expect(driveLabel(null)).toBe('거리 미확인')
  })
})

describe('recentlyVisited', () => {
  const now = new Date('2026-08-20T00:00:00Z')

  it('6개월 안이면 배지를 띄운다', () => {
    expect(recentlyVisited('2026-08-16', now)).toBe(true)
  })

  it('6개월이 지나면 띄우지 않는다', () => {
    expect(recentlyVisited('2025-01-01', now)).toBe(false)
  })

  it('기록이 없으면 띄우지 않는다', () => {
    expect(recentlyVisited(null, now)).toBe(false)
  })
})

describe('방향 묶음', () => {
  const rows = [
    cafe({ id: '1', sigungu: '양평군', zone: 'east', driveMinutes: 70 }),
    cafe({ id: '2', sigungu: '가평군', zone: 'east', driveMinutes: 80 }),
    cafe({ id: '3', sigungu: '남양주시', zone: 'east', driveMinutes: 55 }),
    cafe({ id: '4', sigungu: '파주시', zone: 'north', driveMinutes: 32 }),
    cafe({ id: '5', sigungu: '종로구', zone: 'seoul', driveMinutes: 45, cityOnly: true }),
    cafe({ id: '6', sigungu: '양평군', zone: 'east', driveMinutes: 65 }),
  ]

  it('고른 방향만 남긴다', () => {
    const out = filterAndSort(rows, { tags: [], sort: 'near', city: false, zone: 'east' })
    expect(out.map((r) => r.id)).toEqual(['3', '6', '1', '2'])
  })

  it('방향을 고르지 않으면 전체를 준다', () => {
    const out = filterAndSort(rows, { tags: [], sort: 'near', city: false, zone: null })
    expect(out).toHaveLength(5) // 도심전용 1곳 제외
  })

  it('방향과 태그는 함께 걸린다 (AND)', () => {
    const withTag = [...rows, cafe({ id: '7', zone: 'north', tags: ['대형카페', '뷰맛집'] })]
    const out = filterAndSort(withTag, {
      tags: ['뷰맛집'], sort: 'hot', city: false, zone: 'north',
    })
    expect(out.map((r) => r.id)).toEqual(['7'])
  })

  it('칩 숫자는 도심 포함 여부를 따른다 — 눌러도 빈 화면이 되지 않게', () => {
    expect(zoneCounts(rows, { city: false }).seoul).toBe(0)
    expect(zoneCounts(rows, { city: true }).seoul).toBe(1)
    expect(zoneCounts(rows, { city: false }).east).toBe(4)
  })

  it('시군구로 묶고 가까운 지역부터 놓는다', () => {
    const east = filterAndSort(rows, { tags: [], sort: 'near', city: false, zone: 'east' })
    const groups = groupBySigungu(east)
    expect(groups.map((g) => g.sigungu)).toEqual(['남양주시', '양평군', '가평군'])
    expect(groups[1]!.rows.map((r) => r.id)).toEqual(['6', '1'])
    expect(groups[0]!.nearest).toBe(55)
  })

  it('이동시간을 모르는 곳만 있는 지역은 뒤로 간다', () => {
    const groups = groupBySigungu([
      cafe({ id: 'a', sigungu: '미상군', driveMinutes: null }),
      cafe({ id: 'b', sigungu: '김포시', driveMinutes: 25 }),
    ])
    expect(groups.map((g) => g.sigungu)).toEqual(['김포시', '미상군'])
  })
})
