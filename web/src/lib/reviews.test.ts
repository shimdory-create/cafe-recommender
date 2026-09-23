import { describe, it, expect } from 'vitest'
import {
  applyReviewPatch, parseReviewInput, removeReview, summarize, sortByNewest,
  addVisit, removeVisit, todayInSeoul,
  addAlive, removeAlive, isConfirmedAlive, ALIVE_GRACE_DAYS,
  MAX_COMMENT, MAX_NICKNAME, type Review, type VisitRow, type AliveRow,
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

describe('addVisit', () => {
  it('없으면 추가한다', () => {
    expect(addVisit([], '1', '2026-08-20')).toEqual([
      { kakaoPlaceId: '1', visitedOn: '2026-08-20' },
    ])
  })

  it('같은 날 두 번 눌러도 한 건이다', () => {
    const rows: VisitRow[] = [{ kakaoPlaceId: '1', visitedOn: '2026-08-20' }]
    expect(addVisit(rows, '1', '2026-08-20')).toEqual(rows)
  })

  it('다른 날 방문은 따로 쌓인다', () => {
    const rows: VisitRow[] = [{ kakaoPlaceId: '1', visitedOn: '2026-05-01' }]
    expect(addVisit(rows, '1', '2026-08-20')).toHaveLength(2)
  })
})

describe('removeVisit', () => {
  it('가장 최근 방문만 지운다', () => {
    // 전부 지우면 작년에 갔던 기록까지 사라진다
    const rows: VisitRow[] = [
      { kakaoPlaceId: '1', visitedOn: '2025-03-01' },
      { kakaoPlaceId: '1', visitedOn: '2026-08-20' },
    ]
    expect(removeVisit(rows, '1')).toEqual([{ kakaoPlaceId: '1', visitedOn: '2025-03-01' }])
  })

  it('어제 잘못 누른 것도 취소된다 (날짜를 받지 않는다)', () => {
    const rows: VisitRow[] = [{ kakaoPlaceId: '1', visitedOn: '2026-08-19' }]
    expect(removeVisit(rows, '1')).toEqual([])
  })

  it('다른 카페의 기록은 건드리지 않는다', () => {
    const rows: VisitRow[] = [
      { kakaoPlaceId: '1', visitedOn: '2026-08-20' },
      { kakaoPlaceId: '2', visitedOn: '2026-08-20', note: '빵 맛집' },
    ]
    const next = removeVisit(rows, '1')
    expect(next).toHaveLength(1)
    expect(next[0]!.note).toBe('빵 맛집')
  })

  it('기록이 없으면 그대로 둔다', () => {
    expect(removeVisit([], '1')).toEqual([])
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

describe('applyReviewPatch', () => {
  const NOW = new Date('2026-08-24T12:00:00.000Z')
  const rows: Review[] = [
    {
      id: 'a', kakaoPlaceId: 'c1', rating: 3, nickname: '김', comment: '보통',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'b', kakaoPlaceId: 'c1', rating: 5, nickname: '심', comment: '좋음',
      createdAt: '2026-08-02T00:00:00.000Z',
    },
  ]

  it('한 건만 바꾼다', () => {
    const out = applyReviewPatch(rows, 'a', { rating: 4.5, comment: '다시 가보니 좋다' }, NOW)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0]!.rating).toBe(4.5)
    expect(out.rows[0]!.comment).toBe('다시 가보니 좋다')
    expect(out.rows[1]).toEqual(rows[1])
  })

  it('createdAt 은 그대로 두고 updatedAt 을 남긴다', () => {
    // 고쳤다고 순서가 튀어 오르면 "새 후기가 올라왔나" 로 읽힌다
    const out = applyReviewPatch(rows, 'a', { rating: 4 }, NOW)
    if (!out.ok) throw new Error('실패')
    expect(out.review.createdAt).toBe('2026-08-01T00:00:00.000Z')
    expect(out.review.updatedAt).toBe(NOW.toISOString())
  })

  it('카페는 바꿀 수 없다', () => {
    const out = applyReviewPatch(rows, 'a', { rating: 4 } as never, NOW)
    if (!out.ok) throw new Error('실패')
    expect(out.review.kakaoPlaceId).toBe('c1')
  })

  it('없는 id 는 거절한다', () => {
    const out = applyReviewPatch(rows, 'zzz', { rating: 4 }, NOW)
    expect(out.ok).toBe(false)
  })

  it('별점 규칙은 새로 남길 때와 같다', () => {
    expect(applyReviewPatch(rows, 'a', { rating: 4.3 }, NOW).ok).toBe(false)
    expect(applyReviewPatch(rows, 'a', { rating: 0 }, NOW).ok).toBe(false)
    expect(applyReviewPatch(rows, 'a', { rating: 5.5 }, NOW).ok).toBe(false)
  })

  it('원본을 건드리지 않는다 — 충돌 시 다시 불린다', () => {
    const copy = structuredClone(rows)
    applyReviewPatch(rows, 'a', { rating: 1 }, NOW)
    expect(rows).toEqual(copy)
  })
})

describe('removeReview', () => {
  const rows: Review[] = [
    { id: 'a', kakaoPlaceId: 'c1', rating: 3, nickname: '', comment: '', createdAt: 'x' },
    { id: 'b', kakaoPlaceId: 'c1', rating: 5, nickname: '', comment: '', createdAt: 'y' },
  ]

  it('한 건만 지운다', () => {
    expect(removeReview(rows, 'a').map((r) => r.id)).toEqual(['b'])
  })

  it('없는 id 는 아무것도 안 한다 — 두 번 눌러도 안전하다', () => {
    expect(removeReview(rows, 'zzz')).toEqual(rows)
  })
})

describe('addAlive / removeAlive / isConfirmedAlive', () => {
  it('확인하면 목록에 추가된다', () => {
    const rows = addAlive([], '1', '2026-08-20T00:00:00.000Z')
    expect(rows).toEqual([{ kakaoPlaceId: '1', confirmedAt: '2026-08-20T00:00:00.000Z' }])
  })

  it('같은 곳을 또 확인하면 확인 시각만 최신으로 미룬다 (중복 안 쌓인다)', () => {
    const rows = addAlive(
      [{ kakaoPlaceId: '1', confirmedAt: '2026-01-01T00:00:00.000Z' }],
      '1', '2026-08-20T00:00:00.000Z',
    )
    expect(rows).toEqual([{ kakaoPlaceId: '1', confirmedAt: '2026-08-20T00:00:00.000Z' }])
  })

  it('removeAlive는 해당 id만 지운다', () => {
    const rows: AliveRow[] = [{ kakaoPlaceId: '1', confirmedAt: NOW.toISOString() }]
    expect(removeAlive(rows, '1')).toEqual([])
  })

  it(`확인한 지 ${ALIVE_GRACE_DAYS}일이 안 지났으면 살아있는 걸로 본다`, () => {
    const rows: AliveRow[] = [{ kakaoPlaceId: '1', confirmedAt: '2026-08-01T00:00:00.000Z' }]
    expect(isConfirmedAlive(rows, '1', new Date('2026-08-20T00:00:00.000Z'))).toBe(true)
  })

  it(`확인한 지 ${ALIVE_GRACE_DAYS}일이 지나면 다시 폐업 의심 대상이다`, () => {
    const rows: AliveRow[] = [{ kakaoPlaceId: '1', confirmedAt: '2026-01-01T00:00:00.000Z' }]
    expect(isConfirmedAlive(rows, '1', new Date('2026-08-20T00:00:00.000Z'))).toBe(false)
  })

  it('확인 기록이 없으면 false다', () => {
    expect(isConfirmedAlive([], '1', NOW)).toBe(false)
  })
})
