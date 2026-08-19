import { describe, it, expect } from 'vitest'
import { REGIONS, scanTargets } from '../../src/config/regions.js'
import { SEARCH_KEYWORDS, curationQueries } from '../../src/config/keywords.js'

describe('REGIONS', () => {
  it('수도권 66개 시군구를 담는다', () => {
    expect(REGIONS).toHaveLength(66)
  })

  it('시도별 개수가 행정구역과 일치한다', () => {
    const count = (sido: string) => REGIONS.filter((r) => r.sido === sido).length
    expect(count('서울')).toBe(25)
    expect(count('인천')).toBe(10)
    expect(count('경기')).toBe(31)
  })

  it('시군구 이름에 중복이 없다', () => {
    // 서울 중구와 인천 중구가 둘 다 있으므로 시도를 포함해 검사한다
    const names = REGIONS.map((r) => `${r.sido} ${r.sigungu}`)
    expect(new Set(names).size).toBe(names.length)
  })

  it('동명 시군구(중구)가 시도로 구분된다', () => {
    expect(REGIONS.filter((r) => r.sigungu === '중구')).toHaveLength(2)
  })

  it('옹진군은 여객선 전용이므로 스캔에서 제외한다', () => {
    const ongjin = REGIONS.find((r) => r.sigungu === '옹진군')
    expect(ongjin?.excluded).toMatch(/여객선/)
    expect(scanTargets().some((r) => r.sigungu === '옹진군')).toBe(false)
  })

  it('스캔 대상은 65개다', () => {
    expect(scanTargets()).toHaveLength(65)
  })

  it('부평구가 목록에 있다 (출발지)', () => {
    expect(REGIONS.some((r) => r.sido === '인천' && r.sigungu === '부평구')).toBe(true)
  })
})

describe('keywords', () => {
  it('그물 A 키워드는 6종이다', () => {
    expect(SEARCH_KEYWORDS).toHaveLength(6)
  })

  it('그물 C 검색어에 지역명이 들어간다', () => {
    const qs = curationQueries('경기 양평군')
    expect(qs.length).toBeGreaterThan(0)
    expect(qs.every((q) => q.includes('경기 양평군'))).toBe(true)
  })
})
