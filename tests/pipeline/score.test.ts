import { describe, it, expect } from 'vitest'
import {
  hotScore, familyFit, finalScore, pickWeekendCandidates,
} from '../../src/pipeline/score.js'

const NOW = new Date('2026-08-20T00:00:00Z')

const hot = (o: Partial<Parameters<typeof hotScore>[0]> = {}) => ({
  precision: 0.95,
  postsPer30: 80,
  acceleration: 1.0,
  latestPostDate: '2026-08-19',
  firstPostDate: '2022-01-01',
  ...o,
})

describe('hotScore', () => {
  it('0~100 범위를 벗어나지 않는다', () => {
    const s = hotScore(hot({ acceleration: 99, postsPer30: 9999 }), NOW)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(100)
  })

  it('가속도가 높을수록 점수가 높다', () => {
    expect(hotScore(hot({ acceleration: 4 }), NOW))
      .toBeGreaterThan(hotScore(hot({ acceleration: 1 }), NOW))
  })

  it('발행률이 높을수록 점수가 높다', () => {
    expect(hotScore(hot({ postsPer30: 200 }), NOW))
      .toBeGreaterThan(hotScore(hot({ postsPer30: 10 }), NOW))
  })

  it('precision 이 낮으면 전체가 비례해서 깎인다', () => {
    // v3 핵심: 컷이 아니라 승수. 경계선 위 오염 카페가 만점받는 것을 막는다.
    const clean = hotScore(hot({ precision: 1.0 }), NOW)
    const dirty = hotScore(hot({ precision: 0.4 }), NOW)
    expect(dirty).toBeCloseTo(clean * 0.4, 5)
  })

  it('precision 0 이면 점수가 0 이다', () => {
    expect(hotScore(hot({ precision: 0 }), NOW)).toBe(0)
  })

  it('신규 오픈에 가산점을 준다', () => {
    expect(hotScore(hot({ firstPostDate: '2026-07-01' }), NOW))
      .toBeGreaterThan(hotScore(hot({ firstPostDate: '2020-01-01' }), NOW))
  })

  it('최근 글이 없으면 신선도가 깎인다', () => {
    expect(hotScore(hot({ latestPostDate: '2025-01-01' }), NOW))
      .toBeLessThan(hotScore(hot({ latestPostDate: '2026-08-19' }), NOW))
  })

  it('날짜가 없어도 던지지 않는다', () => {
    const s = hotScore(hot({ latestPostDate: null, firstPostDate: null }), NOW)
    expect(Number.isFinite(s)).toBe(true)
  })

  it('가속도가 0 이하여도 던지지 않는다', () => {
    expect(Number.isFinite(hotScore(hot({ acceleration: 0 }), NOW))).toBe(true)
  })
})

const fit = (o: Partial<Parameters<typeof familyFit>[0]> = {}, now = NOW) =>
  familyFit(
    {
      driveMinutes: 60,
      parkingGrade: 'A',
      menuLevel: 3,
      lastVisitedOn: null,
      outdoorOnly: false,
      teenAppeal: 3,
      ...o,
    },
    now,
  )

describe('familyFit', () => {
  it('가까울수록 높다', () => {
    expect(fit({ driveMinutes: 30 })).toBeGreaterThan(fit({ driveMinutes: 120 }))
  })

  it('주차 D 는 0 이다', () => {
    expect(fit({ parkingGrade: 'D' })).toBe(0)
  })

  it('주차 등급이 낮을수록 깎인다', () => {
    expect(fit({ parkingGrade: 'A' })).toBeGreaterThan(fit({ parkingGrade: 'B' }))
    expect(fit({ parkingGrade: 'B' })).toBeGreaterThan(fit({ parkingGrade: '?' }))
    expect(fit({ parkingGrade: '?' })).toBeGreaterThan(fit({ parkingGrade: 'C' }))
  })

  it('최근 6개월 내 방문한 곳은 크게 깎인다', () => {
    const recent = fit({ lastVisitedOn: '2026-07-01' })
    expect(recent).toBeLessThan(fit() * 0.3)
    expect(recent).toBeGreaterThan(0) // 0 은 아니다 — "또 가고 싶다"를 허용
  })

  it('오래 전 방문은 거의 깎이지 않는다', () => {
    expect(fit({ lastVisitedOn: '2023-01-01' })).toBeGreaterThan(fit() * 0.7)
  })

  it('음료만 파는 곳(Lv1)은 감점된다', () => {
    expect(fit({ menuLevel: 1 })).toBeLessThan(fit({ menuLevel: 3 }))
  })

  it('한여름 야외 전용은 봄가을보다 낮다', () => {
    const summer = fit({ outdoorOnly: true }, new Date('2026-08-01T00:00:00Z'))
    const spring = fit({ outdoorOnly: true }, new Date('2026-05-01T00:00:00Z'))
    expect(summer).toBeLessThan(spring)
  })

  it('한겨울 야외 전용도 감점된다', () => {
    const winter = fit({ outdoorOnly: true }, new Date('2027-01-15T00:00:00Z'))
    const spring = fit({ outdoorOnly: true }, new Date('2026-05-01T00:00:00Z'))
    expect(winter).toBeLessThan(spring)
  })

  it('10대 적합도가 높으면 조금 오른다', () => {
    expect(fit({ teenAppeal: 5 })).toBeGreaterThan(fit({ teenAppeal: 0 }))
  })

  it('0 이상 값을 준다', () => {
    expect(fit({ driveMinutes: 999 })).toBeGreaterThanOrEqual(0)
  })
})

describe('finalScore', () => {
  it('두 점수의 곱이다', () => {
    expect(finalScore(50, 0.5)).toBe(25)
  })
})

describe('pickWeekendCandidates', () => {
  const c = (id: string, score: number, tags: string[]) => ({ id, score, tags })

  it('점수 순으로 뽑되 태그가 최소 2종 다르게 한다', () => {
    const picked = pickWeekendCandidates(
      [
        c('a', 90, ['정원마당형']),
        c('b', 89, ['정원마당형']),
        c('c', 88, ['정원마당형']),
        c('d', 50, ['창고형']),
      ],
      3,
    )
    expect(new Set(picked.flatMap((p) => p.tags)).size).toBeGreaterThanOrEqual(2)
    expect(picked[0]!.id).toBe('a')
    expect(picked).toHaveLength(3)
  })

  it('후보가 부족하면 있는 만큼만 준다', () => {
    expect(pickWeekendCandidates([c('a', 10, ['뷰맛집'])], 3)).toHaveLength(1)
  })

  it('다양성을 만들 수 없으면 점수 순으로 채운다', () => {
    const picked = pickWeekendCandidates(
      [c('a', 3, ['뷰맛집']), c('b', 2, ['뷰맛집']), c('c', 1, ['뷰맛집'])],
      3,
    )
    expect(picked).toHaveLength(3)
    expect(picked.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('빈 목록이면 빈 배열이다', () => {
    expect(pickWeekendCandidates([], 3)).toEqual([])
  })

  it('원본 배열을 변형하지 않는다', () => {
    const all = [c('a', 1, ['x']), c('b', 2, ['y'])]
    pickWeekendCandidates(all, 2)
    expect(all[0]!.id).toBe('a')
  })

  it('같은 후보를 두 번 넣지 않는다', () => {
    const picked = pickWeekendCandidates(
      [c('a', 9, ['정원마당형']), c('b', 8, ['정원마당형'])],
      3,
    )
    expect(new Set(picked.map((p) => p.id)).size).toBe(picked.length)
  })
})

describe('pickWeekendCandidates — 지역 상한', () => {
  const c = (id: string, score: number, region: string, tags = ['대형카페']) =>
    ({ id, score, region, tags })

  it('같은 시군구는 최대 2곳까지만 넣는다', () => {
    // 검증에서 10곳 중 고양시가 3곳이었고 둘은 같은 브랜드의 다른 지점이었다
    const out = pickWeekendCandidates([
      c('a', 90, '고양시', ['대형카페']),
      c('b', 80, '고양시', ['뷰맛집']),
      c('c', 70, '고양시', ['브런치카페']),
      c('d', 60, '파주시', ['창고형']),
    ], 3)
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'd'])
  })

  it('점수로 자리를 채울 때도 지역 상한을 지킨다', () => {
    // 태그가 모두 같아 다양성 제약이 걸리는 상황
    const out = pickWeekendCandidates([
      c('a', 90, '고양시'),
      c('b', 80, '고양시'),
      c('c', 70, '고양시'),
      c('d', 10, '김포시'),
    ], 3)
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'd'])
  })

  it('후보가 모자라면 상한을 풀어 자리를 채운다 — 빈 자리보다 낫다', () => {
    const out = pickWeekendCandidates([
      c('a', 90, '고양시'),
      c('b', 80, '고양시'),
      c('c', 70, '고양시'),
    ], 3)
    expect(out).toHaveLength(3)
  })

  it('region 이 없으면 상한을 적용하지 않는다 (기존 호출부 호환)', () => {
    const out = pickWeekendCandidates([
      { id: 'a', score: 90, tags: ['대형카페'] },
      { id: 'b', score: 80, tags: ['대형카페'] },
      { id: 'c', score: 70, tags: ['대형카페'] },
    ], 3)
    expect(out).toHaveLength(3)
  })
})
