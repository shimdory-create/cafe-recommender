import { describe, it, expect, vi } from 'vitest'

// site.ts/restaurant-site.ts/spot-site.ts 는 모듈 최상단에서 즉시
// `payload.stats.revisitDays`/`staleDays` 를 읽는다(REVISIT_DAYS 등 상수
// 초기화). 브리프의 목에는 `stats` 가 없어서 import 시점에 TypeError 가
// 났다 — 그래서 최소한의 stats 를 채워 넣었다(값 자체는 이 테스트가
// 검증하는 대상이 아니다).
const stats = { revisitDays: 180, staleDays: 60 }

vi.mock('../generated/site.json', () => ({
  default: {
    stats,
    week: [],
    cafes: [{
      id: 'c1', name: '카페', lat: 37.5, lng: 126.9, imageUrl: 'c.jpg',
      tags: ['대형'], sigungu: '부평구', ratingAvg: 4, ratingCount: 2, cityOnly: false,
    }],
  },
}))
vi.mock('../generated/site-cafe-nearby.json', () => ({ default: {} }))
vi.mock('../generated/site-restaurant.json', () => ({
  default: {
    stats,
    week: [],
    restaurants: [{
      id: 'r1', name: '식당', lat: 37.501, lng: 126.901, imageUrl: 'r.jpg',
      tags: ['한식'], sigungu: '부평구', ratingAvg: 0, ratingCount: 0, cityOnly: false,
    }],
  },
}))
vi.mock('../generated/site-restaurant-nearby.json', () => ({ default: {} }))
vi.mock('../generated/site-spot.json', () => ({ default: { stats, week: [], spots: [] } }))
vi.mock('../generated/site-spot-nearby.json', () => ({ default: {} }))

const { resolveNearbyCards } = await import('./nearby-resolve')

describe('resolveNearbyCards', () => {
  it('id로 리스트 페이로드를 찾아 NearbyCard 모양으로 조립한다', () => {
    const out = resolveNearbyCards('cafe', 'c1', 'restaurant', [
      { id: 'r1', distanceKm: 0.5, driveMinutes: 3 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      id: 'r1', name: '식당', imageUrl: 'r.jpg', tags: ['한식'], sigungu: '부평구',
      ratingAvg: 0, ratingCount: 0, distanceKm: 0.5, driveMinutes: 3,
      directionsUrl: 'https://map.naver.com/p/directions/126.9,37.5,%EC%B9%B4%ED%8E%98/126.901,37.501,%EC%8B%9D%EB%8B%B9/-/car',
    })
  })

  it('앵커를 못 찾으면 빈 배열을 돌려준다', () => {
    const out = resolveNearbyCards('cafe', '없는id', 'restaurant', [
      { id: 'r1', distanceKm: 0.5, driveMinutes: 3 },
    ])
    expect(out).toEqual([])
  })

  it('후보 중 일부를 못 찾으면 그 항목만 건너뛴다', () => {
    const out = resolveNearbyCards('cafe', 'c1', 'restaurant', [
      { id: 'r1', distanceKm: 0.5, driveMinutes: 3 },
      { id: '없는id', distanceKm: 1, driveMinutes: 5 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('r1')
  })

  it('driveMinutes가 null이어도 정상 조립된다(distanceKm 폴백용)', () => {
    const out = resolveNearbyCards('cafe', 'c1', 'restaurant', [
      { id: 'r1', distanceKm: 0.5, driveMinutes: null },
    ])
    expect(out[0]!.driveMinutes).toBeNull()
    expect(out[0]!.distanceKm).toBe(0.5)
  })
})
