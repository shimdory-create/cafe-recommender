import { describe, it, expect } from 'vitest'
import { harvestCurated, type HarvestDeps } from '../../src/pipeline/harvest.js'
import type { KakaoPlace } from '../../src/sources/kakao-local.js'
import type { Region } from '../../src/config/regions.js'

const region: Region = { sido: '경기', sigungu: '양평군' }

const place = (id: string, name: string): KakaoPlace => ({
  id,
  placeName: name,
  categoryName: '음식점 > 카페',
  addressName: '경기 양평군',
  roadAddressName: '경기 양평군 1',
  phone: '',
  placeUrl: `http://place/${id}`,
  lat: 37.49,
  lng: 127.48,
})

function deps(over: Partial<HarvestDeps> = {}): HarvestDeps {
  return {
    blog: {
      search: async () => ({
        docs: [{ title: '양평 대형카페 BEST', contents: '테라로사와 더그림이 좋아요' }],
        payload: {},
      }),
    },
    local: {
      searchKeyword: async (q: string) => ({
        places: [place(q.includes('테라로사') ? '1' : '2', q.split(' ').pop()!)],
      }),
    },
    llm: {
      name: 'fake',
      modelVersion: 'v',
      extract: async () => ({ names: ['테라로사', '더그림'] }) as never,
    },
    store: { appendRaw: async () => 'path' },
    ...over,
  }
}

describe('harvestCurated', () => {
  it('블로그에서 상호명을 뽑아 카카오로 정규화한다', async () => {
    const r = await harvestCurated(deps(), region)
    expect(r.names).toEqual(['테라로사', '더그림'])
    expect(r.places).toHaveLength(2)
    expect(r.places[0]!.id).toBe('1')
  })

  it('kakaoPlaceId 로 중복을 제거한다', async () => {
    const r = await harvestCurated(
      deps({
        local: { searchKeyword: async () => ({ places: [place('same', 'X')] }) },
      }),
      region,
    )
    expect(r.places).toHaveLength(1)
  })

  it('카카오에서 못 찾은 이름은 조용히 건너뛴다', async () => {
    // 블로그 오타나 폐업일 수 있고 여기서 멈출 이유가 없다
    const r = await harvestCurated(
      deps({ local: { searchKeyword: async () => ({ places: [] }) } }),
      region,
    )
    expect(r.places).toEqual([])
    expect(r.names).toHaveLength(2)
  })

  it('스니펫이 없으면 LLM 을 호출하지 않는다', async () => {
    let called = 0
    const r = await harvestCurated(
      deps({
        blog: { search: async () => ({ docs: [], payload: {} }) },
        llm: {
          name: 'f', modelVersion: 'v',
          extract: async () => { called++; return { names: [] } as never },
        },
      }),
      region,
    )
    expect(called).toBe(0)
    expect(r.names).toEqual([])
  })

  it('시도명을 포함한 검색어를 쓴다', async () => {
    // 서울 중구와 인천 중구가 동명이므로 시도가 필요하다
    const queries: string[] = []
    await harvestCurated(
      deps({
        blog: {
          search: async (q: string) => {
            queries.push(q)
            return { docs: [{ title: 't', contents: 'c' }], payload: {} }
          },
        },
      }),
      region,
    )
    expect(queries.length).toBeGreaterThan(0)
    expect(queries.every((q) => q.includes('경기 양평군'))).toBe(true)
  })

  it('원본 응답을 raw 에 적재한다', async () => {
    const saved: string[] = []
    await harvestCurated(
      deps({ store: { appendRaw: async (s) => { saved.push(s); return 'p' } } }),
      region,
    )
    expect(saved.length).toBeGreaterThan(0)
    expect(saved[0]).toContain('curation')
  })

  it('카카오 조회 시에는 시군구만 붙인다', async () => {
    // 카카오 로컬은 "양평군 테라로사" 로 충분하고 시도까지 넣으면
    // 매칭이 오히려 나빠진다
    const queries: string[] = []
    await harvestCurated(
      deps({
        local: {
          searchKeyword: async (q: string) => {
            queries.push(q)
            return { places: [place('1', 'X')] }
          },
        },
      }),
      region,
    )
    expect(queries[0]).toBe('양평군 테라로사')
  })
})
