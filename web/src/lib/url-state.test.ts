import { describe, expect, it } from 'vitest'
import { EMPTY_PARAMS, listParamsToQuery, readListParams } from './url-state'

describe('목록 상태를 주소에 싣기', () => {
  it('아무것도 안 고르면 주소가 깨끗하다', () => {
    expect(listParamsToQuery(EMPTY_PARAMS)).toBe('')
  })

  it('왕복해도 같은 값이다', () => {
    const p = {
      q: '테라', area: '김포시', tags: ['대형카페', '뷰맛집'],
      sort: 'near' as const, city: true, newOnly: true,
      visitedSort: { by: 'rating' as const, desc: false },
      shown: 180,
    }
    const qs = listParamsToQuery(p)
    const back = readListParams(Object.fromEntries(new URLSearchParams(qs.slice(1))))
    expect(back).toEqual(p)
  })

  it('빈 주소는 기본값이 된다', () => {
    expect(readListParams({})).toEqual(EMPTY_PARAMS)
  })

  it('이상한 값은 기본값으로 떨어진다', () => {
    const p = readListParams({ s: '아무거나', c: 'yes', n: '0', a: '  ', t: ' , ,' })
    expect(p.sort).toBe('hot')
    expect(p.city).toBe(false)
    expect(p.newOnly).toBe(false)
    expect(p.area).toBeNull()
    expect(p.tags).toEqual([])
  })

  it('다녀온 곳 정렬은 기본값일 때 주소에 안 쓴다', () => {
    expect(listParamsToQuery({ ...EMPTY_PARAMS, visitedSort: { by: 'date', desc: true } }))
      .toBe('')
    expect(listParamsToQuery({ ...EMPTY_PARAMS, visitedSort: { by: 'date', desc: false } }))
      .toBe('?o=date.asc')
    expect(listParamsToQuery({ ...EMPTY_PARAMS, visitedSort: { by: 'rating', desc: true } }))
      .toBe('?o=rating.desc')
  })

  it('같은 키가 두 번 와도 첫 값을 쓴다', () => {
    expect(readListParams({ a: ['김포시', '파주시'] }).area).toBe('김포시')
  })

  it('펼친 카드 수는 기본값일 때 주소에 안 쓴다', () => {
    expect(listParamsToQuery({ ...EMPTY_PARAMS, shown: 60 })).toBe('')
    expect(listParamsToQuery({ ...EMPTY_PARAMS, shown: 180 })).toBe('?v=180')
  })

  it('펼친 카드 수가 이상하면 기본값으로 떨어진다', () => {
    // 청크 배수로 맞춘다 — 화면과 주소가 어긋나면 "더 보기" 가 엉뚱하게 뛴다
    expect(readListParams({ v: '0' }).shown).toBe(60)
    expect(readListParams({ v: '-5' }).shown).toBe(60)
    expect(readListParams({ v: '아무거나' }).shown).toBe(60)
    expect(readListParams({ v: '70' }).shown).toBe(120)
    expect(readListParams({ v: '999999999' }).shown).toBe(100_020)
  })

  it('한글 지역명이 주소에 안전하게 실린다', () => {
    const qs = listParamsToQuery({ ...EMPTY_PARAMS, area: '남양주시' })
    expect(new URLSearchParams(qs.slice(1)).get('a')).toBe('남양주시')
  })
})
