import { describe, it, expect } from 'vitest'
import { buildNotifyText, KAKAO_TEXT_LIMIT } from '../../src/site/notify.js'
import type { SiteCafe, SitePayload } from '../../src/schema.js'

const cafe = (over: Partial<SiteCafe> & { id: string; name: string }): SiteCafe => ({
  sigungu: '양평군',
  zone: 'east',
  driveMinutes: 80,
  scale: '대형',
  parkingGrade: 'A',
  menuLevel: 3,
  tags: ['대형카페', '뷰맛집', '브런치카페'],
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

const payload = (cafes: SiteCafe[]): SitePayload => ({
  generatedAt: '2026-08-20T00:00:00.000Z',
  weekOf: '2026-08-17',
  week: cafes.map((c, i) => ({ rank: i + 1, id: c.id, finalScore: 10 - i })),
  cafes,
  visited: [],
  stats: { discovered: 100, passed: cafes.length, regions: 3, cityOnly: 0 },
})

const three = [
  cafe({ id: '1', name: '테라로사 서종점' }),
  cafe({ id: '2', name: '카페산', sigungu: '가평군', driveMinutes: 90 }),
  cafe({ id: '3', name: '더그림', sigungu: '파주시', driveMinutes: 60 }),
]

describe('buildNotifyText', () => {
  it('추천 3곳과 링크를 담는다', () => {
    const t = buildNotifyText({
      payload: payload(three),
      baseUrl: 'https://cafe.example.com',
    })
    expect(t).toContain('심김 빵지순례')
    expect(t).toContain('테라로사 서종점')
    expect(t).toContain('카페산')
    expect(t).toContain('더그림')
    expect(t).toContain('https://cafe.example.com')
  })

  it('200자를 넘지 않는다', () => {
    // 넘치면 카카오가 자른다 (스펙 10.2)
    const t = buildNotifyText({
      payload: payload(three),
      baseUrl: 'https://cafe.example.com',
    })
    expect(t.length).toBeLessThanOrEqual(KAKAO_TEXT_LIMIT)
  })

  it('상호가 길어도 200자를 지키고 링크를 살린다', () => {
    // 정보 전달이 아니라 앱을 열게 하는 것이 목적이다
    const long = [
      cafe({ id: '1', name: '쌀베이커리 카페흥만소 고기동유원지점' }),
      cafe({ id: '2', name: '테이블스 라운지 북한강점', sigungu: '남양주시' }),
      cafe({ id: '3', name: '마호가니 광화문 케이스퀘어시티점', sigungu: '종로구' }),
    ]
    const t = buildNotifyText({
      payload: payload(long),
      baseUrl: 'https://cafe-recommender-family.vercel.app',
    })
    expect(t.length).toBeLessThanOrEqual(KAKAO_TEXT_LIMIT)
    expect(t).toContain('vercel.app')
  })

  it('주소 끝 슬래시가 겹치지 않는다', () => {
    const t = buildNotifyText({ payload: payload(three), baseUrl: 'https://x.com/' })
    expect(t).not.toContain('x.com//')
  })

  it('주소가 없으면 링크 줄을 뺀다', () => {
    const t = buildNotifyText({ payload: payload(three) })
    expect(t).not.toContain('자세히')
    expect(t).toContain('테라로사 서종점')
  })

  it('추천이 없으면 그렇다고 말한다 (빈 메시지를 보내지 않는다)', () => {
    const t = buildNotifyText({ payload: payload([]), baseUrl: 'https://x.com' })
    expect(t).toContain('없어요')
    expect(t).toContain('https://x.com')
  })

  it('목록에 없는 추천은 건너뛴다', () => {
    const p = payload(three)
    p.week.push({ rank: 4, id: '없는곳', finalScore: 1 })
    const t = buildNotifyText({ payload: p })
    expect(t).not.toContain('없는곳')
  })

  it('짧으면 태그까지 담는다', () => {
    const t = buildNotifyText({ payload: payload([cafe({ id: '1', name: '후탄' })]) })
    expect(t).toContain('대형카페')
  })
  it('추천이 10곳이면 이름 3곳 + 나머지 개수로 줄인다', () => {
    // 200자에 10곳이 다 들어가지 않는다. 링크를 살리는 것이 우선이다.
    const ten = Array.from({ length: 10 }, (_, i) =>
      cafe({ id: String(i), name: `카페이름${i}`, sigungu: '남양주시' }))
    const t = buildNotifyText({
      payload: payload(ten),
      baseUrl: 'https://cafe.example.com',
    })
    expect(t).toContain('카페이름0')
    expect(t).toContain('카페이름2')
    expect(t).not.toContain('카페이름3')
    expect(t).toContain('외 7곳')
    expect(t.length).toBeLessThanOrEqual(KAKAO_TEXT_LIMIT)
  })

  it('3곳 이하면 "외 N곳" 을 붙이지 않는다', () => {
    const t = buildNotifyText({ payload: payload(three) })
    expect(t).not.toContain('외 ')
  })
})

describe('buildNotifyText — 자동수집 상태 줄', () => {
  const three = [
    cafe({ id: '1', name: '소올투베이커리' }),
    cafe({ id: '2', name: '휘우커피' }),
    cafe({ id: '3', name: '더티트렁크' }),
  ]

  it('상태를 주면 마지막 줄에 붙는다', () => {
    const text = buildNotifyText({
      payload: payload(three),
      baseUrl: 'https://cafe.example.app',
      status: '자동수집 정상',
    })
    expect(text.endsWith('자동수집 정상')).toBe(true)
  })

  it('상태를 주지 않으면 줄이 생기지 않는다 (기존 동작 유지)', () => {
    const text = buildNotifyText({ payload: payload(three), baseUrl: 'https://cafe.example.app' })
    expect(text).not.toContain('자동수집')
  })

  it('상태가 길어도 200자를 넘지 않는다 — 설명부터 줄인다', () => {
    const long = '점검 필요: 화제량 측정 부족·판정 정체 외 2건'
    const text = buildNotifyText({
      payload: payload(three),
      baseUrl: 'https://cafe-recommender-git-master-shim6.vercel.app',
      status: long,
    })
    expect(text.length).toBeLessThanOrEqual(KAKAO_TEXT_LIMIT)
    // 줄여도 링크와 상태는 남는다 — 이 둘이 메시지의 목적이다
    expect(text).toContain('https://')
    expect(text).toContain(long)
  })

  it('추천이 없을 때도 상태는 전한다', () => {
    const text = buildNotifyText({
      payload: payload([]),
      baseUrl: 'https://cafe.example.app',
      status: '점검 필요: 수집 멈춤',
    })
    expect(text).toContain('점검 필요: 수집 멈춤')
    expect(text.length).toBeLessThanOrEqual(KAKAO_TEXT_LIMIT)
  })
})
