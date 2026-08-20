import { describe, it, expect } from 'vitest'
import { pickEvenly, stratifiedSample, buildReport, type SampleCandidate } from '../../src/pipeline/sample.js'

const cand = (o: Partial<SampleCandidate> & { kakaoPlaceId: string }): SampleCandidate => ({
  scored: true,
  finalScore: 10,
  excludeReason: null,
  ambiguousName: false,
  tagCount: 3,
  parkingGrade: 'A',
  postsPer30: 40,
  ...o,
})

/** 경계 조건에 걸리지 않는 평범한 통과 카페 n곳 */
const plain = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) =>
    cand({ kakaoPlaceId: `p${String(from + i).padStart(3, '0')}`, finalScore: 100 - (from + i) }))

describe('pickEvenly', () => {
  it('개수가 적으면 전부 준다', () => {
    expect(pickEvenly([1, 2, 3], 5)).toEqual([1, 2, 3])
  })

  it('양 끝을 반드시 포함한다', () => {
    const r = pickEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)
    expect(r[0]).toBe(1)
    expect(r[r.length - 1]).toBe(10)
  })

  it('같은 입력에서 같은 표본이 나온다 (난수 금지)', () => {
    const arr = Array.from({ length: 50 }, (_, i) => i)
    expect(pickEvenly(arr, 10)).toEqual(pickEvenly(arr, 10))
  })

  it('1개를 요청하면 가운데를 준다', () => {
    expect(pickEvenly([1, 2, 3, 4, 5], 1)).toEqual([3])
  })

  it('0개를 요청하면 빈 배열이다', () => {
    expect(pickEvenly([1, 2, 3], 0)).toEqual([])
  })
})

describe('stratifiedSample', () => {
  it('네 구간을 모두 채운다', () => {
    const rows = [
      ...plain(60),
      ...Array.from({ length: 20 }, (_, i) =>
        cand({ kakaoPlaceId: `b${i}`, ambiguousName: true, finalScore: 50 })),
      ...Array.from({ length: 20 }, (_, i) =>
        cand({ kakaoPlaceId: `r${i}`, scored: false, excludeReason: '월 2.0건 < 8건' })),
    ]
    const s = stratifiedSample(rows, { perStratum: 10 })
    const by = (k: string) => s.filter((x) => x.stratum === k).length
    expect(by('top')).toBe(10)
    expect(by('mid')).toBe(10)
    expect(by('boundary')).toBe(10)
    expect(by('rejected')).toBe(10)
  })

  it('같은 카페를 두 구간에서 묻지 않는다', () => {
    const s = stratifiedSample([...plain(30)], { perStratum: 10 })
    expect(new Set(s.map((x) => x.kakaoPlaceId)).size).toBe(s.length)
  })

  it('프랜차이즈·카테고리 자동배제는 표본에서 뺀다', () => {
    // "스타벅스가 나왔으면 좋겠냐"고 물으면 사람의 7분을 낭비한다
    const rows = [
      cand({ kakaoPlaceId: 'f1', scored: false, excludeReason: 'franchise' }),
      cand({ kakaoPlaceId: 'c1', scored: false, excludeReason: 'category' }),
      cand({ kakaoPlaceId: 'l2', scored: false, excludeReason: '정밀도 10% < 30%' }),
    ]
    const s = stratifiedSample(rows, { perStratum: 10 })
    expect(s.map((x) => x.kakaoPlaceId)).toEqual(['l2'])
  })

  it('일반명사 상호는 점수가 높아도 경계 구간으로 간다', () => {
    // 스펙 14절 리스크 대응: ambiguousName 은 골든셋 경계에 강제 편입한다
    const rows = [...plain(20), cand({ kakaoPlaceId: 'amb', ambiguousName: true, finalScore: 999 })]
    const s = stratifiedSample(rows, { perStratum: 5 })
    expect(s.find((x) => x.kakaoPlaceId === 'amb')!.stratum).toBe('boundary')
  })

  it('Layer 2 를 구제 경로로만 통과한 카페는 경계 구간이다', () => {
    // 발견 C: 월 8건 미만인데 통과한 238곳이 오통과의 주요 후보다
    const rows = [...plain(20), cand({ kakaoPlaceId: 'rescue', postsPer30: 4.2, finalScore: 999 })]
    const s = stratifiedSample(rows, { perStratum: 5 })
    expect(s.find((x) => x.kakaoPlaceId === 'rescue')!.stratum).toBe('boundary')
  })

  it('태그 1개·주차 미확인도 경계 구간이다', () => {
    const rows = [
      ...plain(20),
      cand({ kakaoPlaceId: 'onetag', tagCount: 1, finalScore: 999 }),
      cand({ kakaoPlaceId: 'nopark', parkingGrade: '?', finalScore: 998 }),
    ]
    const s = stratifiedSample(rows, { perStratum: 5 })
    expect(s.find((x) => x.kakaoPlaceId === 'onetag')!.stratum).toBe('boundary')
    expect(s.find((x) => x.kakaoPlaceId === 'nopark')!.stratum).toBe('boundary')
  })

  it('상위 구간은 점수 최상위를 포함한다', () => {
    const s = stratifiedSample(plain(100), { perStratum: 10 })
    expect(s[0]!.kakaoPlaceId).toBe('p000')
    expect(s[0]!.stratum).toBe('top')
  })

  it('표본이 적어도 던지지 않는다', () => {
    expect(stratifiedSample([], { perStratum: 10 })).toEqual([])
    expect(stratifiedSample(plain(1), { perStratum: 10 })).toHaveLength(1)
  })
})

describe('buildReport', () => {
  it('상위·중간대의 X 비율을 오통과율로 계산한다', () => {
    const r = buildReport([
      { stratum: 'top', verdict: 'O' },
      { stratum: 'top', verdict: 'O' },
      { stratum: 'mid', verdict: 'O' },
      { stratum: 'mid', verdict: 'X' },
    ])
    expect(r.falsePassRate).toBe(0.25)
  })

  it('탈락 구간의 O 비율을 오탈락률로 계산한다', () => {
    const r = buildReport([
      { stratum: 'rejected', verdict: 'O' },
      { stratum: 'rejected', verdict: 'X' },
      { stratum: 'rejected', verdict: 'X' },
      { stratum: 'rejected', verdict: 'X' },
    ])
    expect(r.falseRejectRate).toBe(0.25)
  })

  it('UNKNOWN 은 비율에서 제외한다', () => {
    // 모르는 곳에 억지로 답한 라벨을 섞으면 기준선이 오염된다
    const r = buildReport([
      { stratum: 'top', verdict: 'O' },
      { stratum: 'top', verdict: 'UNKNOWN' },
      { stratum: 'top', verdict: 'UNKNOWN' },
    ])
    expect(r.falsePassRate).toBe(0)
    expect(r.counts.top.unknown).toBe(2)
  })

  it('표본이 없으면 null 이다 (0% 로 착각하게 하지 않는다)', () => {
    const r = buildReport([{ stratum: 'top', verdict: 'O' }])
    expect(r.falseRejectRate).toBeNull()
    expect(r.boundaryPassRate).toBeNull()
  })

  it('경계 구간 통과율은 0.5 에 가까울 때 컷이 적절하다', () => {
    const r = buildReport([
      { stratum: 'boundary', verdict: 'O' },
      { stratum: 'boundary', verdict: 'X' },
    ])
    expect(r.boundaryPassRate).toBe(0.5)
  })

  it('X 이유를 집계한다', () => {
    const r = buildReport([
      { stratum: 'top', verdict: 'X', rejectReason: 'neighborhood' },
      { stratum: 'mid', verdict: 'X', rejectReason: 'neighborhood' },
      { stratum: 'mid', verdict: 'X', rejectReason: 'parking' },
      { stratum: 'mid', verdict: 'O', rejectReason: null },
    ])
    expect(r.reasons).toEqual({ neighborhood: 2, parking: 1 })
  })
})
