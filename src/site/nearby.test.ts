import { describe, it, expect } from 'vitest'
import { haversineKm, nearestByDomain, type GeoPoint } from './nearby.js'

describe('haversineKm', () => {
  it('같은 점은 0km', () => {
    const p: GeoPoint = { id: 'a', lat: 37.5, lng: 126.9 }
    expect(haversineKm(p, p)).toBe(0)
  })

  it('서울시청(37.5665,126.9780)과 인천시청(37.4563,126.7052) 거리가 실측과 비슷하다', () => {
    const seoul: GeoPoint = { id: 'seoul', lat: 37.5665, lng: 126.9780 }
    const incheon: GeoPoint = { id: 'incheon', lat: 37.4563, lng: 126.7052 }
    const km = haversineKm(seoul, incheon)
    // 실제 직선거리는 약 26.4km. ±1km 허용.
    expect(km).toBeGreaterThan(25)
    expect(km).toBeLessThan(28)
  })

  it('소수 첫째 자리로 반올림한다', () => {
    const seoul: GeoPoint = { id: 'seoul', lat: 37.5665, lng: 126.9780 }
    const incheon: GeoPoint = { id: 'incheon', lat: 37.4563, lng: 126.7052 }
    const km = haversineKm(seoul, incheon)
    expect(km).toBe(Math.round(km * 10) / 10)
  })
})

describe('nearestByDomain', () => {
  const anchor: GeoPoint = { id: 'anchor', lat: 37.5, lng: 126.9 }
  const near: GeoPoint = { id: 'near', lat: 37.501, lng: 126.901 }
  const mid: GeoPoint = { id: 'mid', lat: 37.55, lng: 126.95 }
  const far: GeoPoint = { id: 'far', lat: 38.5, lng: 127.9 }

  it('가까운 순으로 정렬해 limit개까지 반환한다', () => {
    const result = nearestByDomain([anchor], [far, near, mid], 2)
    const matches = result.get('anchor')
    expect(matches).toHaveLength(2)
    expect(matches?.[0].id).toBe('near')
    expect(matches?.[1].id).toBe('mid')
  })

  it('candidates가 limit보다 적으면 있는 만큼만 반환한다', () => {
    const result = nearestByDomain([anchor], [near], 5)
    expect(result.get('anchor')).toHaveLength(1)
  })

  it('candidates가 비어있으면 빈 배열을 반환한다', () => {
    const result = nearestByDomain([anchor], [], 5)
    expect(result.get('anchor')).toEqual([])
  })

  it('anchor가 여러 개면 각각 독립적으로 계산한다', () => {
    const anchor2: GeoPoint = { id: 'anchor2', lat: 38.4, lng: 127.8 }
    const result = nearestByDomain([anchor, anchor2], [near, far], 1)
    expect(result.get('anchor')?.[0].id).toBe('near')
    expect(result.get('anchor2')?.[0].id).toBe('far')
  })

  it('anchors가 비어있으면 빈 Map을 반환한다', () => {
    const result = nearestByDomain([], [near], 5)
    expect(result.size).toBe(0)
  })
})
