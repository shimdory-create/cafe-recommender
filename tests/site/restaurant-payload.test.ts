import { describe, it, expect } from 'vitest'
import { buildRestaurantSitePayload, restaurantTrendOf, dedupeRestaurantListings } from '../../src/site/restaurant-payload.js'
import {
  RestaurantSitePayloadSchema,
  type RestaurantAttributes, type Restaurant, type SiteRestaurant,
} from '../../src/restaurant-schema.js'
import type { BuzzSnapshot, Visit, Review } from '../../src/schema.js'

const NOW = new Date('2026-08-20T00:00:00Z')

const attrs = (over: Partial<RestaurantAttributes> = {}): RestaurantAttributes => ({
  cuisineType: '한식', evidence: '룸이 넓다', parkingGrade: 'A', parkingEvidence: '주차장 넓음',
  hasRoom: true, reservable: true, viewStrength: 0, viewTypes: [], outdoorSeating: null,
  teenAppeal: 3, confidence: 0.9, extractedAt: NOW.toISOString(), modelVersion: 'v1',
  ...over,
})

const restaurant = (id: string, over: Partial<Restaurant> = {}): Restaurant => ({
  kakaoPlaceId: id, name: `식당${id}`, sigungu: '부평구', lat: 37.5, lng: 126.7,
  naverMapUrl: 'https://map.naver.com/p/search/x', kakaoPlaceUrl: 'http://place.map.kakao.com/1',
  firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active', ambiguousName: false,
  attributes: attrs(), tags: ['한식', '룸있음'],
  ...over,
})

const buzz = (id: string, over: Partial<BuzzSnapshot> = {}): BuzzSnapshot => ({
  kakaoPlaceId: id, capturedAt: '2026-08-19',
  receivedCount: 50, relevantCount: 40, precision: 0.8,
  spanDays: 20, postsPer30: 60, posts30d: 30, postsPrev: 15,
  firstPostDate: '2026-07-01', latestPostDate: '2026-08-19',
  acceleration: 1.6, suspectAmbiguous: false,
  ...over,
})

const build = (
  restaurants: Restaurant[], buzzRows: BuzzSnapshot[],
  over: Partial<Parameters<typeof buildRestaurantSitePayload>[0]> = {},
) => buildRestaurantSitePayload({
  restaurants, buzz: buzzRows, visits: [], suggestions: [], reviews: [],
  weekOf: '2026-08-17', now: NOW, pipelineStatus: '자동수집 정상', ...over,
})

describe('buildRestaurantSitePayload', () => {
  it('스키마를 만족하는 페이로드를 만든다', () => {
    const p = build([restaurant('1')], [buzz('1')])
    expect(() => RestaurantSitePayloadSchema.parse(p)).not.toThrow()
    expect(p.restaurants).toHaveLength(1)
  })

  it('판정 전·숨김·태그 0개(음식종류 미분류)는 싣지 않는다', () => {
    const p = build(
      [
        restaurant('1'),
        restaurant('2', { status: 'pending_extraction', attributes: null }),
        restaurant('3', { status: 'hidden' }),
        restaurant('4', { attributes: attrs({ cuisineType: null }), tags: [] }),
      ],
      ['1', '2', '3', '4'].map((id) => buzz(id)),
    )
    expect(p.restaurants.map((r) => r.id)).toEqual(['1'])
  })

  it('같은 이름+시군구는 하나로 합친다 (도로명 주소 있는 쪽을 남긴다)', () => {
    const dupe = restaurant('2', { name: '식당1', roadAddress: '인천 부평구 1' })
    const p = build([restaurant('1'), dupe], [buzz('1'), buzz('2')])
    expect(p.restaurants).toHaveLength(1)
    expect(p.restaurants[0]!.id).toBe('2')
  })

  it('주차 D 는 도심 모드로도 싣지 않는다', () => {
    const p = build(
      [restaurant('1', { attributes: attrs({ parkingGrade: 'D' }) })],
      [buzz('1')],
    )
    expect(p.restaurants).toHaveLength(0)
  })

  it('주차 C 는 싣고 cityOnly 로 표시한다', () => {
    // 배제가 아니라 조건부 노출이다 (스펙 7.3)
    const p = build([restaurant('1', { attributes: attrs({ parkingGrade: 'C' }) })], [buzz('1')])
    expect(p.restaurants).toHaveLength(1)
    expect(p.restaurants[0]!.cityOnly).toBe(true)
    expect(p.stats.passed).toBe(0)
    expect(p.stats.cityOnly).toBe(1)
  })

  it('화제량 스냅샷이 없으면 싣지 않는다 (점수를 못 낸다)', () => {
    expect(build([restaurant('1')], []).restaurants).toHaveLength(0)
  })

  it('화제도 내림차순으로 정렬한다', () => {
    const p = build(
      [restaurant('a'), restaurant('b'), restaurant('c')],
      [
        buzz('a', { postsPer30: 10, acceleration: 1 }),
        buzz('b', { postsPer30: 200, acceleration: 3 }),
        buzz('c', { postsPer30: 60, acceleration: 1.6 }),
      ],
    )
    expect(p.restaurants.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('동점이면 id 로 안정 정렬한다 (빌드마다 순서가 흔들리지 않게)', () => {
    const p = build([restaurant('z'), restaurant('a')], [buzz('z'), buzz('a')])
    expect(p.restaurants.map((r) => r.id)).toEqual(['a', 'z'])
  })

  it('판단 근거 인용을 반드시 싣는다', () => {
    const p = build([restaurant('1')], [buzz('1')])
    expect(p.restaurants[0]!.evidence).toBe('룸이 넓다')
    expect(p.restaurants[0]!.parkingEvidence).toBe('주차장 넓음')
  })

  it('이번 주 추천을 순위대로 싣는다', () => {
    const p = build([restaurant('1'), restaurant('2')], [buzz('1'), buzz('2')], {
      suggestions: [
        { weekOf: '2026-08-17', kakaoPlaceId: '2', rank: 2, finalScore: 10, reason: {} },
        { weekOf: '2026-08-17', kakaoPlaceId: '1', rank: 1, finalScore: 20, reason: {} },
      ],
    })
    expect(p.week.map((w) => w.id)).toEqual(['1', '2'])
  })

  it('빌드 시점 후기를 함께 싣는다 — 열람 전용 배포에는 토큰이 없다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      reviews: [
        {
          id: 'r1', kakaoPlaceId: '1', rating: 4, nickname: '김', comment: '좋다',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
        {
          id: 'r2', kakaoPlaceId: '1', rating: 5, nickname: '심', comment: '더 좋다',
          createdAt: '2026-08-05T00:00:00.000Z',
        },
      ],
    })
    expect(p.restaurants[0]!.familyReviews.map((r) => r.nickname)).toEqual(['심', '김'])
    expect(p.restaurants[0]!.ratingCount).toBe(2)
  })

  it('후기가 없으면 빈 배열이다', () => {
    const p = build([restaurant('1')], [buzz('1')])
    expect(p.restaurants[0]!.familyReviews).toEqual([])
  })

  it('이번 주 후보가 아직 없으면 가장 최근 주의 것을 쓴다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      suggestions: [
        { weekOf: '2026-08-10', kakaoPlaceId: '1', rank: 1, finalScore: 20, reason: {} },
      ],
    })
    expect(p.week.map((w) => w.id)).toEqual(['1'])
  })

  it('여러 주가 쌓여 있으면 가장 최근 주만 쓴다', () => {
    const p = build([restaurant('1'), restaurant('2')], [buzz('1'), buzz('2')], {
      suggestions: [
        { weekOf: '2026-08-10', kakaoPlaceId: '1', rank: 1, finalScore: 20, reason: {} },
        { weekOf: '2026-08-17', kakaoPlaceId: '2', rank: 1, finalScore: 30, reason: {} },
      ],
    })
    expect(p.week.map((w) => w.id)).toEqual(['2'])
  })

  it('주중에 다녀온 곳은 이번 주 목록에서 빠지고 뒤가 당겨진다', () => {
    const p = build([restaurant('1'), restaurant('2'), restaurant('3')], [buzz('1'), buzz('2'), buzz('3')], {
      suggestions: [
        { weekOf: '2026-08-17', kakaoPlaceId: '1', rank: 1, finalScore: 30, reason: {} },
        { weekOf: '2026-08-17', kakaoPlaceId: '2', rank: 2, finalScore: 20, reason: {} },
        { weekOf: '2026-08-17', kakaoPlaceId: '3', rank: 3, finalScore: 10, reason: {} },
      ],
      visits: [{ kakaoPlaceId: '2', visitedOn: '2026-08-19' }],
    })
    expect(p.week.map((w) => w.id)).toEqual(['1', '3'])
    // 2위가 빠졌다고 1·3위로 보이면 안 된다
    expect(p.week.map((w) => w.rank)).toEqual([1, 2])
  })

  it('6개월이 지난 방문은 다시 올라온다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      suggestions: [
        { weekOf: '2026-08-17', kakaoPlaceId: '1', rank: 1, finalScore: 30, reason: {} },
      ],
      visits: [{ kakaoPlaceId: '1', visitedOn: '2026-01-01' }],
    })
    expect(p.week.map((w) => w.id)).toEqual(['1'])
  })

  it('후보가 많아도 열 곳까지만 싣는다', () => {
    const ids = Array.from({ length: 14 }, (_, i) => `c${i}`)
    const p = build(ids.map((id) => restaurant(id)), ids.map((id) => buzz(id)), {
      suggestions: ids.map((id, i) => ({
        weekOf: '2026-08-17', kakaoPlaceId: id, rank: i + 1, finalScore: 100 - i, reason: {},
      })),
    })
    expect(p.week).toHaveLength(10)
  })

  it('아직 오지 않은 주의 후보는 쓰지 않는다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      suggestions: [
        { weekOf: '2026-09-07', kakaoPlaceId: '1', rank: 1, finalScore: 20, reason: {} },
      ],
    })
    expect(p.week).toHaveLength(0)
  })

  it('목록에 없는 식당은 추천에서도 뺀다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      suggestions: [
        { weekOf: '2026-08-17', kakaoPlaceId: '없는곳', rank: 1, finalScore: 20, reason: {} },
      ],
    })
    expect(p.week).toHaveLength(0)
  })

  it('방문 기록을 실어 배지를 띄울 수 있게 한다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      visits: [
        { kakaoPlaceId: '1', visitedOn: '2026-07-01' },
        { kakaoPlaceId: '1', visitedOn: '2026-08-16' },
      ],
    })
    expect(p.restaurants[0]!.visitedOn).toBe('2026-08-16')
  })

  it('네이버 링크가 없으면 만들어 넣는다', () => {
    const p = build([restaurant('1', { naverMapUrl: null })], [buzz('1')])
    expect(p.restaurants[0]!.naverMapUrl).toContain('map.naver.com')
    expect(p.restaurants[0]!.naverMapUrl).toContain(encodeURIComponent('부평구 식당1'))
  })

  it('룸·예약 여부가 없으면 null 로 싣는다 (화면에서 미확인 처리)', () => {
    const p = build(
      [restaurant('1', { attributes: attrs({ hasRoom: null, reservable: null }) })],
      [buzz('1')],
    )
    expect(p.restaurants[0]!.hasRoom).toBeNull()
    expect(p.restaurants[0]!.reservable).toBeNull()
  })

  it('통계를 낸다', () => {
    const p = build(
      [
        restaurant('1'),
        restaurant('2', { sigungu: '계양구' }),
        restaurant('3', { attributes: attrs({ parkingGrade: 'C' }) }),
      ],
      [buzz('1'), buzz('2'), buzz('3')],
    )
    expect(p.stats.discovered).toBe(3)
    expect(p.stats.passed).toBe(2)
    expect(p.stats.cityOnly).toBe(1)
    expect(p.stats.regions).toBe(2)
  })

  it('빈 데이터에서도 던지지 않는다', () => {
    const p = build([], [])
    expect(p.restaurants).toEqual([])
    expect(p.week).toEqual([])
    expect(p.stats.passed).toBe(0)
  })
})

describe('restaurantTrendOf', () => {
  it('90일 창을 못 채우면 unknown', () => {
    expect(restaurantTrendOf({ posts30d: 10, postsPrev: 5, spanDays: 40 })).toBe('unknown')
  })

  it('이전 기간이 0이어도 비교하지 않는다', () => {
    expect(restaurantTrendOf({ posts30d: 50, postsPrev: 0, spanDays: 200 })).toBe('unknown')
  })

  it('창이 충분하고 1.5배 이상이면 rising', () => {
    expect(restaurantTrendOf({ posts30d: 30, postsPrev: 20, spanDays: 200 })).toBe('rising')
  })

  it('비슷하면 steady', () => {
    expect(restaurantTrendOf({ posts30d: 10, postsPrev: 20, spanDays: 200 })).toBe('steady')
  })

  it('줄었으면 steady (줄었다고 겁주지 않는다)', () => {
    expect(restaurantTrendOf({ posts30d: 2, postsPrev: 40, spanDays: 200 })).toBe('steady')
  })
})

describe('다녀온 곳', () => {
  it('방문 기록을 최근 순으로 싣는다', () => {
    const p = build([restaurant('1'), restaurant('2', { name: '식당둘' })], [buzz('1'), buzz('2')], {
      visits: [
        { kakaoPlaceId: '1', visitedOn: '2026-06-01' },
        { kakaoPlaceId: '2', visitedOn: '2026-08-16' },
      ],
    })
    expect(p.visited.map((v) => v.name)).toEqual(['식당둘', '식당1'])
  })

  it('게이트에서 빠진 식당도 기록은 남긴다', () => {
    const p = build(
      [restaurant('1', { status: 'excluded_auto', excludeReason: '주차 불가', attributes: null })],
      [buzz('1')],
      { visits: [{ kakaoPlaceId: '1', visitedOn: '2026-08-16' }] },
    )
    expect(p.restaurants).toHaveLength(0)
    expect(p.visited).toHaveLength(1)
    expect(p.visited[0]!.name).toBe('식당1')
  })

  it('같은 곳을 여러 번 갔으면 마지막 방문만 싣는다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      visits: [
        { kakaoPlaceId: '1', visitedOn: '2026-05-01' },
        { kakaoPlaceId: '1', visitedOn: '2026-08-16' },
      ],
    })
    expect(p.visited).toHaveLength(1)
    expect(p.visited[0]!.visitedOn).toBe('2026-08-16')
  })

  it('메모를 함께 싣는다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      visits: [{ kakaoPlaceId: '1', visitedOn: '2026-08-16', note: '룸이 넓었다' }],
    })
    expect(p.visited[0]!.note).toBe('룸이 넓었다')
  })

  it('메모가 없으면 빈 문자열이다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      visits: [{ kakaoPlaceId: '1', visitedOn: '2026-08-16' }],
    })
    expect(p.visited[0]!.note).toBe('')
  })

  it('없는 식당의 방문 기록은 건너뛴다', () => {
    const p = build([restaurant('1')], [buzz('1')], {
      visits: [{ kakaoPlaceId: '없는곳', visitedOn: '2026-08-16' }],
    })
    expect(p.visited).toEqual([])
  })

  it('방문 기록이 없으면 빈 배열이다', () => {
    expect(build([restaurant('1')], [buzz('1')]).visited).toEqual([])
  })
})

describe('가족 별점', () => {
  const rv = (kakaoPlaceId: string, rating: number) => ({
    id: `r-${kakaoPlaceId}-${rating}`,
    kakaoPlaceId,
    rating,
    nickname: '',
    comment: '',
    createdAt: '2026-08-20T00:00:00.000Z',
  })

  it('식당별 평균과 개수를 낸다', () => {
    const p = build([restaurant('1')], [buzz('1')], { reviews: [rv('1', 5), rv('1', 4)] })
    expect(p.restaurants[0]!.ratingAvg).toBe(4.5)
    expect(p.restaurants[0]!.ratingCount).toBe(2)
  })

  it('반개 별점도 평균에 들어간다', () => {
    const p = build([restaurant('1')], [buzz('1')], { reviews: [rv('1', 4.5), rv('1', 3.5)] })
    expect(p.restaurants[0]!.ratingAvg).toBe(4)
  })

  it('별점이 없으면 0 이다 (0으로 나누지 않는다)', () => {
    const p = build([restaurant('1')], [buzz('1')])
    expect(p.restaurants[0]!.ratingAvg).toBe(0)
    expect(p.restaurants[0]!.ratingCount).toBe(0)
  })

  it('다른 식당의 별점을 섞지 않는다', () => {
    const p = build([restaurant('1'), restaurant('2')], [buzz('1'), buzz('2')], {
      reviews: [rv('1', 5), rv('2', 1)],
    })
    const byId = new Map(p.restaurants.map((r) => [r.id, r]))
    expect(byId.get('1')!.ratingAvg).toBe(5)
    expect(byId.get('2')!.ratingAvg).toBe(1)
  })
})

describe('dedupeRestaurantListings', () => {
  it('빈 목록은 빈 목록', () => {
    expect(dedupeRestaurantListings([], new Map())).toEqual([])
  })

  const row = (over: Partial<SiteRestaurant> & { id: string; name: string }): SiteRestaurant => ({
    sigungu: '남양주시',
    zone: 'east',
    area: '남양주시',
    driveMinutes: 55,
    lat: 37.5,
    lng: 127.0,
    cuisineType: '한식',
    hasRoom: true,
    reservable: true,
    parkingGrade: 'A',
    tags: ['한식'],
    evidence: 'e',
    parkingEvidence: 'p',
    viewTypes: [],
    outdoorSeating: null,
    teenAppeal: null,
    naverMapUrl: 'https://map.naver.com/p/search/x',
    kakaoPlaceUrl: null,
    imageUrl: null,
    hotScore: 50,
    finalScore: 25,
    postsPer30: 60,
    posts30: 40,
    posts90: 100,
    acceleration: 1.5,
    trend: 'steady',
    ratingAvg: 0,
    ratingCount: 0,
    familyReviews: [],
    cityOnly: false,
    visitedOn: null,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    isNew: false,
    lastSeenAt: '2026-08-01T00:00:00.000Z',
    ...over,
  })

  const rest = (id: string, roadAddress: string | null): Restaurant => ({
    kakaoPlaceId: id,
    name: '비루개식당',
    sigungu: '남양주시',
    lat: 37.7,
    lng: 127.1,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ambiguousName: false,
    tags: ['한식'],
    ...(roadAddress ? { roadAddress } : {}),
  } as Restaurant)

  it('도로명 주소가 있는 쪽을 남긴다 — 빈 껍데기가 아닌 쪽', () => {
    const rows = [
      row({ id: 'empty', name: '비루개식당', finalScore: 30 }),
      row({ id: 'full', name: '비루개식당', finalScore: 20 }),
    ]
    const byId = new Map([
      ['empty', rest('empty', null)],
      ['full', rest('full', '경기 남양주시 별내면 용암비루개길 219-88')],
    ])
    const out = dedupeRestaurantListings(rows, byId)
    expect(out.map((r) => r.id)).toEqual(['full'])
  })

  it('둘 다 주소가 있으면 점수가 높은 쪽', () => {
    const rows = [
      row({ id: 'a', name: '비루개식당', finalScore: 10 }),
      row({ id: 'b', name: '비루개식당', finalScore: 40 }),
    ]
    const byId = new Map([['a', rest('a', '주소 A')], ['b', rest('b', '주소 B')]])
    expect(dedupeRestaurantListings(rows, byId).map((r) => r.id)).toEqual(['b'])
  })

  it('이름이 같아도 시군구가 다르면 남긴다 (다른 식당이다)', () => {
    const rows = [
      row({ id: '1', name: '테라로사', sigungu: '양평군' }),
      row({ id: '2', name: '테라로사', sigungu: '파주시' }),
    ]
    const byId = new Map([['1', rest('1', 'a')], ['2', rest('2', 'b')]])
    expect(dedupeRestaurantListings(rows, byId)).toHaveLength(2)
  })

  it('지점명이 다르면 각각 남긴다', () => {
    const rows = [
      row({ id: '1', name: '배다골식당 본점' }),
      row({ id: '2', name: '배다골식당 포레점' }),
    ]
    const byId = new Map([['1', rest('1', 'a')], ['2', rest('2', 'b')]])
    expect(dedupeRestaurantListings(rows, byId)).toHaveLength(2)
  })

  it('원래 순서(점수 내림차순)를 흔들지 않는다', () => {
    const rows = [
      row({ id: 'x', name: '가식당', finalScore: 50 }),
      row({ id: 'dup1', name: '비루개식당', finalScore: 40 }),
      row({ id: 'y', name: '나식당', finalScore: 30 }),
      row({ id: 'dup2', name: '비루개식당', finalScore: 20 }),
    ]
    const byId = new Map([
      ['x', rest('x', 'a')], ['y', rest('y', 'b')],
      ['dup1', rest('dup1', 'c')], ['dup2', rest('dup2', 'd')],
    ])
    expect(dedupeRestaurantListings(rows, byId).map((r) => r.id)).toEqual(['x', 'dup1', 'y'])
  })
})
