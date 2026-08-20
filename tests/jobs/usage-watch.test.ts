import { describe, it, expect } from 'vitest'
import { detectAnomalies, formatWatch, type WatchInput } from '../../src/jobs/usage-watch.js'
import type { BuzzSnapshot, Cafe, Health } from '../../src/schema.js'

const NOW = new Date('2026-08-21T22:40:00Z')
const TODAY = '2026-08-21'

const attrs = (extractedAt: string) => ({
  scale: '대형' as const,
  seatsEstimate: null,
  hasBakery: true,
  menuLevel: 3,
  mealTypes: [],
  viewStrength: 3,
  viewTypes: [],
  outdoorSeating: false,
  parkingGrade: 'A' as const,
  parkingEvidence: '',
  teenAppeal: 3,
  evidence: 'e',
  extractedAt,
  modelVersion: 'v',
})

const cafe = (id: string, over: Partial<Cafe> = {}): Cafe => ({
  kakaoPlaceId: id,
  name: `카페${id}`,
  sigungu: '양평군',
  lat: 37.49,
  lng: 127.48,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  tags: ['대형카페'],
  driveMinutesEst: 60,
  attributes: attrs(`${TODAY}T06:00:00.000Z`),
  ...over,
})

const snap = (id: string, capturedAt = TODAY): BuzzSnapshot => ({
  kakaoPlaceId: id,
  capturedAt,
  receivedCount: 50,
  relevantCount: 40,
  precision: 0.8,
  spanDays: 100,
  postsPer30: 10,
  posts30d: 10,
  postsPrev: 8,
  firstPostDate: '2026-01-01',
  latestPostDate: '2026-08-20',
  acceleration: 1.2,
  suspectAmbiguous: false,
})

const health = (over: Partial<Health> = {}): Health => ({
  source: 'kakao-blog',
  lastSuccessAt: NOW.toISOString(),
  lastError: null,
  consecutiveFailures: 0,
  updatedAt: NOW.toISOString(),
  ...over,
})

/** 정상 상태: 오늘 전부 측정, 판정도 진행, 소스 성공 */
function healthy(): WatchInput {
  const cafes = Array.from({ length: 60 }, (_, i) => cafe(`c${i}`))
  // 판정 대기가 남아 있어야 판정 정체 검사가 살아난다
  for (let i = 0; i < 10; i++) {
    cafes.push(cafe(`p${i}`, { status: 'pending_extraction', attributes: undefined }))
  }
  return {
    cafes,
    buzz: Array.from({ length: 200 }, (_, i) => snap(`c${i}`)),
    health: [health(), health({ source: 'classify' })],
    now: NOW,
  }
}

describe('detectAnomalies', () => {
  it('정상 상태에서는 아무것도 알리지 않는다', () => {
    expect(detectAnomalies(healthy())).toEqual([])
  })

  it('쿼터 오류를 최우선으로 알린다 — 키를 남이 쓰는 신호다', () => {
    const input = healthy()
    input.health = [health({ lastError: 'HTTP 429 quota exceeded', consecutiveFailures: 2 })]
    const out = detectAnomalies(input)
    expect(out[0]!.code).toBe('quota_error')
    expect(out[0]!.level).toBe('alert')
    // 같은 실패를 source_failing 으로 또 세지 않는다
    expect(out.filter((a) => a.code === 'source_failing')).toHaveLength(0)
  })

  it('RESOURCE_EXHAUSTED 도 쿼터로 본다 (provider 마다 문구가 다르다)', () => {
    const input = healthy()
    input.health = [health({ lastError: 'RESOURCE_EXHAUSTED', consecutiveFailures: 1 })]
    expect(detectAnomalies(input)[0]!.code).toBe('quota_error')
  })

  it('쿼터가 아닌 실패는 1회는 경고, 3회부터 경보', () => {
    const one = healthy()
    one.health = [health({ lastError: 'ECONNRESET', consecutiveFailures: 1 })]
    expect(detectAnomalies(one)[0]).toMatchObject({ code: 'source_failing', level: 'warn' })

    const three = healthy()
    three.health = [health({ lastError: 'ECONNRESET', consecutiveFailures: 3 })]
    expect(detectAnomalies(three)[0]).toMatchObject({ code: 'source_failing', level: 'alert' })
  })

  it('매일 도는 소스가 36시간 넘게 조용하면 알린다', () => {
    const input = healthy()
    input.health = [health({ lastSuccessAt: '2026-08-19T00:00:00.000Z' })]
    const out = detectAnomalies(input)
    expect(out.some((a) => a.code === 'source_stale')).toBe(true)
  })

  it('주 1회 소스는 36시간으로 판단하지 않는다', () => {
    const input = healthy()
    input.health = [health({ source: 'kakao-directions', lastSuccessAt: '2026-08-19T00:00:00.000Z' })]
    expect(detectAnomalies(input).some((a) => a.code === 'source_stale')).toBe(false)
  })

  it('한 번도 성공하지 않은 소스는 판단하지 않는다 (첫 실행 오탐 방지)', () => {
    const input = healthy()
    input.health = [health({ lastSuccessAt: null })]
    expect(detectAnomalies(input).some((a) => a.code === 'source_stale')).toBe(false)
  })

  it('화제량 측정이 오늘 80% 밑이면 알린다', () => {
    const input = healthy()
    input.buzz = [
      ...Array.from({ length: 100 }, (_, i) => snap(`c${i}`)),
      ...Array.from({ length: 100 }, (_, i) => snap(`d${i}`, '2026-08-19')),
    ]
    const out = detectAnomalies(input)
    expect(out.some((a) => a.code === 'buzz_drop')).toBe(true)
  })

  it('스냅샷이 100건 미만이면 비율을 따지지 않는다', () => {
    const input = healthy()
    input.buzz = [snap('c0', '2026-01-01')]
    expect(detectAnomalies(input).some((a) => a.code === 'buzz_drop')).toBe(false)
  })

  it('대기가 남았는데 오늘 판정이 0곳이면 알린다', () => {
    const input = healthy()
    input.cafes = input.cafes.map((c) =>
      c.attributes ? { ...c, attributes: attrs('2026-08-19T00:00:00.000Z') } : c,
    )
    const out = detectAnomalies(input)
    expect(out.some((a) => a.code === 'classify_stalled' && a.level === 'alert')).toBe(true)
  })

  it('판정이 조금밖에 안 됐으면 경고까지만 한다', () => {
    const input = healthy()
    // 오늘 판정 10곳 (경고 임계 50 미만)
    input.cafes = input.cafes.map((c, i) =>
      c.attributes && i >= 10 ? { ...c, attributes: attrs('2026-08-19T00:00:00.000Z') } : c,
    )
    const out = detectAnomalies(input)
    expect(out.some((a) => a.code === 'classify_slow' && a.level === 'warn')).toBe(true)
    expect(out.some((a) => a.code === 'classify_stalled')).toBe(false)
  })

  it('판정 대기가 없으면 판정 정체를 따지지 않는다 (전량 완료 후 오탐 방지)', () => {
    const input = healthy()
    input.cafes = input.cafes
      .filter((c) => c.status !== 'pending_extraction')
      .map((c) => ({ ...c, attributes: attrs('2026-08-19T00:00:00.000Z') }))
    const out = detectAnomalies(input)
    expect(out.some((a) => a.code.startsWith('classify'))).toBe(false)
  })

  it('빈 데이터에서도 던지지 않는다', () => {
    expect(detectAnomalies({ cafes: [], buzz: [], health: [], now: NOW })).toEqual([])
  })
})

describe('formatWatch', () => {
  it('이상이 없어도 숫자를 보여준다 — 조용한 성공은 신뢰를 못 준다', () => {
    const input = healthy()
    const text = formatWatch(detectAnomalies(input), input)
    expect(text).toContain('이상 없음')
    expect(text).toContain('화제량 측정 오늘 200/200곳')
  })

  it('이상이 있으면 코드와 이유를 함께 적는다', () => {
    const input = healthy()
    input.health = [health({ lastError: '429 quota', consecutiveFailures: 5 })]
    const text = formatWatch(detectAnomalies(input), input)
    expect(text).toContain('quota_error')
    expect(text).toContain('[!]')
  })
})
