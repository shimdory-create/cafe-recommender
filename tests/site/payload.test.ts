import { describe, it, expect } from 'vitest'
import { buildSitePayload } from '../../src/site/payload.js'
import { SitePayloadSchema, type BuzzSnapshot, type Cafe, type CafeAttributes } from '../../src/schema.js'

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

  it('다른 주의 추천은 무시한다', () => {
    const p = build([cafe('1')], [buzz('1')], {
      suggestions: [
        { weekOf: '2026-08-10', kakaoPlaceId: '1', rank: 1, finalScore: 20, reason: {} },
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
