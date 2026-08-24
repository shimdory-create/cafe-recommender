import { describe, it, expect } from 'vitest'
import { buildSitePayload, trendOf, dedupeListings } from '../../src/site/payload.js'
import {
  SitePayloadSchema,
  type BuzzSnapshot, type Cafe, type CafeAttributes, type SiteCafe,
} from '../../src/schema.js'

const NOW = new Date('2026-08-20T00:00:00Z')

const attrs = (over: Partial<CafeAttributes> = {}): CafeAttributes => ({
  scale: '대형', seatsEstimate: null, floors: 2,
  hasBakery: true, breadBakedOnsite: true, menuLevel: 3,
  mealTypes: ['파스타'], viewStrength: 4, viewTypes: ['강'], outdoorSeating: true,
  parkingGrade: 'A', parkingEvidence: '주차장 넓음', photoSpot: 4, teenAppeal: 3,
  confidence: 0.9, evidence: '2층 통창 강뷰',
  extractedAt: NOW.toISOString(), modelVersion: 'v+p2',
  ...over,
})

const cafe = (id: string, over: Partial<Cafe> = {}): Cafe => ({
  kakaoPlaceId: id,
  name: `카페${id}`,
  sigungu: '양평군',
  lat: 37.49, lng: 127.48,
  driveMinutesEst: 70,
  naverMapUrl: 'https://map.naver.com/p/search/x',
  kakaoPlaceUrl: 'http://place.map.kakao.com/1',
  firstSeenAt: '2026-08-01T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  attributes: attrs(),
  tags: ['대형카페', '뷰맛집'],
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

const build = (cafes: Cafe[], buzzRows: BuzzSnapshot[], over: Partial<Parameters<typeof buildSitePayload>[0]> = {}) =>
  buildSitePayload({
    cafes, buzz: buzzRows, visits: [], suggestions: [],
    weekOf: '2026-08-17', now: NOW, ...over,
  })

describe('buildSitePayload', () => {
  it('스키마를 만족하는 페이로드를 만든다', () => {
    const p = build([cafe('1')], [buzz('1')])
    expect(() => SitePayloadSchema.parse(p)).not.toThrow()
    expect(p.cafes).toHaveLength(1)
  })

  it('판정 전·숨김 카페는 싣지 않는다', () => {
    const p = build(
      [
        cafe('1'),
        cafe('2', { status: 'pending_extraction', attributes: null }),
        cafe('3', { status: 'hidden' }),
        cafe('4', { status: 'excluded_auto', excludeReason: '주차 불가' }),
      ],
      ['1', '2', '3', '4'].map((id) => buzz(id)),
    )
    expect(p.cafes.map((c) => c.id)).toEqual(['1'])
  })

  it('주차 D 와 태그 0개는 도심 모드로도 싣지 않는다', () => {
    const p = build(
      [
        cafe('1', { attributes: attrs({ parkingGrade: 'D' }) }),
        cafe('2', { tags: [] }),
      ],
      [buzz('1'), buzz('2')],
    )
    expect(p.cafes).toHaveLength(0)
  })

  it('주차 C 는 싣고 cityOnly 로 표시한다', () => {
    // 배제가 아니라 조건부 노출이다 (스펙 7.3). 골든셋에서 이 구분을
    // 상태로 굳혔던 버그가 잡혔다.
    const p = build([cafe('1', { attributes: attrs({ parkingGrade: 'C' }) })], [buzz('1')])
    expect(p.cafes).toHaveLength(1)
    expect(p.cafes[0]!.cityOnly).toBe(true)
    expect(p.stats.passed).toBe(0)
    expect(p.stats.cityOnly).toBe(1)
  })

  it('화제량 스냅샷이 없으면 싣지 않는다 (점수를 못 낸다)', () => {
    expect(build([cafe('1')], []).cafes).toHaveLength(0)
  })

  it('화제도 내림차순으로 정렬한다', () => {
    const p = build(
      [cafe('a'), cafe('b'), cafe('c')],
      [
        buzz('a', { postsPer30: 10, acceleration: 1 }),
        buzz('b', { postsPer30: 200, acceleration: 3 }),
        buzz('c', { postsPer30: 60, acceleration: 1.6 }),
      ],
    )
    expect(p.cafes.map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })

  it('동점이면 id 로 안정 정렬한다 (빌드마다 순서가 흔들리지 않게)', () => {
    const p = build([cafe('z'), cafe('a')], [buzz('z'), buzz('a')])
    expect(p.cafes.map((c) => c.id)).toEqual(['a', 'z'])
  })

  it('판단 근거 인용을 반드시 싣는다', () => {
    // 근거가 없으면 신뢰가 생기지 않는다 (스펙 10절)
    const p = build([cafe('1')], [buzz('1')])
    expect(p.cafes[0]!.evidence).toBe('2층 통창 강뷰')
    expect(p.cafes[0]!.parkingEvidence).toBe('주차장 넓음')
  })

  it('이번 주 추천을 순위대로 싣는다', () => {
    const p = build([cafe('1'), cafe('2')], [buzz('1'), buzz('2')], {
      suggestions: [
        { weekOf: '2026-08-17', kakaoPlaceId: '2', rank: 2, finalScore: 10, reason: {} },
        { weekOf: '2026-08-17', kakaoPlaceId: '1', rank: 1, finalScore: 20, reason: {} },
      ],
    })
    expect(p.week.map((w) => w.id)).toEqual(['1', '2'])
  })

  it('빌드 시점 후기를 함께 싣는다 — 열람 전용 배포에는 토큰이 없다', () => {
    const p = build([cafe('1')], [buzz('1')], {
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
    // 최근 것부터
    expect(p.cafes[0]!.familyReviews.map((r) => r.nickname)).toEqual(['심', '김'])
    expect(p.cafes[0]!.ratingCount).toBe(2)
  })

  it('후기가 없으면 빈 배열이다', () => {
    const p = build([cafe('1')], [buzz('1')])
    expect(p.cafes[0]!.familyReviews).toEqual([])
  })

  it('이번 주 후보가 아직 없으면 가장 최근 주의 것을 쓴다', () => {
    // 후보 확정은 목요일 밤에 돈다. 월요일 09시(KST)에 weekOf 가 넘어가면
    // 목요일까지 사흘 동안 추천이 사라졌다 — 실측 2026-08-24 week: []
    const p = build([cafe('1')], [buzz('1')], {
      suggestions: [
        { weekOf: '2026-08-10', kakaoPlaceId: '1', rank: 1, finalScore: 20, reason: {} },
      ],
    })
    expect(p.week.map((w) => w.id)).toEqual(['1'])
  })

  it('여러 주가 쌓여 있으면 가장 최근 주만 쓴다', () => {
    const p = build([cafe('1'), cafe('2')], [buzz('1'), buzz('2')], {
      suggestions: [
        { weekOf: '2026-08-10', kakaoPlaceId: '1', rank: 1, finalScore: 20, reason: {} },
        { weekOf: '2026-08-17', kakaoPlaceId: '2', rank: 1, finalScore: 30, reason: {} },
      ],
    })
    expect(p.week.map((w) => w.id)).toEqual(['2'])
  })

  it('아직 오지 않은 주의 후보는 쓰지 않는다', () => {
    // 미래 weekOf 가 파일에 들어오는 경우 (수동 실행 등). 앞당겨 보여주지 않는다
    const p = build([cafe('1')], [buzz('1')], {
      suggestions: [
        { weekOf: '2026-09-07', kakaoPlaceId: '1', rank: 1, finalScore: 20, reason: {} },
      ],
    })
    expect(p.week).toHaveLength(0)
  })

  it('목록에 없는 카페는 추천에서도 뺀다', () => {
    // 숨긴 직후 추천 파일이 아직 안 갱신된 경우 — 깨진 링크를 만들지 않는다
    const p = build([cafe('1')], [buzz('1')], {
      suggestions: [
        { weekOf: '2026-08-17', kakaoPlaceId: '없는곳', rank: 1, finalScore: 20, reason: {} },
      ],
    })
    expect(p.week).toHaveLength(0)
  })

  it('방문 기록을 실어 배지를 띄울 수 있게 한다', () => {
    const p = build([cafe('1')], [buzz('1')], {
      visits: [
        { kakaoPlaceId: '1', visitedOn: '2026-07-01' },
        { kakaoPlaceId: '1', visitedOn: '2026-08-16' },
      ],
    })
    expect(p.cafes[0]!.visitedOn).toBe('2026-08-16')
  })

  it('네이버 링크가 없으면 만들어 넣는다', () => {
    const p = build([cafe('1', { naverMapUrl: null })], [buzz('1')])
    expect(p.cafes[0]!.naverMapUrl).toContain('map.naver.com')
    expect(p.cafes[0]!.naverMapUrl).toContain(encodeURIComponent('양평군 카페1'))
  })

  it('규모가 없으면 null 로 싣는다 (화면에서 미확인 처리)', () => {
    // 실측: seatsEstimate 는 100% null, scale 도 일부 null
    const p = build([cafe('1', { attributes: attrs({ scale: null }) })], [buzz('1')])
    expect(p.cafes[0]!.scale).toBeNull()
  })

  it('통계를 낸다', () => {
    const p = build(
      [
        cafe('1'),
        cafe('2', { sigungu: '가평군' }),
        cafe('3', { attributes: attrs({ parkingGrade: 'C' }) }),
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
    expect(p.cafes).toEqual([])
    expect(p.week).toEqual([])
    expect(p.stats.passed).toBe(0)
  })
})

describe('trendOf', () => {
  it('창이 90일을 못 덮으면 비교하지 않는다', () => {
    // 50건이 최근 20일에 몰려 있으면 postsPrev 자체가 절단된 값이다.
    // 가속도는 이때 상한 17.67 에 붙는다 — 급증이 아니라 절단 신호다 (발견 E).
    expect(trendOf({ posts30d: 50, postsPrev: 5, spanDays: 20 })).toBe('unknown')
  })

  it('이전 기간이 0이어도 비교하지 않는다', () => {
    expect(trendOf({ posts30d: 50, postsPrev: 0, spanDays: 200 })).toBe('unknown')
  })

  it('창이 충분하고 1.5배 이상이면 rising', () => {
    // postsPrev 는 60일치이므로 절반이 기준선이다
    expect(trendOf({ posts30d: 30, postsPrev: 20, spanDays: 200 })).toBe('rising')
  })

  it('비슷하면 steady', () => {
    expect(trendOf({ posts30d: 10, postsPrev: 20, spanDays: 200 })).toBe('steady')
  })

  it('줄었으면 steady (줄었다고 겁주지 않는다)', () => {
    expect(trendOf({ posts30d: 2, postsPrev: 40, spanDays: 200 })).toBe('steady')
  })
})

describe('다녀온 곳', () => {
  it('방문 기록을 최근 순으로 싣는다', () => {
    const p = build([cafe('1'), cafe('2', { name: '카페둘' })], [buzz('1'), buzz('2')], {
      visits: [
        { kakaoPlaceId: '1', visitedOn: '2026-06-01' },
        { kakaoPlaceId: '2', visitedOn: '2026-08-16' },
      ],
    })
    expect(p.visited.map((v) => v.name)).toEqual(['카페둘', '카페1'])
  })

  it('게이트에서 빠진 카페도 기록은 남긴다', () => {
    // 한 번 다녀온 곳이 목록에서 빠졌다고 기록까지 사라지면 안 된다
    const p = build(
      [cafe('1', { status: 'excluded_auto', excludeReason: '주차 불가', attributes: null })],
      [buzz('1')],
      { visits: [{ kakaoPlaceId: '1', visitedOn: '2026-08-16' }] },
    )
    expect(p.cafes).toHaveLength(0)
    expect(p.visited).toHaveLength(1)
    expect(p.visited[0]!.name).toBe('카페1')
  })

  it('같은 곳을 여러 번 갔으면 마지막 방문만 싣는다', () => {
    const p = build([cafe('1')], [buzz('1')], {
      visits: [
        { kakaoPlaceId: '1', visitedOn: '2026-05-01' },
        { kakaoPlaceId: '1', visitedOn: '2026-08-16' },
      ],
    })
    expect(p.visited).toHaveLength(1)
    expect(p.visited[0]!.visitedOn).toBe('2026-08-16')
  })

  it('메모를 함께 싣는다', () => {
    const p = build([cafe('1')], [buzz('1')], {
      visits: [{ kakaoPlaceId: '1', visitedOn: '2026-08-16', note: '빵이 맛있었다' }],
    })
    expect(p.visited[0]!.note).toBe('빵이 맛있었다')
  })

  it('없는 카페의 방문 기록은 건너뛴다', () => {
    const p = build([cafe('1')], [buzz('1')], {
      visits: [{ kakaoPlaceId: '없는곳', visitedOn: '2026-08-16' }],
    })
    expect(p.visited).toEqual([])
  })

  it('방문 기록이 없으면 빈 배열이다', () => {
    expect(build([cafe('1')], [buzz('1')]).visited).toEqual([])
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

  it('카페별 평균과 개수를 낸다', () => {
    const p = build([cafe('1')], [buzz('1')], { reviews: [rv('1', 5), rv('1', 4)] })
    expect(p.cafes[0]!.ratingAvg).toBe(4.5)
    expect(p.cafes[0]!.ratingCount).toBe(2)
  })

  it('반개 별점도 평균에 들어간다', () => {
    const p = build([cafe('1')], [buzz('1')], { reviews: [rv('1', 4.5), rv('1', 3.5)] })
    expect(p.cafes[0]!.ratingAvg).toBe(4)
  })

  it('별점이 없으면 0 이다 (0으로 나누지 않는다)', () => {
    const p = build([cafe('1')], [buzz('1')])
    expect(p.cafes[0]!.ratingAvg).toBe(0)
    expect(p.cafes[0]!.ratingCount).toBe(0)
  })

  it('다른 카페의 별점을 섞지 않는다', () => {
    const p = build([cafe('1'), cafe('2')], [buzz('1'), buzz('2')], {
      reviews: [rv('1', 5), rv('2', 1)],
    })
    const byId = new Map(p.cafes.map((c) => [c.id, c]))
    expect(byId.get('1')!.ratingAvg).toBe(5)
    expect(byId.get('2')!.ratingAvg).toBe(1)
  })
})

describe('dedupeListings — 같은 카페가 두 번 등록된 경우', () => {
  const row = (over: Partial<SiteCafe> & { id: string; name: string }): SiteCafe => ({
    sigungu: '남양주시',
    zone: 'east',
    driveMinutes: 55,
    scale: '대형',
    parkingGrade: 'A',
    menuLevel: 2,
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

  const cafe = (id: string, roadAddress: string | null): Cafe => ({
    kakaoPlaceId: id,
    name: '비루개',
    sigungu: '남양주시',
    lat: 37.7,
    lng: 127.1,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ambiguousName: false,
    tags: ['대형카페'],
    ...(roadAddress ? { roadAddress } : {}),
  } as Cafe)

  it('도로명 주소가 있는 쪽을 남긴다 — 빈 껍데기가 아닌 쪽', () => {
    const rows = [
      row({ id: 'empty', name: '비루개', finalScore: 30 }),
      row({ id: 'full', name: '비루개', finalScore: 20 }),
    ]
    const byId = new Map([
      ['empty', cafe('empty', null)],
      ['full', cafe('full', '경기 남양주시 별내면 용암비루개길 219-88')],
    ])
    const out = dedupeListings(rows, byId)
    expect(out.map((r) => r.id)).toEqual(['full'])
  })

  it('둘 다 주소가 있으면 점수가 높은 쪽', () => {
    const rows = [
      row({ id: 'a', name: '비루개', finalScore: 10 }),
      row({ id: 'b', name: '비루개', finalScore: 40 }),
    ]
    const byId = new Map([['a', cafe('a', '주소 A')], ['b', cafe('b', '주소 B')]])
    expect(dedupeListings(rows, byId).map((r) => r.id)).toEqual(['b'])
  })

  it('이름이 같아도 시군구가 다르면 남긴다 (다른 카페다)', () => {
    const rows = [
      row({ id: '1', name: '테라로사', sigungu: '양평군' }),
      row({ id: '2', name: '테라로사', sigungu: '파주시' }),
    ]
    const byId = new Map([['1', cafe('1', 'a')], ['2', cafe('2', 'b')]])
    expect(dedupeListings(rows, byId)).toHaveLength(2)
  })

  it('지점명이 다르면 각각 남긴다', () => {
    const rows = [
      row({ id: '1', name: '배다골베이커리하우스' }),
      row({ id: '2', name: '배다골베이커리 포레' }),
    ]
    const byId = new Map([['1', cafe('1', 'a')], ['2', cafe('2', 'b')]])
    expect(dedupeListings(rows, byId)).toHaveLength(2)
  })

  it('원래 순서(점수 내림차순)를 흔들지 않는다', () => {
    const rows = [
      row({ id: 'x', name: '가카페', finalScore: 50 }),
      row({ id: 'dup1', name: '비루개', finalScore: 40 }),
      row({ id: 'y', name: '나카페', finalScore: 30 }),
      row({ id: 'dup2', name: '비루개', finalScore: 20 }),
    ]
    const byId = new Map([
      ['x', cafe('x', 'a')], ['y', cafe('y', 'b')],
      ['dup1', cafe('dup1', 'c')], ['dup2', cafe('dup2', 'd')],
    ])
    expect(dedupeListings(rows, byId).map((r) => r.id)).toEqual(['x', 'dup1', 'y'])
  })
})
