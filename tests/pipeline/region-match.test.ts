import { describe, it, expect } from 'vitest'
import { belongsToRegion, isOutOfMetroArea } from '../../src/pipeline/region-match.js'
import type { Region } from '../../src/config/regions.js'

const seoulGangseo: Region = { sido: '서울', sigungu: '강서구' }
const incheonJung: Region = { sido: '인천', sigungu: '중구' }
const gyeonggiGwangju: Region = { sido: '경기', sigungu: '광주시' }

describe('belongsToRegion', () => {
  it('같은 시도·시군구면 통과한다', () => {
    expect(belongsToRegion(
      { addressName: '서울 강서구 마곡동 790-1', lat: 37.56, lng: 126.82 },
      seoulGangseo,
    )).toBe(true)
  })

  it('부산 강서구를 서울 강서구로 받지 않는다', () => {
    // 실측 오염: "서울 강서구 베이커리카페" 검색에 부산 강서구 8곳이 섞였다
    expect(belongsToRegion(
      { addressName: '부산 강서구 식만동 828-8', lat: 35.209, lng: 128.909 },
      seoulGangseo,
    )).toBe(false)
  })

  it('대구·대전을 인천 중구로 받지 않는다', () => {
    expect(belongsToRegion(
      { addressName: '대구 서구 평리동 1674', lat: 35.871, lng: 128.564 },
      incheonJung,
    )).toBe(false)
    expect(belongsToRegion(
      { addressName: '대전 서구 관저동 1340', lat: 36.299, lng: 127.34 },
      incheonJung,
    )).toBe(false)
  })

  it('전남광주를 경기 광주시로 받지 않는다', () => {
    // 카페숨: 추정 441분이 골든셋 중간대까지 올라왔다
    expect(belongsToRegion(
      { addressName: '전남광주통합특별시 해남군 해남읍 남외리 142-3', lat: 34.568, lng: 126.594 },
      gyeonggiGwangju,
    )).toBe(false)
  })

  it('같은 시도의 이웃 시군구는 거르지 않는다', () => {
    // 카카오는 인접 구 카페를 함께 준다 (서대문구 검색에 마포구 48곳).
    // 차로 가는 가족에게 인접 구 카페는 버릴 이유가 없다.
    expect(belongsToRegion(
      { addressName: '경기 남양주시 조안면 232', lat: 37.55, lng: 127.3 },
      { sido: '경기', sigungu: '가평군' },
    )).toBe(true)
  })

  it('인천 개편으로 신설된 구 이름도 통과시킨다', () => {
    // 주소는 제물포구·영종구·서해구·검단구인데 우리 목록은 중구·동구·서구다.
    // 시군구를 대조하면 정상 카페 1,731곳이 잘못 걸린다 (실측).
    expect(belongsToRegion(
      { addressName: '인천 제물포구 신흥동 1', lat: 37.46, lng: 126.63 },
      incheonJung,
    )).toBe(true)
    expect(belongsToRegion(
      { addressName: '인천 서해구 청라동 1', lat: 37.53, lng: 126.63 },
      { sido: '인천', sigungu: '서구' },
    )).toBe(true)
  })

  it('강원·충청은 1차 범위 밖이므로 거른다', () => {
    expect(belongsToRegion(
      { addressName: '강원특별자치도 춘천시 남산면 1', lat: 37.79, lng: 127.55 },
      { sido: '경기', sigungu: '가평군' },
    )).toBe(false)
    expect(belongsToRegion(
      { addressName: '충남 천안시 1', lat: 36.8, lng: 127.1 },
      { sido: '경기', sigungu: '평택시' },
    )).toBe(false)
  })

  it('지번 주소가 없으면 도로명 주소를 본다', () => {
    expect(belongsToRegion(
      { addressName: '', roadAddressName: '서울 강서구 공항대로 260', lat: 37.55, lng: 126.8 },
      seoulGangseo,
    )).toBe(true)
  })

  it('주소가 아예 없으면 수도권 좌표 범위로 판단한다', () => {
    expect(belongsToRegion({ lat: 37.5, lng: 126.9 }, seoulGangseo)).toBe(true)
    expect(belongsToRegion({ lat: 35.2, lng: 128.9 }, seoulGangseo)).toBe(false)
  })

  it('null 주소도 던지지 않는다', () => {
    expect(belongsToRegion(
      { addressName: null, roadAddressName: null, lat: 37.5, lng: 126.9 },
      seoulGangseo,
    )).toBe(true)
  })
})

describe('isOutOfMetroArea', () => {
  it('수도권 안이면 false', () => {
    expect(isOutOfMetroArea({ lat: 37.5074, lng: 126.7218 })).toBe(false) // 부평
    expect(isOutOfMetroArea({ lat: 37.49, lng: 127.48 })).toBe(false) // 양평
  })

  it('부산·대구·전남은 true', () => {
    expect(isOutOfMetroArea({ lat: 35.209, lng: 128.909 })).toBe(true)
    expect(isOutOfMetroArea({ lat: 35.871, lng: 128.564 })).toBe(true)
    expect(isOutOfMetroArea({ lat: 34.568, lng: 126.594 })).toBe(true)
  })
})
