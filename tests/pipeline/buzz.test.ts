import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeBuzz, passesLayer2 } from '../../src/pipeline/buzz.js'
import { parseKakaoBlog } from '../../src/sources/kakao-blog.js'
import type { BlogDoc } from '../../src/sources/kakao-blog.js'

const NOW = new Date('2026-08-20T00:00:00Z')
const DAY = 86_400_000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY)

/** 관련 문서 n건을 주어진 일수 오프셋에 만든다 */
const rel = (offsets: number[], name = '테라로사'): BlogDoc[] =>
  offsets.map((d) => ({
    title: `${name} 카페 후기`,
    contents: '',
    url: 'u',
    blogName: 'b',
    dateTime: daysAgo(d),
  }))

const unrelated = (n: number): BlogDoc[] =>
  Array.from({ length: n }, () => ({
    title: '전혀 무관한 글',
    contents: '',
    url: 'u',
    blogName: 'b',
    dateTime: daysAgo(1),
  }))

describe('computeBuzz', () => {
  it('관련 문서만 세어 정밀도를 낸다', () => {
    const m = computeBuzz({
      docs: [...rel([1, 2, 3]), ...unrelated(1)],
      cafeName: '테라로사',
      now: NOW,
    })
    expect(m.receivedCount).toBe(4)
    expect(m.relevantCount).toBe(3)
    expect(m.precision).toBeCloseTo(0.75, 4)
  })

  it('기간으로 월 발행률을 환산한다', () => {
    // 관련 10건이 20일에 걸침 -> 월 15건
    const m = computeBuzz({
      docs: rel([0, 2, 4, 6, 8, 10, 12, 14, 16, 20]),
      cafeName: '테라로사',
      now: NOW,
    })
    expect(m.spanDays).toBeCloseTo(20, 1)
    expect(m.postsPer30).toBeCloseTo(15, 0)
  })

  it('없는 카페는 정밀도 0, 발행률 0 이다', () => {
    const m = computeBuzz({ docs: unrelated(30), cafeName: '존재안함카페', now: NOW })
    expect(m.precision).toBe(0)
    expect(m.postsPer30).toBe(0)
    expect(m.relevantCount).toBe(0)
    expect(m.firstPostDate).toBeNull()
    expect(m.latestPostDate).toBeNull()
  })

  it('최근 30일이 이전보다 많으면 가속도가 1을 넘는다', () => {
    const m = computeBuzz({
      docs: [
        ...rel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        ...rel([40, 50, 60, 70]),
      ],
      cafeName: '테라로사',
      now: NOW,
    })
    expect(m.posts30d).toBe(12)
    expect(m.postsPrev).toBe(4)
    expect(m.acceleration).toBeGreaterThan(1)
  })

  it('최근이 줄었으면 가속도가 1보다 작다', () => {
    const m = computeBuzz({
      docs: [...rel([5]), ...rel([40, 45, 50, 55, 60, 65, 70, 75, 80, 85])],
      cafeName: '테라로사',
      now: NOW,
    })
    expect(m.acceleration).toBeLessThan(1)
  })

  it('표본이 작아도 가속도가 폭주하지 않는다', () => {
    // 라플라스 스무딩: 1건 대 0건이 무한대가 되지 않는다
    const m = computeBuzz({ docs: rel([1]), cafeName: '테라로사', now: NOW })
    expect(m.acceleration).toBeLessThan(2)
    expect(Number.isFinite(m.acceleration)).toBe(true)
  })

  it('발행률이 과다하면 일반명사 오염을 의심한다', () => {
    // 50건이 이틀에 걸침 -> 월 750건. "가평 수목원" 패턴.
    const offsets = Array.from({ length: 50 }, (_, i) => i % 2)
    const m = computeBuzz({ docs: rel(offsets), cafeName: '테라로사', now: NOW })
    expect(m.suspectAmbiguous).toBe(true)
  })

  it('정상 발행률은 오염으로 의심하지 않는다', () => {
    const m = computeBuzz({ docs: rel([0, 5, 10, 15, 20]), cafeName: '테라로사', now: NOW })
    expect(m.suspectAmbiguous).toBe(false)
  })

  it('문서가 없으면 0으로 채우고 던지지 않는다', () => {
    const m = computeBuzz({ docs: [], cafeName: '테라로사', now: NOW })
    expect(m.precision).toBe(0)
    expect(m.receivedCount).toBe(0)
    expect(m.firstPostDate).toBeNull()
  })

  it('첫 글과 마지막 글 날짜를 YYYY-MM-DD 로 준다', () => {
    const m = computeBuzz({ docs: rel([0, 10]), cafeName: '테라로사', now: NOW })
    expect(m.latestPostDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(m.firstPostDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(m.latestPostDate! > m.firstPostDate!).toBe(true)
  })
})

describe('passesLayer2', () => {
  const base = {
    precision: 0.9,
    postsPer30: 50,
    firstPostDate: '2020-01-01',
  }

  it('정밀도와 발행률이 충분하면 통과한다', () => {
    expect(passesLayer2(base, { now: NOW }).pass).toBe(true)
  })

  it('정밀도가 낮으면 탈락하고 이유를 준다', () => {
    const r = passesLayer2({ ...base, precision: 0.1 }, { now: NOW })
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/정밀도/)
  })

  it('발행률이 낮으면 탈락하고 이유를 준다', () => {
    const r = passesLayer2({ ...base, postsPer30: 3 }, { now: NOW })
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/월/)
  })

  it('신규 오픈은 발행률 컷을 면제한다', () => {
    // 없으면 갓 오픈한 대형카페가 전부 탈락한다
    const newbie = { ...base, postsPer30: 3, firstPostDate: '2026-07-01' }
    expect(passesLayer2(newbie, { now: NOW }).pass).toBe(true)
  })

  it('신규 오픈이라도 정밀도 컷은 면제하지 않는다', () => {
    // 실존하지 않는 카페를 "신규"로 통과시켜서는 안 된다
    const fake = { precision: 0.05, postsPer30: 3, firstPostDate: '2026-08-01' }
    expect(passesLayer2(fake, { now: NOW }).pass).toBe(false)
  })

  it('글이 하나도 없으면 탈락한다', () => {
    expect(passesLayer2({ precision: 0, postsPer30: 0, firstPostDate: null }, { now: NOW }).pass)
      .toBe(false)
  })

  it('컷 기준을 조정할 수 있다 (골든셋 보정용)', () => {
    const borderline = { ...base, postsPer30: 5 }
    expect(passesLayer2(borderline, { now: NOW }).pass).toBe(false)
    expect(passesLayer2(borderline, { now: NOW, minPostsPer30: 4 }).pass).toBe(true)
  })
})

describe('실제 fixture 로 검증', () => {
  const load = (f: string) =>
    parseKakaoBlog(JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))).docs

  it('테라로사는 Layer 2 를 통과한다', () => {
    const m = computeBuzz({
      docs: load('kakao-blog-terarosa.json'),
      cafeName: '테라로사',
      now: new Date('2026-08-21T00:00:00Z'),
    })
    // 실측 0.70. 문맥어 조건이 지나가는 언급을 걷어낸 결과다.
    // 컷 0.30 과의 여유가 크므로 안전하다.
    expect(m.precision).toBeGreaterThan(0.6)
    expect(m.postsPer30).toBeGreaterThan(20)
    expect(passesLayer2(m, { now: new Date('2026-08-21T00:00:00Z') }).pass).toBe(true)
  })

  it('존재하지 않는 카페는 Layer 2 에서 탈락한다', () => {
    const m = computeBuzz({
      docs: load('kakao-blog-nonexistent.json'),
      cafeName: '존재안함카페12345',
      now: new Date('2026-08-21T00:00:00Z'),
    })
    expect(m.precision).toBe(0)
    const r = passesLayer2(m, { now: new Date('2026-08-21T00:00:00Z') })
    expect(r.pass).toBe(false)
    expect(r.reason).toMatch(/정밀도/)
  })
})
