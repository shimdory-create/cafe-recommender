import { describe, it, expect } from 'vitest'
import {
  detectAnomalies, formatWatch, statusLine, type WatchInput,
} from '../../src/jobs/usage-watch.js'
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

/**
 * 정상 상태: active 60곳은 오늘 전부 측정, 대기 40곳도 오늘 회전분에 들어옴,
 * 판정 진행 중, 소스 성공.
 */
function healthy(): WatchInput {
  const cafes = Array.from({ length: 60 }, (_, i) => cafe(`c${i}`))
  // 판정 대기가 남아 있어야 판정 정체 검사가 살아난다
  for (let i = 0; i < 40; i++) {
    cafes.push(cafe(`p${i}`, { status: 'pending_extraction', attributes: undefined }))
  }
  return {
    cafes,
    buzz: [
      ...Array.from({ length: 60 }, (_, i) => snap(`c${i}`)),
      ...Array.from({ length: 40 }, (_, i) => snap(`p${i}`)),
    ],
    health: [health(), health({ source: 'classify' })],
    now: NOW,
  }
}

describe('detectAnomalies', () => {
  it('정상 상태에서는 아무것도 알리지 않는다', () => {
    expect(detectAnomalies(healthy())).toEqual([])
  })

  it('쿼터 소진은 경고까지만 한다 — 무료 티어에서는 매일 정상적으로 일어난다', () => {
    const input = healthy()
    input.health = [health({ lastError: 'HTTP 429 quota exceeded', consecutiveFailures: 2 })]
    const out = detectAnomalies(input)
    expect(out.find((a) => a.code === 'quota_error')?.level).toBe('warn')
    // 같은 실패를 source_failing 으로 또 세지 않는다
    expect(out.filter((a) => a.code === 'source_failing')).toHaveLength(0)
    // 경고만 있으면 감시가 실패로 끝나지 않아야 한다 (메일 폭탄 방지)
    expect(out.some((a) => a.level === 'alert')).toBe(false)
  })

  it('쿼터가 소진돼도 진행량이 0이면 경보한다 — 이게 키 유출 신호다', () => {
    const input = healthy()
    input.health = [health({ lastError: '429', consecutiveFailures: 3 })]
    input.cafes = input.cafes.map((c) =>
      c.attributes ? { ...c, attributes: attrs('2026-08-19T00:00:00.000Z') } : c,
    )
    const out = detectAnomalies(input)
    expect(out.some((a) => a.code === 'classify_stalled' && a.level === 'alert')).toBe(true)
  })

  it('오늘 쿼터 오류가 있으면 consecutiveFailures·lastError 가 지워져도 알린다', () => {
    // recordSuccess 가 회차 끝에 그 둘을 지워도 quotaErrorsToday 는 남는다
    // — daily-watch 가 놓쳤던 실제 사건(2026-09-29)의 재현.
    const input = healthy()
    input.health = [
      health({
        source: 'classify', lastError: null, consecutiveFailures: 0,
        quotaErrorsToday: 3, quotaErrorsDate: TODAY,
      }),
    ]
    const out = detectAnomalies(input)
    const found = out.find((a) => a.code === 'quota_hits_today')
    expect(found?.level).toBe('warn')
    expect(found?.message).toContain('3건')
  })

  it('오늘 쿼터 오류가 0건이면 알리지 않는다', () => {
    const input = healthy()
    input.health = [health({ quotaErrorsToday: 0, quotaErrorsDate: TODAY })]
    expect(detectAnomalies(input).some((a) => a.code === 'quota_hits_today')).toBe(false)
  })

  it('날짜가 오늘이 아니면(어제 이전) 쓰다 남은 값으로 오탐하지 않는다', () => {
    const input = healthy()
    input.health = [health({ quotaErrorsToday: 5, quotaErrorsDate: '2026-08-01' })]
    expect(detectAnomalies(input).some((a) => a.code === 'quota_hits_today')).toBe(false)
  })

  it('RESOURCE_EXHAUSTED 도 쿼터로 본다 (provider 마다 문구가 다르다)', () => {
    const input = healthy()
    input.health = [health({ lastError: 'RESOURCE_EXHAUSTED', consecutiveFailures: 1 })]
    expect(detectAnomalies(input).some((a) => a.code === 'quota_error')).toBe(true)
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

  it('추천 대상(active)의 오늘 측정이 80% 밑이면 알린다', () => {
    const input = healthy()
    // active 60곳 중 30곳만 오늘 측정
    input.buzz = [
      ...Array.from({ length: 30 }, (_, i) => snap(`c${i}`)),
      ...Array.from({ length: 30 }, (_, i) => snap(`c${i + 30}`, '2026-08-19')),
      ...Array.from({ length: 40 }, (_, i) => snap(`p${i}`)),
    ]
    expect(detectAnomalies(input).some((a) => a.code === 'buzz_drop')).toBe(true)
  })

  it('대기 카페를 돌려가며 재는 것은 이상으로 보지 않는다', () => {
    // 실제 운영: active 는 매일, 대기 5,000곳 중 800곳만 오늘 측정한다.
    // 전체 비율로 판단하면 여기서 매일 오탐이 난다.
    const cafes = [
      ...Array.from({ length: 300 }, (_, i) => cafe(`a${i}`)),
      ...Array.from({ length: 5000 }, (_, i) =>
        cafe(`q${i}`, { status: 'pending_extraction', attributes: undefined })),
    ]
    const buzz = [
      ...Array.from({ length: 300 }, (_, i) => snap(`a${i}`)),
      ...Array.from({ length: 800 }, (_, i) => snap(`q${i}`)),
      ...Array.from({ length: 4200 }, (_, i) => snap(`q${i + 800}`, '2026-08-15')),
    ]
    const out = detectAnomalies({
      cafes, buzz, health: [health(), health({ source: 'classify' })], now: NOW,
    })
    expect(out.some((a) => a.code.startsWith('buzz'))).toBe(false)
  })

  it('수집이 일찍 끊기면 총량으로 잡는다', () => {
    const cafes = [
      ...Array.from({ length: 300 }, (_, i) => cafe(`a${i}`)),
      ...Array.from({ length: 5000 }, (_, i) =>
        cafe(`q${i}`, { status: 'pending_extraction', attributes: undefined })),
    ]
    // active 는 다 쟀지만(그래서 buzz_drop 은 안 걸린다) 회전분이 없다
    const buzz = [
      ...Array.from({ length: 300 }, (_, i) => snap(`a${i}`)),
      ...Array.from({ length: 5000 }, (_, i) => snap(`q${i}`, '2026-08-15')),
    ]
    const out = detectAnomalies({
      cafes, buzz, health: [health(), health({ source: 'classify' })], now: NOW,
    })
    expect(out.some((a) => a.code === 'buzz_drop')).toBe(false)
    expect(out.some((a) => a.code === 'buzz_throughput' && a.level === 'alert')).toBe(true)
  })

  it('active 가 20곳 미만이면 비율을 따지지 않는다 (초기 상태)', () => {
    const input = healthy()
    input.cafes = input.cafes.filter((c) => c.status !== 'active').slice(0, 10)
    input.buzz = []
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

  it('금요일 정오(KST)에 거짓 경보를 내지 않는다', () => {
    // 수집은 04:17 KST = 19:17 UTC 에 돌아 그 날짜를 찍는다. 카톡은 12:04 KST
    // = 03:04 UTC(다음 UTC 날짜)에 상태를 계산한다. 같은 UTC 날짜만 인정하면
    // 매주 "화제량 측정 부족" 이 뜬다 (실측).
    const noon = new Date('2026-08-21T03:04:00Z') // 금 12:04 KST
    const cafes = [
      ...Array.from({ length: 60 }, (_, i) => cafe(`c${i}`, {
        attributes: attrs('2026-08-20T21:30:00.000Z'),
      })),
      ...Array.from({ length: 40 }, (_, i) =>
        cafe(`p${i}`, { status: 'pending_extraction', attributes: undefined })),
    ]
    const buzz = [
      ...Array.from({ length: 60 }, (_, i) => snap(`c${i}`, '2026-08-20')),
      ...Array.from({ length: 40 }, (_, i) => snap(`p${i}`, '2026-08-20')),
    ]
    const out = detectAnomalies({
      cafes,
      buzz,
      health: [
        health({ lastSuccessAt: '2026-08-20T19:20:00.000Z' }),
        health({ source: 'classify', lastSuccessAt: '2026-08-20T21:30:00.000Z' }),
      ],
      now: noon,
    })
    expect(out).toEqual([])
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
    expect(text).toContain('추천 대상 60/60곳')
  })

  it('이상이 있으면 코드와 이유를 함께 적는다', () => {
    const input = healthy()
    input.health = [health({ lastError: 'ECONNRESET', consecutiveFailures: 5 })]
    const text = formatWatch(detectAnomalies(input), input)
    expect(text).toContain('source_failing')
    expect(text).toContain('[!]')
  })
})


describe('statusLine — 카톡 한 줄', () => {
  it('이상이 없으면 정상이라고 말한다', () => {
    expect(statusLine([])).toBe('자동수집 정상')
  })

  it('경보가 있으면 점검 필요라고 말한다', () => {
    expect(statusLine([{ level: 'alert', code: 'classify_stalled', message: 'x' }]))
      .toBe('점검 필요: 판정 정체')
  })

  it('경보가 있으면 경고는 묻는다 — 한 줄에 다 넣을 수 없다', () => {
    const line = statusLine([
      { level: 'warn', code: 'quota_error', message: 'x' },
      { level: 'alert', code: 'buzz_drop', message: 'y' },
    ])
    expect(line).toBe('점검 필요: 화제량 측정 부족')
  })

  it('경고만 있으면 주의로 낮춘다', () => {
    expect(statusLine([{ level: 'warn', code: 'classify_slow', message: 'x' }]))
      .toBe('주의: 판정 지연')
  })

  it('세 건 이상은 개수로 줄인다 (200자 제한)', () => {
    const line = statusLine([
      { level: 'alert', code: 'quota_error', message: '' },
      { level: 'alert', code: 'buzz_drop', message: '' },
      { level: 'alert', code: 'classify_stalled', message: '' },
      { level: 'alert', code: 'source_stale', message: '' },
    ])
    expect(line).toContain('외 2건')
    expect(line.length).toBeLessThan(30)
  })
})
