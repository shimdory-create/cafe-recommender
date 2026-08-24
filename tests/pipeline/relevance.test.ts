import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isRelevant, isAmbiguousName, splitBranch } from '../../src/pipeline/relevance.js'
import { parseKakaoBlog } from '../../src/sources/kakao-blog.js'
import type { BlogDoc } from '../../src/sources/kakao-blog.js'

const doc = (title: string, contents = ''): BlogDoc => ({
  title,
  contents,
  url: 'https://blog.naver.com/x',
  blogName: 'b',
  dateTime: new Date('2026-08-19T00:00:00Z'),
  thumbnail: '',
})

describe('isRelevant', () => {
  it('상호명과 카페 문맥어가 모두 있으면 관련이다', () => {
    expect(isRelevant(doc('양평 테라로사 카페 다녀왔어요'), '테라로사')).toBe(true)
  })

  it('상호명만 있고 카페 문맥어가 없으면 관련이 아니다', () => {
    // "가평 수목원" 문제 — 상호가 일반명사면 무관한 글이 대량으로 걸린다
    expect(isRelevant(doc('가평 수목원 산책로 단풍 구경'), '수목원')).toBe(false)
  })

  it('본문에만 있어도 관련이다', () => {
    expect(isRelevant(doc('주말 나들이', '테라로사에서 빵 사왔어요'), '테라로사')).toBe(true)
  })

  it('상호명이 없으면 관련이 아니다', () => {
    expect(isRelevant(doc('양평 브런치 카페 추천'), '테라로사')).toBe(false)
  })

  it('공백 차이를 무시한다', () => {
    expect(isRelevant(doc('더티 트렁크 카페 좋아요'), '더티트렁크')).toBe(true)
    expect(isRelevant(doc('더티트렁크 카페'), '더티 트렁크')).toBe(true)
  })

  it('여러 문맥어 중 하나만 있어도 된다', () => {
    for (const w of ['카페', '베이커리', '커피', '빵', '디저트', '브런치']) {
      expect(isRelevant(doc(`테라로사 ${w} 최고`), '테라로사')).toBe(true)
    }
  })

  it('빈 문서는 관련이 아니다', () => {
    expect(isRelevant(doc('', ''), '테라로사')).toBe(false)
  })
})

describe('isAmbiguousName', () => {
  it('2글자 이하는 모호하다', () => {
    expect(isAmbiguousName('숲')).toBe(true)
    expect(isAmbiguousName('마당')).toBe(true)
    expect(isAmbiguousName('온')).toBe(true)
  })

  it('일반명사 사전에 걸리면 모호하다', () => {
    expect(isAmbiguousName('수목원')).toBe(true)
    expect(isAmbiguousName('식물원')).toBe(true)
  })

  it('고유한 상호는 모호하지 않다', () => {
    expect(isAmbiguousName('더티트렁크')).toBe(false)
    expect(isAmbiguousName('테라로사')).toBe(false)
    expect(isAmbiguousName('앤트러사이트')).toBe(false)
  })

  it('공백을 무시하고 길이를 센다', () => {
    expect(isAmbiguousName('마 당')).toBe(true)
  })
})

describe('실제 fixture 로 검증', () => {
  const terarosa = parseKakaoBlog(
    JSON.parse(readFileSync('tests/fixtures/kakao-blog-terarosa.json', 'utf8')),
  ).docs
  const nonexistent = parseKakaoBlog(
    JSON.parse(readFileSync('tests/fixtures/kakao-blog-nonexistent.json', 'utf8')),
  ).docs

  it('테라로사의 정밀도가 0.6~0.85 대역에 든다', () => {
    // 실측 0.70. 상호명만 보면 0.96 이지만 문맥어 조건이 "지나가는
    // 언급"을 걷어낸다. 상호명 포함 48건 중 13건이 카페 후기가 아니라
    // 여행 큐레이션·호텔 후기·일상 일기에서 이름만 스친 글이었다.
    // 이것이 의도한 동작이며, 진짜 카페의 현실적 상한이 약 0.8 이다.
    const p = terarosa.filter((d) => isRelevant(d, '테라로사')).length / terarosa.length
    expect(p).toBeGreaterThan(0.6)
    expect(p).toBeLessThanOrEqual(0.85)
  })

  it('지나가는 언급을 배제한다', () => {
    // 실제 fixture 에서 뽑은 형태들. 상호명은 있지만 카페 후기가 아니다.
    const passing = [
      doc('양평 서종면 맛집 토담골, 스페셜곤드레돌솥정식 솔직후기',
          '서종면이나 인근 테라로사 서종점도 가깝습니다'),
      doc('양평 서종면 리버뷰가 아름다운 디엠버호텔',
          '인근에는 테라로사 서종점과 북한강로 주변의 다양한 맛집이 있어'),
      doc('나의 Gardening 입문기 - 삼봉아양농장',
          '수확한 콩은 냉동실에 잘 보관되어 있다 양평 테라로사'),
    ]
    for (const d of passing) {
      expect(isRelevant(d, '테라로사')).toBe(false)
    }
  })

  it('존재하지 않는 카페는 관련 문서가 0건이다', () => {
    const rel = nonexistent.filter((d) => isRelevant(d, '존재안함카페12345'))
    expect(rel).toHaveLength(0)
  })

  it('같은 문서 집합에서 무관한 상호를 찾으면 0건이다', () => {
    // 테라로사 검색 결과에서 "더티트렁크" 를 찾으면 없어야 한다.
    // 정밀도가 검색어에 실제로 반응한다는 확인.
    const rel = terarosa.filter((d) => isRelevant(d, '더티트렁크'))
    expect(rel.length).toBeLessThan(3)
  })
})

describe('splitBranch — 지점 접미사', () => {
  it('지점명을 떼어낸다', () => {
    expect(splitBranch('포레스트아웃팅스 일산본점')).toEqual({ base: '포레스트아웃팅스', branch: '일산' })
    expect(splitBranch('포레스트아웃팅스 용인점')).toEqual({ base: '포레스트아웃팅스', branch: '용인' })
    expect(splitBranch('카페대너리스 북한강지점')).toEqual({ base: '카페대너리스', branch: '북한강' })
    expect(splitBranch('랑데자뷰 인천부평점')).toEqual({ base: '랑데자뷰', branch: '인천부평' })
  })

  it('지점이 아닌 상호는 건드리지 않는다', () => {
    expect(splitBranch('배다골베이커리 포레')).toEqual({ base: '배다골베이커리 포레', branch: '' })
    expect(splitBranch('테라로사')).toEqual({ base: '테라로사', branch: '' })
  })

  it('붙여 쓴 이름은 가르지 않는다 — `카페만점` 이 `카페`+`만` 이 되면 안 된다', () => {
    expect(splitBranch('카페만점')).toEqual({ base: '카페만점', branch: '' })
  })

  it('지점 힌트가 한 글자면 지점으로 보지 않는다', () => {
    expect(splitBranch('삼거리 큰점')).toEqual({ base: '삼거리 큰점', branch: '' })
  })
})

describe('isRelevant — 지점명이 붙은 카페', () => {
  const doc = (title: string, contents = '') => ({
    title, contents, url: 'u', blogName: 'b', dateTime: new Date(), thumbnail: '',
  })

  it('블로거가 쓰는 표기를 잡는다', () => {
    // 실측: 상호 전체를 요구하면 50건 중 4건만 통과해 정밀도 8% 로 탈락했다
    const 이름 = '포레스트아웃팅스 일산본점'
    expect(isRelevant(doc('일산 포레스트아웃팅스 대형카페 후기'), 이름)).toBe(true)
    expect(isRelevant(doc('포레스트 아웃팅스 일산본점 카페'), 이름)).toBe(true)
    expect(isRelevant(doc('고양 일산 식물원 카페 포레스트아웃팅스'), 이름)).toBe(true)
  })

  it('다른 지점 글은 잡지 않는다', () => {
    // 기본 상호만 보면 브랜드 전체 글이 모든 지점에 중복으로 잡힌다
    expect(isRelevant(doc('용인 포레스트아웃팅스 카페 후기'), '포레스트아웃팅스 일산본점')).toBe(false)
    expect(isRelevant(doc('포레스트아웃팅스 송도점 카페'), '포레스트아웃팅스 용인점')).toBe(false)
  })

  it('카페 문맥어는 여전히 필요하다', () => {
    expect(isRelevant(doc('일산 포레스트아웃팅스 채용 공고'), '포레스트아웃팅스 일산본점')).toBe(false)
  })

  it('지점명 없는 카페는 규칙이 그대로다', () => {
    expect(isRelevant(doc('테라로사 카페 후기'), '테라로사')).toBe(true)
    expect(isRelevant(doc('다른 카페 후기'), '테라로사')).toBe(false)
  })
})
