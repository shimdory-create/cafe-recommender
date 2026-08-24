import { describe, expect, it } from 'vitest'
import { isNewCafe, NEW_DAYS, SEED_UNTIL } from '../../src/config/newness.js'

const at = (s: string) => new Date(s)

describe('isNewCafe', () => {
  it('최초 대량 수집분은 NEW 가 아니다', () => {
    // 2026-08-19~21 사흘 동안 6,218곳을 한 번에 긁었다. 그대로 30일 창에
    // 넣으면 전부 NEW 가 되고, 전부에 붙은 배지는 아무것도 뜻하지 않는다
    expect(isNewCafe('2026-08-19T00:00:00.000Z', at('2026-08-24'))).toBe(false)
    expect(isNewCafe('2026-08-20T12:00:00.000Z', at('2026-08-24'))).toBe(false)
    expect(isNewCafe('2026-08-21T23:59:59.000Z', at('2026-08-24'))).toBe(false)
  })

  it('기준선 이후에 발굴된 곳은 NEW 다', () => {
    expect(isNewCafe('2026-08-23T10:00:00.000Z', at('2026-08-24'))).toBe(true)
  })

  it('30일이 지나면 내려간다', () => {
    expect(isNewCafe('2026-08-23T00:00:00.000Z', at('2026-09-22'))).toBe(true)
    expect(isNewCafe('2026-08-23T00:00:00.000Z', at('2026-09-23'))).toBe(false)
  })

  it('미래 날짜는 NEW 로 보지 않는다', () => {
    expect(isNewCafe('2026-09-01T00:00:00.000Z', at('2026-08-24'))).toBe(false)
  })

  it('기준선은 최초 수집 다음 날이다', () => {
    expect(SEED_UNTIL).toBe('2026-08-22')
    expect(NEW_DAYS).toBe(30)
  })
})
