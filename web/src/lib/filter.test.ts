import { describe, it, expect } from 'vitest'
import {
  areaCounts, areaLabel, countMatching, filterAndSort, groupBySigungu, matchesQuery, scoreRankMap,
  sigunguCountsByArea, toggleAreaSelection,
  type FilterState,
} from './filter'
import { driveLabel, hiddenByVisit, recentlyVisited, type SiteCafe } from './site'

const cafe = (over: Partial<SiteCafe> & { id: string }): SiteCafe => ({
  name: `카페${over.id}`,
  sigungu: '양평군',
  zone: 'east',
  area: '양평군',
  driveMinutes: 70,
  lat: 37.5,
  lng: 127.0,
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
  posts30: 40,
  posts90: 150,
  acceleration: 1.5,
  trend: 'steady',
  ratingAvg: 0,
  ratingCount: 0,
  familyReviews: [],
  cityOnly: false,
  visitedOn: null,
  firstSeenAt: '2026-08-20T00:00:00.000Z',
  isNew: false,
  lastSeenAt: null,
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

  it('화제·거리순(final)은 종합점수 내림차순이다', () => {
    const rows = filterAndSort(
      [cafe({ id: 'a', finalScore: 10 }), cafe({ id: 'b', finalScore: 90 })],
      { ...base, sort: 'final' },
    )
    expect(rows.map((c) => c.id)).toEqual(['b', 'a'])
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

describe('scoreRankMap — 배지용 종합순위(정렬 기준과 무관하게 고정)', () => {
  it('종합점수 내림차순으로 1위부터 매긴다', () => {
    const map = scoreRankMap([
      cafe({ id: 'low', finalScore: 5 }),
      cafe({ id: 'high', finalScore: 90 }),
      cafe({ id: 'mid', finalScore: 40 }),
    ])
    expect(map.get('high')).toBe(1)
    expect(map.get('mid')).toBe(2)
    expect(map.get('low')).toBe(3)
  })

  it('점수가 같으면 id 로 안정 정렬한다', () => {
    const map = scoreRankMap([
      cafe({ id: 'z', finalScore: 10 }),
      cafe({ id: 'a', finalScore: 10 }),
    ])
    expect(map.get('a')).toBe(1)
    expect(map.get('z')).toBe(2)
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
  it('다녀온 적 있으면 언제든 배지를 띄운다', () => {
    expect(recentlyVisited('2026-08-16')).toBe(true)
    expect(recentlyVisited('2020-01-01')).toBe(true)
  })

  it('기록이 없으면 띄우지 않는다', () => {
    expect(recentlyVisited(null)).toBe(false)
  })
})

describe('지역 묶음 (시 단위)', () => {
  const rows = [
    cafe({ id: '1', sigungu: '양평군', area: '양평군', driveMinutes: 70 }),
    cafe({ id: '2', sigungu: '가평군', area: '가평군', driveMinutes: 80 }),
    cafe({ id: '3', sigungu: '남양주시', area: '남양주시', driveMinutes: 55 }),
    cafe({ id: '4', sigungu: '파주시', area: '파주시', driveMinutes: 32 }),
    cafe({ id: '5', sigungu: '종로구', area: '서울', driveMinutes: 45, cityOnly: true }),
    cafe({ id: '6', sigungu: '양평군', area: '양평군', driveMinutes: 65 }),
  ]

  it('고른 지역만 남긴다', () => {
    const out = filterAndSort(rows, { tags: [], sort: 'near', city: false, area: ['양평군'] })
    expect(out.map((r) => r.id)).toEqual(['6', '1'])
  })

  it('지역을 여러 개 고르면 OR 로 걸린다 — 한 카페는 지역을 하나만 가지므로 AND 는 늘 0곳이 된다', () => {
    const out = filterAndSort(rows, { tags: [], sort: 'near', city: false, area: ['양평군', '파주시'] })
    expect(out.map((r) => r.id)).toEqual(['4', '6', '1'])
  })

  it('지역을 고르지 않으면 전체를 준다', () => {
    const out = filterAndSort(rows, { tags: [], sort: 'near', city: false, area: [] })
    expect(out).toHaveLength(5) // 도심전용 1곳 제외
  })

  it('매크로 칩을 펼쳐서 고른 시군구로도 걸린다', () => {
    // area 배열엔 매크로(서울/인천/경기)와 그 안의 시군구가 섞여 들어올 수
    // 있다 — 매크로 자체가 아니라 구체적인 구/시로 좁힌 경우다
    const incheon = [
      cafe({ id: 'a', area: '인천', sigungu: '부평구', driveMinutes: 10 }),
      cafe({ id: 'b', area: '인천', sigungu: '연수구', driveMinutes: 25 }),
    ]
    const out = filterAndSort(incheon, { tags: [], sort: 'near', city: false, area: ['부평구'] })
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('지역과 태그는 함께 걸린다 (AND)', () => {
    const withTag = [...rows, cafe({ id: '7', area: '파주시', tags: ['대형카페', '뷰맛집'] })]
    const out = filterAndSort(withTag, {
      tags: ['뷰맛집'], sort: 'hot', city: false, area: ['파주시'],
    })
    expect(out.map((r) => r.id)).toEqual(['7'])
  })

  it('칩 숫자는 도심 포함 여부를 따른다 — 눌러도 빈 화면이 되지 않게', () => {
    const off = areaCounts(rows, { city: false })
    const on = areaCounts(rows, { city: true })
    expect(off.find((a) => a.area === '서울')).toBeUndefined()
    expect(on.find((a) => a.area === '서울')!.count).toBe(1)
    expect(off.find((a) => a.area === '양평군')!.count).toBe(2)
  })

  it('칩은 가까운 지역부터, 서울은 맨 뒤', () => {
    // 서울(45분)이 남양주(55분)보다 가까워도 뒤로 간다 — 거의 안 가는 곳이다
    const out = areaCounts(rows, { city: true })
    expect(out.map((a) => a.area)).toEqual(
      ['파주시', '남양주시', '양평군', '가평군', '서울'],
    )
  })

  it('칩 이름은 접미사를 줄인다', () => {
    expect(areaCounts(rows, { city: false }).map((a) => a.label))
      .toEqual(['파주', '남양주', '양평', '가평'])
  })

  it('서울·인천 안에서는 구별로 묶고 가까운 지역부터 놓는다', () => {
    const east = filterAndSort(
      [...rows, cafe({ id: '8', sigungu: '가평군', area: '가평군', driveMinutes: 90 })],
      { tags: [], sort: 'near', city: false, area: [] },
    )
    const groups = groupBySigungu(east)
    expect(groups.map((g) => g.sigungu)).toEqual(['파주시', '남양주시', '양평군', '가평군'])
    expect(groups[2]!.rows.map((r) => r.id)).toEqual(['6', '1'])
    expect(groups[1]!.nearest).toBe(55)
  })

  it('이동시간을 모르는 곳만 있는 지역은 뒤로 간다', () => {
    const groups = groupBySigungu([
      cafe({ id: 'a', sigungu: '미상군', driveMinutes: null }),
      cafe({ id: 'b', sigungu: '김포시', driveMinutes: 25 }),
    ])
    expect(groups.map((g) => g.sigungu)).toEqual(['김포시', '미상군'])
  })
})

describe('sigunguCountsByArea — 매크로 지역칩을 펼쳤을 때의 시군구별 개수', () => {
  const rows = [
    cafe({ id: '1', area: '인천', sigungu: '부평구', driveMinutes: 10 }),
    cafe({ id: '2', area: '인천', sigungu: '부평구', driveMinutes: 15 }),
    cafe({ id: '3', area: '인천', sigungu: '연수구', driveMinutes: 25 }),
    cafe({ id: '4', area: '경기', sigungu: '파주시', driveMinutes: 40, cityOnly: true }),
    cafe({ id: '5', area: '경기', sigungu: '수원시', driveMinutes: 50 }),
  ]

  it('매크로별로 시군구를 나눈다', () => {
    const byArea = sigunguCountsByArea(rows, { city: true })
    expect(byArea['인천']!.map((s) => s.area)).toEqual(['부평구', '연수구'])
    expect(byArea['인천']!.find((s) => s.area === '부평구')!.count).toBe(2)
    expect(byArea['경기']!.map((s) => s.area)).toEqual(['파주시', '수원시'])
  })

  it('가까운 시군구부터 놓는다', () => {
    const byArea = sigunguCountsByArea(rows, { city: true })
    expect(byArea['경기']!.map((s) => s.area)).toEqual(['파주시', '수원시'])
  })

  it('도심 전용은 areaCounts 와 같은 기준으로 뺀다', () => {
    const byArea = sigunguCountsByArea(rows, { city: false })
    expect(byArea['경기']!.map((s) => s.area)).toEqual(['수원시'])
  })

  it('시군구 이름도 접미사를 줄인다', () => {
    const byArea = sigunguCountsByArea(rows, { city: true })
    expect(byArea['인천']!.find((s) => s.area === '부평구')!.label).toBe('부평')
  })
})

describe('toggleAreaSelection — 매크로/시군구 칩이 섞여도 꼬이지 않게', () => {
  const sub = {
    인천: [{ area: '부평구', label: '부평', count: 2, nearest: 10 }],
    경기: [{ area: '파주시', label: '파주', count: 1, nearest: 40 }],
  }

  it('매크로를 고르면 그 안의 시군구 선택은 지운다', () => {
    expect(toggleAreaSelection(['부평구'], '인천', sub)).toEqual(['인천'])
  })

  it('시군구를 고르면 그 매크로 선택은 지운다', () => {
    expect(toggleAreaSelection(['인천'], '부평구', sub)).toEqual(['부평구'])
  })

  it('이미 고른 것을 다시 누르면 뺀다', () => {
    expect(toggleAreaSelection(['인천'], '인천', sub)).toEqual([])
    expect(toggleAreaSelection(['부평구'], '부평구', sub)).toEqual([])
  })

  it('다른 매크로·시군구 선택은 그대로 둔다 — OR 다중 선택', () => {
    expect(toggleAreaSelection(['경기'], '인천', sub)).toEqual(['경기', '인천'])
    expect(toggleAreaSelection(['파주시'], '부평구', sub)).toEqual(['파주시', '부평구'])
  })
})

describe('업소명 검색', () => {
  it('한 글자도 찾는다 — 한 글자 상호가 실제로 있다', () => {
    expect(matchesQuery('콩', '콩')).toBe(true)
    expect(matchesQuery('콩카페', '콩')).toBe(true)
  })

  it('공백과 대소문자를 무시한다', () => {
    expect(matchesQuery('커피 앤 로스터', '커피앤')).toBe(true)
    expect(matchesQuery('Bread Lab', 'breadlab')).toBe(true)
  })

  it('빈 검색어는 모두 통과시킨다', () => {
    expect(matchesQuery('아무거나', '')).toBe(true)
  })

  it('목록에 걸린다', () => {
    const rows = [
      cafe({ id: '1', name: '테라로사' }),
      cafe({ id: '2', name: '앤트러사이트' }),
    ]
    const out = filterAndSort(rows, { tags: [], sort: 'hot', city: false, query: '로사' })
    expect(out.map((r) => r.id)).toEqual(['1'])
  })
})

describe('NEW', () => {
  it('더 이상 정렬을 무시하고 맨 앞으로 띄우지 않는다 — 최신순 버튼이 그 역할이다', () => {
    // 예전에는 NEW 최대 10곳을 정렬과 무관하게 맨 앞에 꽂았다. 그러면
    // "가까운순" 을 골라도 방금 등록된 먼 카페가 가장 가까운 카페보다
    // 위에 뜨는 착시가 생겼다 — 이제는 고른 정렬 기준을 그대로 따른다.
    const rows = [
      cafe({ id: '1', hotScore: 90, driveMinutes: 20 }),
      cafe({ id: '2', hotScore: 10, driveMinutes: 99, isNew: true }),
      cafe({ id: '3', hotScore: 50, driveMinutes: 30 }),
    ]
    expect(filterAndSort(rows, { tags: [], sort: 'hot', city: false }).map((r) => r.id))
      .toEqual(['1', '3', '2'])
    expect(filterAndSort(rows, { tags: [], sort: 'near', city: false }).map((r) => r.id))
      .toEqual(['1', '3', '2'])
  })

  it('NEW 만 보기', () => {
    const rows = [cafe({ id: '1' }), cafe({ id: '2', isNew: true })]
    const out = filterAndSort(rows, { tags: [], sort: 'hot', city: false, newOnly: true })
    expect(out.map((r) => r.id)).toEqual(['2'])
  })

  it('NEW 만 보기도 고른 정렬 기준을 그대로 따른다', () => {
    const rows = [
      cafe({ id: 'far', isNew: true, driveMinutes: 90 }),
      cafe({ id: 'near', isNew: true, driveMinutes: 20 }),
      cafe({ id: 'not-new', isNew: false, driveMinutes: 1 }),
    ]
    const out = filterAndSort(rows, { tags: [], sort: 'near', city: false, newOnly: true })
    expect(out.map((r) => r.id)).toEqual(['near', 'far'])
  })
})

describe('areaLabel', () => {
  it('서울·인천은 그대로, 나머지는 접미사를 뗀다', () => {
    expect(areaLabel('서울')).toBe('서울')
    expect(areaLabel('인천')).toBe('인천')
    expect(areaLabel('남양주시')).toBe('남양주')
    expect(areaLabel('가평군')).toBe('가평')
  })
})

describe('hiddenByVisit — 홈 피드에서 내려둘 카페', () => {
  it('다녀온 곳은 언제 갔든 다 내린다', () => {
    const out = hiddenByVisit([
      { kakaoPlaceId: '최근', visitedOn: '2026-08-20' },
      { kakaoPlaceId: '오래전', visitedOn: '2020-01-01' },
    ])
    expect([...out].sort()).toEqual(['오래전', '최근'])
  })

  it('기록이 없으면 아무것도 내리지 않는다', () => {
    expect(hiddenByVisit([]).size).toBe(0)
  })

  it('같은 카페가 여러 번 있어도 하나로 센다', () => {
    const out = hiddenByVisit([
      { kakaoPlaceId: 'a', visitedOn: '2026-08-20' },
      { kakaoPlaceId: 'a', visitedOn: '2026-08-22' },
    ])
    expect(out.size).toBe(1)
  })
})

/**
 * 배지 숫자와 실제 리스트가 어긋났던 버그(NEW 배지·지역칩 숫자가 태그·검색어를
 * 무시함) 의 회귀 테스트. 필터 조합을 여러 개 돌려서 칩 숫자가 항상
 * filterAndSort 결과 개수와 같은지를 검증한다.
 */
const badgeCafes = [
  cafe({ id: 'a', area: '김포', tags: ['대형카페'], isNew: true }),
  cafe({ id: 'b', area: '김포', tags: ['뷰맛집'], isNew: false }),
  cafe({ id: 'c', area: '파주', tags: ['대형카페', '뷰맛집'], isNew: true }),
  cafe({ id: 'd', area: '파주', tags: [], isNew: false, cityOnly: true }),
  cafe({ id: 'e', area: '서울', tags: ['대형카페'], isNew: false, name: '서울카페' }),
]

const badgeCombos: FilterState[] = [
  { tags: [], sort: 'hot', city: false },
  { tags: [], sort: 'hot', city: true },
  { tags: ['대형카페'], sort: 'hot', city: true },
  { tags: [], sort: 'hot', city: true, area: ['김포'] },
  { tags: ['대형카페'], sort: 'hot', city: true, query: '카페' },
  { tags: [], sort: 'hot', city: true, query: '서울' },
]

describe('countMatching 은 정렬 없이도 filterAndSort(...).length 와 같다', () => {
  for (const s of badgeCombos) {
    it(`tags=${s.tags} area=${s.area ?? '-'} query=${s.query ?? '-'}`, () => {
      expect(countMatching(badgeCafes, s)).toBe(filterAndSort(badgeCafes, s).length)
    })
  }
})

describe('newCount 는 필터를 다 반영한 countMatching(newOnly:true) 와 같다', () => {
  for (const s of badgeCombos) {
    it(`tags=${s.tags} area=${s.area ?? '-'} query=${s.query ?? '-'}`, () => {
      const expected = filterAndSort(badgeCafes, { ...s, newOnly: true }).length
      // list-client.tsx 의 newCount 계산과 동일한 호출
      const actual = countMatching(badgeCafes, {
        tags: s.tags, sort: s.sort, city: s.city, area: s.area, query: s.query, newOnly: true,
      })
      expect(actual).toBe(expected)
    })
  }
})

describe('areaCounts 는 태그·검색어가 걸려 있어도 실제 눌렀을 때 나올 개수와 같다', () => {
  for (const s of badgeCombos) {
    it(`tags=${s.tags} query=${s.query ?? '-'}`, () => {
      const counts = areaCounts(badgeCafes, { city: s.city, tags: s.tags, query: s.query })
      for (const c of counts) {
        const shown = filterAndSort(badgeCafes, { ...s, area: [c.area], newOnly: false }).length
        expect(c.count).toBe(shown)
      }
    })
  }
})
