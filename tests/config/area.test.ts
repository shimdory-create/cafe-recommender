import { describe, expect, it } from 'vitest'
import { areaLabel, areaOf } from '../../src/config/area.js'
import { REGIONS } from '../../src/config/regions.js'

describe('areaOf', () => {
  it('서울은 구를 가르지 않고 하나로 묶는다', () => {
    expect(areaOf({ sigungu: '종로구', roadAddress: '서울 종로구 삼일대로 428' })).toBe('서울')
    expect(areaOf({ sigungu: '강남구', roadAddress: '서울 강남구 도산대로 1' })).toBe('서울')
  })

  it('인천도 하나로 묶는다 — 집이 부평이라 안에서 가를 이유가 없다', () => {
    expect(areaOf({ sigungu: '연수구', roadAddress: '인천 연수구 컨벤시아대로 1' })).toBe('인천')
    expect(areaOf({ sigungu: '강화군', address: '인천 강화군 길상면' })).toBe('인천')
  })

  it('경기는 시군 그대로다 — 이미 시 단위로 저장돼 있다', () => {
    expect(areaOf({ sigungu: '용인시', roadAddress: '경기 용인시 처인구 백령로 1' })).toBe('용인시')
    expect(areaOf({ sigungu: '양평군', roadAddress: '경기 양평군 서종면 북한강로 1' })).toBe('양평군')
  })

  it('동명 시군구는 시도로 가른다 — 순서가 바뀌면 서울 중구가 인천으로 간다', () => {
    expect(areaOf({ sigungu: '중구', roadAddress: '서울 중구 세종대로 110' })).toBe('서울')
    expect(areaOf({ sigungu: '중구', roadAddress: '인천 중구 공항로 271' })).toBe('인천')
  })

  it('주소가 없으면 보조 신호로 판단한다', () => {
    expect(areaOf({ sigungu: '종로구', zone: 'seoul' })).toBe('서울')
    expect(areaOf({ sigungu: '부평구' })).toBe('인천')
    expect(areaOf({ sigungu: '파주시' })).toBe('파주시')
  })

  it('도로명이 지번보다 우선이다', () => {
    expect(areaOf({
      sigungu: '중구',
      roadAddress: '인천 중구 공항로 271',
      address: '서울 중구 어딘가',
    })).toBe('인천')
  })

  it('수집 대상 지역 전체가 셋 중 하나로 떨어진다', () => {
    // 지역이 늘었는데 배정이 빠지면 여기서 잡힌다
    for (const r of REGIONS) {
      if (r.excluded) continue
      const city = areaOf({ sigungu: r.sigungu, roadAddress: `${r.sido} ${r.sigungu} 1` })
      expect(city === '서울' || city === '인천' || city === r.sigungu).toBe(true)
    }
  })
})

describe('areaLabel', () => {
  it('칩에서는 접미사를 줄인다 — 29개를 나란히 놓으면 한 글자가 줄 수를 바꾼다', () => {
    expect(areaLabel('남양주시')).toBe('남양주')
    expect(areaLabel('양평군')).toBe('양평')
  })

  it('서울·인천은 그대로 둔다', () => {
    expect(areaLabel('서울')).toBe('서울')
    expect(areaLabel('인천')).toBe('인천')
  })

  it('가운데 시/군 은 건드리지 않는다', () => {
    expect(areaLabel('시흥시')).toBe('시흥')
    expect(areaLabel('군포시')).toBe('군포')
  })
})
