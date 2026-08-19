import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseKakaoBlog, createKakaoBlog } from '../../src/sources/kakao-blog.js'
import type { Limiter } from '../../src/sources/types.js'

const terarosa = JSON.parse(readFileSync('tests/fixtures/kakao-blog-terarosa.json', 'utf8'))
const nonexistent = JSON.parse(readFileSync('tests/fixtures/kakao-blog-nonexistent.json', 'utf8'))

describe('parseKakaoBlog', () => {
  it('실제 응답에서 문서를 뽑아낸다', () => {
    const { docs, totalCount } = parseKakaoBlog(terarosa)
    expect(docs.length).toBe(50)
    expect(totalCount).toBeGreaterThan(0)
  })

  it('카카오의 하이라이트 태그를 제거한다', () => {
    // 카카오는 검색어를 <b> 로 감싸서 준다. 관련성 판정 전에 벗겨야
    // 상호명 포함 여부가 어긋나지 않는다.
    const { docs } = parseKakaoBlog(terarosa)
    for (const d of docs) {
      expect(d.title).not.toMatch(/<\/?b>/)
      expect(d.contents).not.toMatch(/<\/?b>/)
    }
  })

  it('fixture 에 실제로 태그가 있었음을 확인한다', () => {
    // 위 테스트가 우연히 통과하는 것을 막는 대조 검사
    expect(JSON.stringify(terarosa)).toMatch(/<b>/)
  })

  it('저자가 쓴 꺾쇠괄호는 살린다', () => {
    // 실제 fixture 에 "&lt;양평 가볼만한 곳&gt;강변을 따라..." 같은 제목이 있다.
    // 태그 제거를 먼저 하고 엔티티 복원을 나중에 하는 순서라서, 저자가
    // 쓴 꺾쇠는 태그로 오인되지 않고 남는다. 순서를 바꾸면 지워진다.
    const { docs } = parseKakaoBlog({
      documents: [{
        title: '&lt;양평 가볼만한 곳&gt;강변 카페',
        contents: '', url: 'u', blogname: 'b',
        datetime: '2026-08-19T00:00:00.000+09:00',
      }],
      meta: { total_count: 1 },
    })
    expect(docs[0]!.title).toBe('<양평 가볼만한 곳>강변 카페')
  })

  it('HTML 엔티티를 되돌린다', () => {
    const { docs } = parseKakaoBlog({
      documents: [{
        title: '&lt;b&gt;카페&lt;/b&gt; &amp; 베이커리',
        contents: '&quot;좋다&quot;',
        url: 'https://x.com',
        blogname: 'b',
        datetime: '2026-08-19T00:00:00.000+09:00',
      }],
      meta: { total_count: 1 },
    })
    expect(docs[0]!.title).toBe('<b>카페</b> & 베이커리')
    expect(docs[0]!.contents).toBe('"좋다"')
  })

  it('datetime 을 Date 로 파싱한다', () => {
    const { docs } = parseKakaoBlog(terarosa)
    expect(docs[0]!.dateTime).toBeInstanceOf(Date)
    expect(Number.isNaN(docs[0]!.dateTime.getTime())).toBe(false)
  })

  it('url 과 blogName 을 보존한다', () => {
    const d = parseKakaoBlog(terarosa).docs[0]!
    expect(d.url).toMatch(/^https?:\/\//)
    expect(d.blogName.length).toBeGreaterThan(0)
  })

  it('존재하지 않는 카페도 문서를 잔뜩 받는다 — 이래서 집계를 쓰지 않는다', () => {
    // "옹진군 존재안함카페12345" 로 검색한 실제 응답.
    // OR 매칭이라 있지도 않은 카페가 total_count 158, 문서 50건을 받는다.
    // 그런데 상호명을 포함하는 문서는 0건이다. 집계가 아니라 문서를
    // 직접 검증해야 하는 이유 (스펙 v3 Layer 2).
    const { docs, totalCount } = parseKakaoBlog(nonexistent)
    expect(totalCount).toBeGreaterThan(0)
    expect(docs.length).toBeGreaterThan(10)
    const hits = docs.filter((d) => (d.title + d.contents).includes('존재안함카페'))
    expect(hits).toHaveLength(0)
  })

  it('예상 못한 모양이 와도 던지지 않는다', () => {
    expect(parseKakaoBlog({})).toEqual({ docs: [], totalCount: 0 })
    expect(parseKakaoBlog(null)).toEqual({ docs: [], totalCount: 0 })
  })
})

describe('createKakaoBlog', () => {
  const passthrough: Limiter = (fn) => fn()
  const ok = () => new Response(JSON.stringify(terarosa), { status: 200 })

  it('Authorization 헤더에 KakaoAK 를 붙인다', async () => {
    let auth = ''
    const api = createKakaoBlog({
      apiKey: 'test-key',
      limit: passthrough,
      fetcher: async (_u, init) => {
        auth = (init?.headers as Record<string, string>).Authorization!
        return ok()
      },
    })
    await api.search('양평군 테라로사')
    expect(auth).toBe('KakaoAK test-key')
  })

  it('기본값으로 최신순 50건을 요청한다', async () => {
    let url = ''
    const api = createKakaoBlog({
      apiKey: 'k', limit: passthrough,
      fetcher: async (u) => { url = u; return ok() },
    })
    await api.search('양평군 테라로사')
    expect(url).toContain('size=50')
    expect(url).toContain('sort=recency')
  })

  it('정확도순과 건수를 바꿀 수 있다', async () => {
    let url = ''
    const api = createKakaoBlog({
      apiKey: 'k', limit: passthrough,
      fetcher: async (u) => { url = u; return ok() },
    })
    await api.search('x', { size: 10, sort: 'accuracy' })
    expect(url).toContain('size=10')
    expect(url).toContain('sort=accuracy')
  })

  it('원본 payload 를 함께 돌려준다 (raw 적재용)', async () => {
    const api = createKakaoBlog({ apiKey: 'k', limit: passthrough, fetcher: async () => ok() })
    expect((await api.search('x')).payload).toBeTruthy()
  })

  it('오류를 상태코드가 담긴 SourceError 로 던진다', async () => {
    const api = createKakaoBlog({
      apiKey: 'k', limit: passthrough,
      fetcher: async () => new Response(JSON.stringify({ msg: 'quota exceeded' }), { status: 429 }),
    })
    await expect(api.search('x')).rejects.toMatchObject({ status: 429 })
    await expect(api.search('x')).rejects.toThrow(/quota exceeded/)
  })
})
