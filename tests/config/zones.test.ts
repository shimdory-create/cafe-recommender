import { describe, it, expect } from 'vitest'
import { zoneOf, unassignedRegions, ZONES } from '../../src/config/zones.js'
import { REGIONS } from '../../src/config/regions.js'

describe('zoneOf', () => {
  it('서울은 시도로 가른다 — 서울 중구와 인천 중구가 동명이다', () => {
    expect(zoneOf({ sido: '서울', sigungu: '중구' })).toBe('seoul')
    expect(zoneOf({ sido: '인천', sigungu: '중구' })).toBe('near')
  })

  it('시도가 없으면 주소 앞 두 글자로 본다', () => {
    expect(zoneOf({ sigungu: '중구', roadAddress: '서울 중구 세종대로 1' })).toBe('seoul')
    expect(zoneOf({ sigungu: '중구', address: '인천 중구 항동 1' })).toBe('near')
  })

  it('방향 배정이 감각과 맞는다', () => {
    expect(zoneOf({ sido: '인천', sigungu: '강화군' })).toBe('west')
    expect(zoneOf({ sido: '경기', sigungu: '김포시' })).toBe('west')
    expect(zoneOf({ sido: '경기', sigungu: '파주시' })).toBe('north')
    expect(zoneOf({ sido: '경기', sigungu: '양평군' })).toBe('east')
    expect(zoneOf({ sido: '경기', sigungu: '하남시' })).toBe('east')
    expect(zoneOf({ sido: '경기', sigungu: '용인시' })).toBe('south')
    expect(zoneOf({ sido: '경기', sigungu: '부천시' })).toBe('near')
  })

  it('수도권 65개 시군구가 모두 배정되어 있다', () => {
    // 지역이 늘어나면 여기서 잡힌다. 미배정은 조용히 near 로 떨어지므로
    // 테스트가 없으면 서울 밖 카페가 "가까운 곳" 에 섞인다.
    expect(unassignedRegions(REGIONS)).toEqual([])
  })

  it('방향은 6개이고 id 가 중복되지 않는다', () => {
    expect(ZONES).toHaveLength(6)
    expect(new Set(ZONES.map((z) => z.id)).size).toBe(6)
  })
})
