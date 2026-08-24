import { describe, expect, it } from 'vitest'
import { orderPending } from '../../src/jobs/classify.js'
import type { BuzzSnapshot, Cafe } from '../../src/schema.js'

const cafe = (id: string, drive: number): Cafe => ({
  kakaoPlaceId: id,
  name: `카페${id}`,
  sigungu: '연수구',
  lat: 37.4,
  lng: 126.6,
  driveMinutes: drive,
  firstSeenAt: '2026-08-20T00:00:00.000Z',
  status: 'pending_extraction',
  ambiguousName: false,
  attributes: null,
  tags: [],
} as unknown as Cafe)

const buzzOf = (pairs: [string, number][]): Map<string, BuzzSnapshot> =>
  new Map(pairs.map(([id, rate]) => [id, { postsPer30: rate } as BuzzSnapshot]))

/**
 * 화제량 순으로만 돌렸더니 집 근처가 몇 주째 대기에 남았다 —
 * 송도 75곳 중 판정 완료 10곳, 영종 92곳 중 7곳 (실측 2026-08-24).
 */
describe('orderPending', () => {
  // 집 근처 조용한 곳 5 + 멀고 뜨거운 곳 5
  //   n1~n5  거리 20~40, 화제량 1~2   <- 화제량 순 줄에서는 영원히 뒤
  //   h1~h5  거리 70~90, 화제량 30~50
  const near = [1, 2, 3, 4, 5].map((i) => cafe(`n${i}`, 15 + i * 5))
  const hot = [1, 2, 3, 4, 5].map((i) => cafe(`h${i}`, 95 - i * 5))
  const pending = [...near, ...hot]
  const latest = buzzOf([
    ...near.map((c, i) => [c.kakaoPlaceId, 2 - i * 0.2] as [string, number]),
    ...hot.map((c, i) => [c.kakaoPlaceId, 50 - i * 4] as [string, number]),
  ])

  it('hot 은 화제량만 본다 (예전 동작)', () => {
    const out = orderPending(pending, latest, { order: 'hot', limit: 5 })
    expect(out.slice(0, 5).map((c) => c.kakaoPlaceId)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5'])
  })

  it('near 는 거리만 본다', () => {
    const out = orderPending(pending, latest, { order: 'near', limit: 5 })
    expect(out.slice(0, 5).map((c) => c.kakaoPlaceId)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5'])
  })

  it('mixed 는 하루 몫의 30% 를 가까운 곳에 준다', () => {
    // 대기 10곳에 하루 몫 8곳이면 둘이 거리 몫이다.
    // 이 둘이 없으면 집 근처는 영원히 안 나온다
    const out = orderPending(pending, latest, { order: 'mixed', limit: 8 })
    expect(out.slice(0, 2).map((c) => c.kakaoPlaceId)).toEqual(['n1', 'n2'])
  })

  it('mixed 에서도 뜨거운 곳이 그날 몫 안에 다 들어온다', () => {
    const ids = orderPending(pending, latest, { order: 'mixed', limit: 8 })
      .slice(0, 8).map((c) => c.kakaoPlaceId)
    for (const h of ['h1', 'h2', 'h3', 'h4', 'h5']) expect(ids).toContain(h)
  })

  it('한 곳도 두 번 나오지 않는다', () => {
    const out = orderPending(pending, latest, { order: 'mixed', limit: 6 })
    expect(new Set(out.map((c) => c.kakaoPlaceId)).size).toBe(out.length)
    expect(out).toHaveLength(pending.length)
  })

  it('상한이 대기 수보다 크면 순서가 결과를 바꾸지 않는다', () => {
    // 전량 처리하므로 화제량 순 그대로 둔다
    const out = orderPending(pending, latest, { order: 'mixed', limit: 999 })
    expect(out[0]!.kakaoPlaceId).toBe('h1')
  })

  it('이동시간을 모르면 뒤로 보낸다', () => {
    const unknown = { ...cafe('z', 0), driveMinutes: null, driveMinutesEst: null } as Cafe
    const out = orderPending([...pending, unknown], latest, { order: 'near' })
    expect(out.at(-1)!.kakaoPlaceId).toBe('z')
  })

  it('실측 추정치라도 있으면 쓴다', () => {
    const est = { ...cafe('y', 0), driveMinutes: null, driveMinutesEst: 15 } as Cafe
    const out = orderPending([...pending, est], latest, { order: 'near' })
    expect(out[0]!.kakaoPlaceId).toBe('y')
  })

  it('file 은 손대지 않는다', () => {
    expect(orderPending(pending, latest, { order: 'file' })).toBe(pending)
  })

  it('화제량이 같으면 순서가 흔들리지 않는다', () => {
    const tied = [cafe('p', 50), cafe('q', 50)]
    const b = buzzOf([['p', 5], ['q', 5]])
    expect(orderPending(tied, b, { order: 'hot' }).map((c) => c.kakaoPlaceId)).toEqual(['p', 'q'])
    expect(orderPending([...tied].reverse(), b, { order: 'hot' }).map((c) => c.kakaoPlaceId))
      .toEqual(['p', 'q'])
  })
})
