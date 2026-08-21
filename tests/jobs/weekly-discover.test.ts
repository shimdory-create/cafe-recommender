import { describe, it, expect } from 'vitest'
import { runDiscover, naverMapUrl, type DiscoverDeps } from '../../src/jobs/weekly-discover.js'
import type { KakaoPlace } from '../../src/sources/kakao-local.js'
import type { Cafe } from '../../src/schema.js'

const region = { sido: '경기', sigungu: '양평군' } as const

const place = (
  id: string,
  name: string,
  category = '음식점 > 카페',
  addr = '경기 양평군',
): KakaoPlace => ({
  id,
  placeName: name,
  categoryName: category,
  addressName: addr,
  roadAddressName: `${addr} 1`,
  phone: '',
  placeUrl: `http://place/${id}`,
  lat: 37.49,
  lng: 127.48,
})

function harness(over: Partial<DiscoverDeps> = {}) {
  let cafes: Cafe[] = []
  let health: { source: string; lastError: string | null; consecutiveFailures: number }[] = []
  const deps: DiscoverDeps = {
    store: {
      readCafes: async () => cafes,
      writeCafes: async (c) => { cafes = c },
      readBlacklist: async () => [{ pattern: '스타벅스', matchType: 'contains' as const }],
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (h) => { health = h as never },
    },
    local: {
      searchKeyword: async () => ({
        places: [place('1', '테라로사 서종점'), place('2', '스타벅스 양평점')],
        isEnd: true,
        payload: {},
      }),
    },
    blog: {
      search: async () => ({ docs: [], payload: {} }),
    },
    llm: { name: 'f', modelVersion: 'v', extract: async () => ({ names: [] }) as never },
    now: new Date('2026-08-20T00:00:00Z'),
    ...over,
  }
  return { deps, saved: () => cafes, health: () => health }
}

describe('naverMapUrl', () => {
  it('시군구와 상호로 검색 URL 을 만든다', () => {
    const u = naverMapUrl('양평군', '테라로사 서종점')
    expect(u).toContain('map.naver.com/p/search/')
    expect(decodeURIComponent(u)).toContain('양평군 테라로사 서종점')
  })
})

describe('runDiscover', () => {
  it('신규 카페를 pending_extraction 으로 저장한다', async () => {
    const h = harness()
    const r = await runDiscover(h.deps, { regions: [region] })
    expect(r.discovered).toBe(1)
    const t = h.saved().find((c) => c.name.includes('테라로사'))!
    expect(t.status).toBe('pending_extraction')
    expect(t.attributes).toBeNull()
    expect(t.tags).toEqual([])
  })

  it('블랙리스트 프랜차이즈를 excluded_auto 로 표시한다', async () => {
    const h = harness()
    const r = await runDiscover(h.deps, { regions: [region] })
    expect(r.excluded).toBe(1)
    const sb = h.saved().find((c) => c.name.includes('스타벅스'))!
    expect(sb.status).toBe('excluded_auto')
    expect(sb.excludeReason).toBe('franchise')
  })

  it('kakaoPlaceId 로 중복을 제거한다', async () => {
    const h = harness()
    await runDiscover(h.deps, { regions: [region] })
    await runDiscover(h.deps, { regions: [region] })
    expect(h.saved().filter((c) => c.kakaoPlaceId === '1')).toHaveLength(1)
    expect(h.saved()).toHaveLength(2)
  })

  it('두 번째 실행에서는 신규가 0 이다', async () => {
    const h = harness()
    await runDiscover(h.deps, { regions: [region] })
    const r2 = await runDiscover(h.deps, { regions: [region] })
    expect(r2.discovered).toBe(0)
    expect(r2.total).toBe(2)
  })

  it('거리와 네이버지도 링크를 채운다', async () => {
    const h = harness()
    await runDiscover(h.deps, { regions: [region] })
    const c = h.saved()[0]!
    expect(c.straightKm).toBeGreaterThan(0)
    expect(c.driveMinutesEst).toBeGreaterThan(0)
    expect(c.naverMapUrl).toContain('map.naver.com')
    expect(c.kakaoPlaceUrl).toContain('http')
  })

  it('일반명사 상호를 표시한다', async () => {
    const h = harness({
      local: {
        searchKeyword: async () => ({
          places: [place('9', '수목원')], isEnd: true, payload: {},
        }),
      },
    })
    await runDiscover(h.deps, { regions: [region] })
    expect(h.saved()[0]!.ambiguousName).toBe(true)
  })

  it('테마카페 카테고리를 배제한다', async () => {
    const h = harness({
      local: {
        searchKeyword: async () => ({
          places: [place('9', '놀숲', '음식점 > 카페 > 테마카페 > 만화/보드카페')],
          isEnd: true, payload: {},
        }),
      },
    })
    await runDiscover(h.deps, { regions: [region] })
    expect(h.saved()[0]!.excludeReason).toBe('category')
  })

  it('한 지역이 실패해도 나머지를 계속 처리한다', async () => {
    let n = 0
    const h = harness({
      local: {
        searchKeyword: async () => {
          if (++n === 1) throw new Error('일시 장애')
          return { places: [place('9', '더그림')], isEnd: true, payload: {} }
        },
      },
    })
    const r = await runDiscover(h.deps, {
      regions: [region, { sido: '경기', sigungu: '가평군' }],
    })
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('양평군')
    expect(h.saved().length).toBeGreaterThan(0)
  })

  it('실패를 health 에 기록한다 — 아픈 소스 이름으로', async () => {
    const health: { source: string; lastError: string | null }[] = []
    const h = harness({
      local: { searchKeyword: async () => { throw new Error('장애') } },
    })
    h.deps.store.writeHealth = async (rows) => {
      health.length = 0
      health.push(...rows)
    }
    await runDiscover(h.deps, { regions: [region] })
    // 개수를 세지 않는다 — 그물별로 각자 기록하므로 성공 기록도 함께 남는다
    const local = health.find((x) => x.source === 'kakao-local')
    expect(local?.lastError).toContain('장애')
  })

  it('그물 C 로 찾은 카페도 추가한다', async () => {
    const h = harness({
      blog: {
        search: async () => ({
          docs: [{ title: '양평 대형카페 BEST', contents: '더그림 최고' }],
          payload: {},
        }),
      },
      llm: {
        name: 'f', modelVersion: 'v',
        extract: async () => ({ names: ['더그림'] }) as never,
      },
      local: {
        searchKeyword: async (q: string) => ({
          places: q.includes('더그림') ? [place('99', '더그림')] : [place('1', '테라로사')],
          isEnd: true,
          payload: {},
        }),
      },
    })
    await runDiscover(h.deps, { regions: [region] })
    expect(h.saved().some((c) => c.kakaoPlaceId === '99')).toBe(true)
  })

  it('skipHarvest 로 그물 C 를 건너뛴다', async () => {
    let called = 0
    const h = harness({
      blog: {
        search: async () => { called++; return { docs: [{ title: 't', contents: 'c' }], payload: {} } },
      },
    })
    await runDiscover(h.deps, { regions: [region], skipHarvest: true })
    expect(called).toBe(0)
  })

  it('시도명을 포함한 검색어를 쓴다', async () => {
    const queries: string[] = []
    const h = harness({
      local: {
        searchKeyword: async (q: string) => {
          queries.push(q)
          return { places: [], isEnd: true, payload: {} }
        },
      },
    })
    await runDiscover(h.deps, { regions: [region], skipHarvest: true })
    expect(queries).toHaveLength(6) // 키워드 6종 x is_end 로 1페이지씩
    expect(queries.every((q) => q.startsWith('경기 양평군 '))).toBe(true)
  })
  it('동명 시군구의 장소를 저장하지 않는다', async () => {
    // 실측: "서울 강서구" 검색에 부산 강서구 8곳, "경기 광주시" 에 전남광주 5곳
    const h = harness({
      local: {
        searchKeyword: async () => ({
          places: [
            place('1', '흐른', '음식점 > 카페', '부산 강서구'),
            place('2', '마곡카페', '음식점 > 카페', '서울 강서구'),
          ],
          isEnd: true,
          payload: {},
        }),
      },
    })
    const r = await runDiscover(h.deps, { regions: [{ sido: '서울', sigungu: '강서구' }] })
    expect(r.offRegion).toBe(1)
    expect(h.saved().map((c) => c.name)).toEqual(['마곡카페'])
  })

  it('타지역은 배제 카운트가 아니라 별도로 센다', async () => {
    // 프랜차이즈 배제와 섞으면 무엇이 걸러졌는지 알 수 없다
    const h = harness({
      local: {
        searchKeyword: async () => ({
          places: [place('1', '카페', '음식점 > 카페', '부산 강서구')],
          isEnd: true, payload: {},
        }),
      },
    })
    const r = await runDiscover(h.deps, { regions: [{ sido: '서울', sigungu: '강서구' }] })
    expect(r.offRegion).toBe(1)
    expect(r.excluded).toBe(0)
    expect(r.discovered).toBe(0)
  })
})

describe('runDiscover — 건강 기록은 아픈 곳에 적는다', () => {
  it('수확(LLM)이 실패해도 kakao-local 을 실패로 적지 않는다', async () => {
    // 실측: 한 덩어리 try 로 묶여 있어서 kakao-local 에 "gemini HTTP 429" 가
    // 64건 적혔다. 어디가 아픈지 모르는 건강 기록은 없는 것보다 나쁘다.
    const h = harness({
      llm: {
        name: 'f',
        modelVersion: 'v',
        extract: async () => { throw new Error('gemini HTTP 429: quota') },
      } as never,
      blog: {
        search: async () => ({
          docs: [{
            title: '양평 대형카페 추천 5곳', contents: '', url: 'u',
            blogName: 'b', dateTime: new Date('2026-08-01T00:00:00Z'), thumbnail: '',
          }],
          payload: {},
        }),
      } as never,
    })
    await runDiscover(h.deps, { regions: [region] })

    const local = h.health().find((x) => x.source === 'kakao-local')
    const harvest = h.health().find((x) => x.source === 'harvest')
    expect(local?.consecutiveFailures ?? 0).toBe(0)
    expect(harvest?.consecutiveFailures ?? 0).toBeGreaterThan(0)
    expect(harvest?.lastError ?? '').toContain('429')
  })

  it('그물 A 가 실패하면 kakao-local 에 적는다', async () => {
    const h = harness({
      local: {
        searchKeyword: async () => { throw new Error('kakao 500') },
      } as never,
    })
    await runDiscover(h.deps, { regions: [region] })
    const local = h.health().find((x) => x.source === 'kakao-local')
    expect(local?.consecutiveFailures ?? 0).toBeGreaterThan(0)
    expect(local?.lastError ?? '').toContain('kakao 500')
  })
})
