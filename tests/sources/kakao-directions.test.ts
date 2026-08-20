import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseDirections, createKakaoDirections } from '../../src/sources/kakao-directions.js'
import type { Limiter } from '../../src/sources/types.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/kakao-directions-ganghwa.json', 'utf8'),
)

describe('parseDirections', () => {
  it('실제 응답에서 시간·거리·통행료를 뽑는다', () => {
    // 부평 -> 강화군 카페109하우스. 근사값 46분, 실측 64분 (54.2km)
    const r = parseDirections(fixture)
    expect(r).not.toBeNull()
    expect(r!.minutes).toBe(64)
    expect(r!.km).toBeCloseTo(54.2, 1)
    expect(r!.tollWon).toBe(2000)
  })

  it('경로를 못 찾으면 null 이다 (던지지 않는다)', () => {
    // 카페 한 곳의 경로 실패가 배치를 멈춰서는 안 된다
    expect(parseDirections({ routes: [{ result_code: 104, result_msg: '출발지와 도착지가 5km 이내' }] }))
      .toBeNull()
  })

  it('예상 못한 모양이 와도 던지지 않는다', () => {
    expect(parseDirections({})).toBeNull()
    expect(parseDirections(null)).toBeNull()
    expect(parseDirections({ routes: [] })).toBeNull()
    expect(parseDirections({ routes: [{ result_code: 0 }] })).toBeNull()
  })

  it('통행료가 없으면 null 로 둔다', () => {
    const r = parseDirections({
      routes: [{ result_code: 0, summary: { duration: 600, distance: 5000 } }],
    })
    expect(r!.tollWon).toBeNull()
    expect(r!.minutes).toBe(10)
  })
})

describe('createKakaoDirections', () => {
  const passthrough: Limiter = (fn) => fn()
  const api = (fetcher: typeof fetch) =>
    createKakaoDirections({ apiKey: 'k', fetcher, limit: passthrough })

  it('경도,위도 순서로 좌표를 넘긴다', async () => {
    // 뒤집으면 엉뚱한 경로가 나온다
    let url = ''
    await api(async (u) => {
      url = u as string
      return new Response(JSON.stringify(fixture), { status: 200 })
    }).route({ lat: 37.5074, lng: 126.7218 }, { lat: 37.679, lng: 126.4 })
    expect(url).toContain('origin=126.7218,37.5074')
    expect(url).toContain('destination=126.4,37.679')
  })

  it('KakaoAK 헤더를 붙인다', async () => {
    let auth = ''
    await api(async (_u, init) => {
      auth = (init?.headers as Record<string, string>).Authorization!
      return new Response(JSON.stringify(fixture), { status: 200 })
    }).route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })
    expect(auth).toBe('KakaoAK k')
  })

  it('원본 payload 를 함께 돌려준다 (raw 적재용)', async () => {
    const r = await api(async () => new Response(JSON.stringify(fixture), { status: 200 }))
      .route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })
    expect(r.payload).toBeTruthy()
    expect(r.route!.minutes).toBe(64)
  })

  it('오류를 상태코드가 담긴 SourceError 로 던진다', async () => {
    const a = api(async () => new Response('quota exceeded', { status: 429 }))
    await expect(a.route({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }))
      .rejects.toMatchObject({ status: 429 })
  })
})
