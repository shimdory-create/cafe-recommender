import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { evaluateExclusion } from '../../src/pipeline/exclude.js'
import { BlacklistEntrySchema, type BlacklistEntry } from '../../src/schema.js'
import { z } from 'zod'

const bl: BlacklistEntry[] = [
  { pattern: '스타벅스', matchType: 'contains' },
  { pattern: '메가커피', matchType: 'contains' },
  { pattern: '파리바게', matchType: 'contains' },
]

const ev = (name: string, categoryName = '음식점 > 카페') =>
  evaluateExclusion({ name, categoryName }, bl)

describe('evaluateExclusion', () => {
  it('블랙리스트 프랜차이즈를 배제한다', () => {
    expect(ev('스타벅스 양평DTR점')).toBe('franchise')
    expect(ev('메가커피 부평점')).toBe('franchise')
    expect(ev('파리바게뜨 김포점')).toBe('franchise')
  })

  it('공백을 무시하고 매칭한다', () => {
    expect(ev('스타 벅스 양평점')).toBe('franchise')
  })

  it('테마카페 카테고리를 배제한다', () => {
    expect(ev('스터디온', '음식점 > 카페 > 테마카페 > 스터디카페')).toBe('category')
    expect(ev('놀숲', '음식점 > 카페 > 테마카페 > 만화/보드카페')).toBe('category')
    expect(ev('멍카페', '음식점 > 카페 > 테마카페 > 애견카페')).toBe('category')
    expect(ev('키즈랜드', '음식점 > 카페 > 테마카페 > 키즈카페')).toBe('category')
  })

  it('무인·테이크아웃 카테고리를 배제한다', () => {
    expect(ev('셀프커피', '음식점 > 카페 > 커피전문점 > 무인카페')).toBe('category')
    expect(ev('테이크아웃커피', '음식점 > 카페 > 테이크아웃커피')).toBe('category')
  })

  it('지점 접미사만으로는 배제하지 않는다', () => {
    // 스펙 정정 1호: 테라로사 서종점·앤트러사이트 서교점은 우리가 가장
    // 원하는 부류다. "OO점" 규칙은 이들을 잘라낸다.
    expect(ev('테라로사 서종점')).toBe(null)
    expect(ev('앤트러사이트 서교점')).toBe(null)
    expect(ev('카페 진정성 본점')).toBe(null)
  })

  it('일반 대형카페는 통과시킨다', () => {
    expect(ev('더티트렁크', '음식점 > 카페')).toBe(null)
    expect(ev('카페 진정성', '음식점 > 간식 > 제과,베이커리')).toBe(null)
    expect(ev('마조에이커', '음식점 > 카페 > 커피전문점')).toBe(null)
  })

  it('exact 매칭은 부분 일치를 거부한다', () => {
    const exact: BlacklistEntry[] = [{ pattern: '커피', matchType: 'exact' }]
    expect(evaluateExclusion({ name: '커피', categoryName: '음식점 > 카페' }, exact)).toBe('franchise')
    expect(evaluateExclusion({ name: '커피나무', categoryName: '음식점 > 카페' }, exact)).toBe(null)
  })

  it('regex 매칭을 지원한다', () => {
    const re: BlacklistEntry[] = [{ pattern: '^(투썸|할리스)', matchType: 'regex' }]
    expect(evaluateExclusion({ name: '투썸플레이스 양평', categoryName: '음식점 > 카페' }, re))
      .toBe('franchise')
    expect(evaluateExclusion({ name: '양평 투썸', categoryName: '음식점 > 카페' }, re)).toBe(null)
  })

  it('블랙리스트가 비어도 동작한다', () => {
    expect(evaluateExclusion({ name: '스타벅스', categoryName: '음식점 > 카페' }, [])).toBe(null)
  })

  it('깨진 regex 가 파이프라인을 멈추지 않는다', () => {
    // 손으로 편집하는 파일이므로 잘못된 정규식이 들어올 수 있다.
    const bad: BlacklistEntry[] = [{ pattern: '[미완성', matchType: 'regex' }]
    expect(() => evaluateExclusion({ name: '아무카페', categoryName: '음식점 > 카페' }, bad))
      .not.toThrow()
  })
})

describe('data/blacklist.json 실물', () => {
  const real = z.array(BlacklistEntrySchema)
    .parse(JSON.parse(readFileSync('data/blacklist.json', 'utf8')))

  it('실제 블랙리스트가 주요 프랜차이즈를 잡는다', () => {
    const check = (name: string) =>
      evaluateExclusion({ name, categoryName: '음식점 > 카페' }, real)
    expect(check('스타벅스 부평점')).toBe('franchise')
    expect(check('투썸플레이스 양평')).toBe('franchise')
    expect(check('컴포즈커피 김포')).toBe('franchise')
    expect(check('뚜레쥬르 파주')).toBe('franchise')
  })

  it('실제 블랙리스트가 대형 로스터리를 잡지 않는다', () => {
    const check = (name: string) =>
      evaluateExclusion({ name, categoryName: '음식점 > 카페' }, real)
    expect(check('테라로사 서종점')).toBe(null)
    expect(check('앤트러사이트 서교점')).toBe(null)
    expect(check('더티트렁크')).toBe(null)
  })
})
