import { describe, expect, it } from 'vitest'
import { naverMapLink, placeQuery, sidoOf } from '../../src/pipeline/place-query.js'
import type { Cafe } from '../../src/schema.js'

const cafe = (over: Partial<Cafe>): Cafe => ({
  name: '카페숨', sigungu: '광주시', roadAddress: '경기 광주시 남한산성면 1',
  ...over,
} as Cafe)

describe('sidoOf', () => {
  it('주소 앞 두 글자가 시도다', () => {
    expect(sidoOf({ roadAddress: '경기 광주시 남한산성면 1' })).toBe('경기')
    expect(sidoOf({ address: '서울 강서구 마곡동 1' })).toBe('서울')
    expect(sidoOf({ roadAddress: '인천 중구 공항로 271' })).toBe('인천')
  })

  it('도로명이 지번보다 우선이다', () => {
    expect(sidoOf({ roadAddress: '인천 중구 1', address: '서울 중구 1' })).toBe('인천')
  })

  it('주소가 없으면 빈 문자열', () => {
    expect(sidoOf({})).toBe('')
    expect(sidoOf({ roadAddress: null, address: null })).toBe('')
  })
})

describe('placeQuery', () => {
  it('시도를 붙인다 — `광주시 카페숨` 은 전남 광주 결과를 준다 (실측)', () => {
    expect(placeQuery(cafe({}))).toBe('경기 광주시 카페숨')
  })

  it('동명 시군구를 가른다', () => {
    expect(placeQuery(cafe({ name: 'A', sigungu: '중구', roadAddress: '서울 중구 1' })))
      .toBe('서울 중구 A')
    expect(placeQuery(cafe({ name: 'A', sigungu: '중구', roadAddress: '인천 중구 1' })))
      .toBe('인천 중구 A')
  })

  it('시도를 모르면 시군구부터 쓴다 — 빈 칸이 앞에 붙지 않는다', () => {
    expect(placeQuery(cafe({ roadAddress: null, address: null }))).toBe('광주시 카페숨')
  })
})

describe('naverMapLink', () => {
  it('검색 주소로 만든다', () => {
    const url = naverMapLink(cafe({}))
    expect(url.startsWith('https://map.naver.com/p/search/')).toBe(true)
    expect(decodeURIComponent(url.split('/search/')[1]!)).toBe('경기 광주시 카페숨')
  })

  it('공백과 한글을 안전하게 감싼다', () => {
    expect(naverMapLink(cafe({}))).not.toContain(' ')
  })
})
