import { describe, it, expect } from 'vitest'
import {
  parseReviewInput, summarize, sortByNewest, toggleVisit, todayInSeoul,
  MAX_COMMENT, MAX_NICKNAME, type Review,
} from './reviews'

const NOW = new Date('2026-08-20T14:30:00Z')

const review = (over: Partial<Review> = {}): Review => ({
  id: 'r1',
  kakaoPlaceId: '1',
  rating: 4,
  nickname: '엄마',
  comment: '빵이 맛있었어요',
  createdAt: '2026-08-20T00:00:00.000Z',
  ...over,
})

describe('parseReviewInput', () => {
  it('정상 입력을 통과시킨다', () => {
    const r = parseReviewInput({ kakaoPlaceId: '1', rating: 5, nickname: '아빠', comment: '좋다' }, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.review.rating).toBe(5)
    expect(r.review.nickname).toBe('아빠')
    expect(r.review.createdAt).toBe(NOW.toISOString())
  })

  it('별명과 후기가 없어도 별점만으로 남길 수 있다', () => {
    // 별점 한 번 누르는 것조차 귀찮으면 아무도 안 쓴다
    const r = parseReviewInput({ kakaoPlaceId: '1', rating: 3 }, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.review.nickname).toBe('')
    expect(r.review.comment).toBe('')
  })

  it('카페 id 가 없으면 거부한다', () => {
    expect(parseReviewInput({ kakaoPlaceId: '', rating: 3 }, NOW).ok).toBe(false)
    expect(parseReviewInput({ kakaoPlaceId: 42, rating: 3 }, NOW).ok).toBe(false)
  })

  it('반개 단위 별점을 받는다', () => {
    for (const rating of [0.5, 1, 2.5, 4.5, 5]) {
      const r = parseReviewInput({ kakaoPlaceId: '1', rating }, NOW)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.review.rating).toBe(rating)
    }
  })

  it('범위 밖이거나 반개가 아니면 거부한다', () => {
    for (const rating of [0, 6, -1, 2.3, 4.75, 'x', null, undefined]) {
      expect(parseReviewInput({ kakaoPlaceId: '1', rating }, NOW).ok).toBe(false)
    }
  })

  it('긴 별명·후기는 거부한다 (자르지 않는다)', () => {
    // 조용히 잘라 저장하면 쓴 사람이 자기 글이 사라진 줄 안다
    const long = parseReviewInput(
      { kakaoPlaceId: '1', rating: 3, nickname: 'ㄱ'.repeat(MAX_NICKNAME + 1) },
      NOW,
    )
    expect(long.ok).toBe(false)
    const longer = parseReviewInput(
      { kakaoPlaceId: '1', rating: 3, comment: 'ㄱ'.repeat(MAX_COMMENT + 1) },
      NOW,
    )
    expect(longer.ok).toBe(false)
  })

  it('앞뒤 공백을 다듬는다', () => {
    const r = parseReviewInput({ kakaoPlaceId: ' 1 ', rating: 3, nickname: '  엄마 ' }, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.review.kakaoPlaceId).toBe('1')
    expect(r.review.nickname).toBe('엄마')
  })

  it('id 가 매번 다르다 (같은 사람이 두 번 남길 수 있다)', () => {
    const a = parseReviewInput({ kakaoPlaceId: '1', rating: 3 }, NOW)
    const b = parseReviewInput({ kakaoPlaceId: '1', rating: 3 }, NOW)
    expect(a.ok && b.ok && a.review.id !== b.review.id).toBe(true)
  })
})

describe('summarize', () => {
  it('평균과 개수를 낸다', () => {
    expect(summarize([review({ rating: 5 }), review({ rating: 4 })]))
      .toEqual({ count: 2, average: 4.5 })
  })

  it('반개 별점도 평균에 들어간다', () => {
    expect(summarize([review({ rating: 4.5 }), review({ rating: 3.5 })]).average).toBe(4)
  })

  it('소수 첫째 자리까지만 쓴다', () => {
    const three = [review({ rating: 5 }), review({ rating: 4 }), review({ rating: 4 })]
    expect(summarize(three).average).toBe(4.3)
  })

  it('후기가 없으면 0 이다', () => {
    expect(summarize([])).toEqual({ count: 0, average: 0 })
  })
})

describe('sortByNewest', () => {
  it('최근 것이 위로 온다', () => {
    const rows = [
      review({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      review({ id: 'new', createdAt: '2026-08-01T00:00:00.000Z' }),
    ]
    expect(sortByNewest(rows).map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('원본을 바꾸지 않는다', () => {
    const rows = [review({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }), review({ id: 'b' })]
    sortByNewest(rows)
    expect(rows[0]!.id).toBe('a')
  })
})

describe('toggleVisit', () => {
  it('없으면 추가한다', () => {
    expect(toggleVisit([], '1', '2026-08-20')).toEqual([
      { kakaoPlaceId: '1', visitedOn: '2026-08-20' },
    ])
  })

  it('같은 날 다시 누르면 취소한다', () => {
    // 잘못 눌렀을 때 되돌릴 길이 없으면 사람은 누르기를 망설인다
    const rows = [{ kakaoPlaceId: '1', visitedOn: '2026-08-20' }]
    expect(toggleVisit(rows, '1', '2026-08-20')).toEqual([])
  })

  it('다른 날 방문은 따로 쌓인다', () => {
    const rows = [{ kakaoPlaceId: '1', visitedOn: '2026-05-01' }]
    expect(toggleVisit(rows, '1', '2026-08-20')).toHaveLength(2)
  })

  it('다른 카페의 기록은 건드리지 않는다', () => {
    const rows = [
      { kakaoPlaceId: '1', visitedOn: '2026-08-20' },
      { kakaoPlaceId: '2', visitedOn: '2026-08-20' },
    ]
    expect(toggleVisit(rows, '1', '2026-08-20')).toEqual([
      { kakaoPlaceId: '2', visitedOn: '2026-08-20' },
    ])
  })

  it('메모가 달린 기록도 보존한다', () => {
    const rows = [{ kakaoPlaceId: '2', visitedOn: '2026-05-01', note: '빵 맛집' }]
    const next = toggleVisit(rows, '1', '2026-08-20')
    expect(next.find((v) => v.kakaoPlaceId === '2')!.note).toBe('빵 맛집')
  })
})

describe('todayInSeoul', () => {
  it('UTC 밤이어도 한국 날짜로 기록한다', () => {
    // 한국 시간 8월 21일 오전 7시 = UTC 8월 20일 22시
    expect(todayInSeoul(new Date('2026-08-20T22:00:00Z'))).toBe('2026-08-21')
  })

  it('한낮에는 그대로다', () => {
    expect(todayInSeoul(new Date('2026-08-20T03:00:00Z'))).toBe('2026-08-20')
  })
})
