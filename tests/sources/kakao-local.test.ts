import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseKakaoLocal, createKakaoLocal } from '../../src/sources/kakao-local.js'
import type { Limiter } from '../../src/sources/types.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/kakao-local-yangpyeong.json', 'utf8'),
)

describe('parseKakaoLocal', () => {
  it('실제 응답에서 장소를 뽑아낸다', () => {
    const places = parseKakaoLocal(fixture)
    expect(places.length).toBeGreaterThan(0)
    const p = places[0]!
    expect(p.id).toBeTruthy()
    expect(p.placeName).toBeTruthy()
    expect(typeof p.lat).toBe('number')
    expect(typeof p.lng).toBe('number')
  })

  it('좌표 문자열을 숫자로 바꾼다 (x=경도, y=위도)', () => {
    // 카카오는 x 가 경도, y 가 위도다. 뒤집으면 카페가 서해에 뜬다.
    for (const p of parseKakaoLocal(fixture)) {
      expect(p.lat).toBeGreaterThan(33) // 한반도 위도
      expect(p.lat).toBeLessThan(39)
      expect(p.lng).toBeGreaterThan(124) // 한반도 경도
      expect(p.lng).toBeLessThan(132)
    }
  })

  it('카테고리와 place_url 을 보존한다', () => {
    const p = parseKakaoLocal(fixture)[0]!
    expect(p.categoryName).toMatch(/카페|음식점|제과/)
    expect(p.placeUrl).toMatch(/^https?:\/\//)
  })

  it('문서가 없으면 빈 배열이다', () => {
    expect(parseKakaoLocal({ documents: [], meta: { is_end: true } })).toEqual([])
  })

  it('예상 못한 모양이 와도 던지지 않는다', () => {
    // 우아한 저하: 파서가 죽으면 파이프라인 전체가 멈춘다
    expect(parseKakaoLocal({})).toEqual([])
    expect(parseKakaoLocal(null)).toEqual([])
  })
})

describe('createKakaoLocal', () => {
  const passthrough: Limiter = (fn) => fn()

  it('Authorization 헤더에 KakaoAK 를 붙인다', async () => {
    let seenAuth = ''
    const api = createKakaoLocal({
      apiKey: 'test-key',
      limit: passthrough,
      fetcher: async (_u, init) => {
        seenAuth = (init?.headers as Record<string, string>).Authorization!
        return new Response(JSON.stringify(fixture), { status: 200 })
      },
    })
    await api.searchKeyword('경기 양평군 베이커리카페', 1)
    expect(seenAuth).toBe('KakaoAK test-key')
  })

  it('검색어와 페이지를 URL 에 담는다', async () => {
    let seenUrl = ''
    const api = createKakaoLocal({
      apiKey: 'k',
      limit: passthrough,
      fetcher: async (u) => {
        seenUrl = u
        return new Response(JSON.stringify(fixture), { status: 200 })
      },
    })
    await api.searchKeyword('경기 양평군 대형카페', 2)
    expect(seenUrl).toContain('page=2')
    expect(seenUrl).toContain(encodeURIComponent('경기 양평군 대형카페'))
  })

  it('is_end 를 그대로 돌려준다 (페이지네이션 종료 판단)', async () => {
    const api = createKakaoLocal({
      apiKey: 'k',
      limit: passthrough,
      fetcher: async () =>
        new Response(JSON.stringify({ documents: [], meta: { is_end: true } }), { status: 200 }),
    })
    expect((await api.searchKeyword('x', 1)).isEnd).toBe(true)
  })

  it('403 을 상태코드가 담긴 SourceError 로 던진다', async () => {
    const api = createKakaoLocal({
      apiKey: 'k',
      limit: passthrough,
      fetcher: async () =>
        new Response(
          JSON.stringify({ msg: 'App disabled OPEN_MAP_AND_LOCAL service.' }),
          { status: 403 },
        ),
    })
    await expect(api.searchKeyword('x', 1)).rejects.toMatchObject({ status: 403 })
  })

  it('오류 메시지에 서버 원문을 담는다', async () => {
    // Task 0 에서 이 정보가 원인 특정에 결정적이었다
    const api = createKakaoLocal({
      apiKey: 'k',
      limit: passthrough,
      fetcher: async () =>
        new Response(JSON.stringify({ msg: 'OPEN_MAP_AND_LOCAL' }), { status: 403 }),
    })
    await expect(api.searchKeyword('x', 1)).rejects.toThrow(/OPEN_MAP_AND_LOCAL/)
  })

  it('원본 payload 를 함께 돌려준다 (raw 적재용)', async () => {
    const api = createKakaoLocal({
      apiKey: 'k',
      limit: passthrough,
      fetcher: async () => new Response(JSON.stringify(fixture), { status: 200 }),
    })
    const r = await api.searchKeyword('x', 1)
    expect(r.payload).toBeTruthy()
  })
})
