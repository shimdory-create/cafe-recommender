import { describe, it, expect } from 'vitest'
import { pageOf, pageCount, PAGE_SIZE } from './home-feed'

const rows = Array.from({ length: 23 }, (_, i) => i + 1)

describe('pageOf', () => {
  it('한 페이지에 10곳을 준다', () => {
    expect(PAGE_SIZE).toBe(10)
    expect(pageOf(rows, 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('다음 페이지는 그 다음 10곳이다', () => {
    expect(pageOf(rows, 2)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  })

  it('마지막 페이지는 남은 만큼만 준다', () => {
    expect(pageOf(rows, 3)).toEqual([21, 22, 23])
  })

  it('범위를 넘으면 빈 배열이다 (던지지 않는다)', () => {
    expect(pageOf(rows, 99)).toEqual([])
  })

  it('0이나 음수 페이지는 첫 페이지로 본다', () => {
    expect(pageOf(rows, 0)).toEqual(pageOf(rows, 1))
    expect(pageOf(rows, -3)).toEqual(pageOf(rows, 1))
  })

  it('빈 목록에서도 던지지 않는다', () => {
    expect(pageOf([], 1)).toEqual([])
  })
})

describe('pageCount', () => {
  it('나머지가 있으면 한 페이지 더', () => {
    expect(pageCount(23)).toBe(3)
    expect(pageCount(20)).toBe(2)
  })

  it('비어 있어도 1페이지다 (0/0 을 보여주지 않는다)', () => {
    expect(pageCount(0)).toBe(1)
  })

  it('10곳 이하면 1페이지다', () => {
    expect(pageCount(7)).toBe(1)
  })
})
