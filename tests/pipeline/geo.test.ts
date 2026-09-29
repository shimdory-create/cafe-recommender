import { describe, it, expect } from 'vitest'
import { haversineKm, estimateDriveMinutes } from '../../src/pipeline/geo.js'

// 출발지는 더 이상 geo.ts 에 상수로 없다 — cli/context.ts 가 환경변수에서
// 만들어 각 잡에 넘긴다(2026-09-29 배선 수정). 여기선 좌표 계산만
// 검증하면 되므로 부평 근처의 임의 고정값을 픽스처로 쓴다.
const HOME = { lat: 37.5151091, lng: 126.7398273 }

describe('haversineKm', () => {
  it('같은 지점은 0이다', () => {
    expect(haversineKm(HOME, HOME)).toBeCloseTo(0, 6)
  })

  it('부평 -> 양평 직선거리가 60~70km 다', () => {
    // 양평역 근사 좌표. 도로거리 약 80km, 직선거리는 약 68km.
    const km = haversineKm(HOME, { lat: 37.4923, lng: 127.4897 })
    expect(km).toBeGreaterThan(60)
    expect(km).toBeLessThan(70)
  })

  it('부평 -> 강화 직선거리가 양평보다 짧다', () => {
    // 직선은 강화가 가깝지만 실제 도로는 다리 하나뿐이라 더 오래 걸린다.
    // 이 왜곡이 스펙에서 반경 대신 이동시간을 쓰기로 한 이유다.
    const ganghwa = haversineKm(HOME, { lat: 37.7473, lng: 126.4878 })
    const yangpyeong = haversineKm(HOME, { lat: 37.4923, lng: 127.4897 })
    expect(ganghwa).toBeLessThan(yangpyeong)
  })

  it('대칭이다', () => {
    const a = { lat: 37.5, lng: 127.0 }
    const b = { lat: 37.9, lng: 127.4 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9)
  })

  it('한반도 규모에서 상식적인 값을 준다', () => {
    // 서울시청 -> 인천시청 약 28km
    const km = haversineKm({ lat: 37.5665, lng: 126.9780 }, { lat: 37.4563, lng: 126.7052 })
    expect(km).toBeGreaterThan(24)
    expect(km).toBeLessThan(32)
  })
})

describe('estimateDriveMinutes', () => {
  it('직선거리에 우회계수 1.35 와 60km/h 를 적용한다', () => {
    // 60km * 1.35 = 81km, 60km/h -> 81분
    expect(estimateDriveMinutes(60)).toBe(81)
  })

  it('0km 는 0분이다', () => {
    expect(estimateDriveMinutes(0)).toBe(0)
  })

  it('단조 증가한다', () => {
    expect(estimateDriveMinutes(30)).toBeLessThan(estimateDriveMinutes(35))
  })

  it('정수를 돌려준다', () => {
    expect(Number.isInteger(estimateDriveMinutes(67.8))).toBe(true)
  })

  it('양평이 스펙의 80분대로 근사된다', () => {
    // 직선 약 68km * 1.35 = 92km -> 92분. 스펙 10.2절의 "양평 80분"과
    // 대략 맞고 과대추정 쪽이다 — 예상보다 가까운 편이 안전하다.
    const km = haversineKm(HOME, { lat: 37.4923, lng: 127.4897 })
    const min = estimateDriveMinutes(km)
    expect(min).toBeGreaterThan(75)
    expect(min).toBeLessThan(100)
  })
})
