import { describe, it, expect } from 'vitest'
import { runSpotDiscover } from '../../src/jobs/spot-discover.js'
import { SourceError } from '../../src/sources/rate-limiter.js'
import type { Region } from '../../src/config/regions.js'

const region: Region = { sido: '인천', sigungu: '부평구', excluded: false } as unknown as Region

function harness(opts?: {
  blog?: {
    search: (q: string, o?: object) => Promise<{
      docs: { title: string; contents: string }[]; payload: unknown
    }>
  }
  llm?: { modelVersion: string; extract: (...a: never[]) => Promise<unknown> }
}) {
  let saved: unknown[] = []
  let health: unknown[] = []
  const deps = {
    store: {
      readSpots: async () => saved as never,
      writeSpots: async (r: unknown[]) => { saved = r },
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    local: {
      searchKeyword: async () => ({
        places: [{
          id: '1', placeName: '아무개공원', roadAddressName: '인천 부평구 1',
          addressName: '인천 부평구 1', lat: 37.5, lng: 126.7, categoryName: '여가시설 > 공원',
          placeUrl: '', phone: '',
        }],
        isEnd: true, payload: {},
      }),
    },
    blog: opts?.blog ?? { search: async () => ({ docs: [], payload: {} }) },
    llm: (opts?.llm
      ?? { modelVersion: 'fake-1', extract: async () => ({ names: [] }) }) as never,
    now: new Date('2026-09-02'),
  }
  return { deps, saved: () => saved, health: () => health }
}

describe('runSpotDiscover', () => {
  it('카카오 키워드 검색으로 찾은 장소를 pending_extraction 으로 넣는다', async () => {
    const h = harness()
    const r = await runSpotDiscover(h.deps, { regions: [region], skipHarvest: true })
    expect(r.discovered).toBe(1)
    expect((h.saved()[0] as { status: string }).status).toBe('pending_extraction')
  })

  it('카카오 분류가 음식점이면 저장하지 않는다 (카페·식당은 가볼 곳이 아니다)', async () => {
    const h = harness()
    h.deps.local.searchKeyword = async () => ({
      places: [{
        id: '1', placeName: '어떤카페', roadAddressName: '인천 부평구 1',
        addressName: '인천 부평구 1', lat: 37.5, lng: 126.7,
        categoryName: '음식점 > 카페 > 커피전문점',
        placeUrl: '', phone: '',
      }],
      isEnd: true, payload: {},
    })
    const r = await runSpotDiscover(h.deps, { regions: [region], skipHarvest: true })
    expect(r.discovered).toBe(0)
    expect(r.foodCategory).toBe(1)
    expect(h.saved()).toEqual([])
  })

  it('하베스트 LLM 쿼터가 소진되면 일찍 멈춘다', async () => {
    let llmCalls = 0
    const regions: Region[] = Array.from({ length: 5 }, (_, i) => (
      { sido: '인천', sigungu: `지역${i}`, excluded: false } as unknown as Region
    ))
    const h = harness({
      blog: { search: async () => ({ docs: [{ title: '지역 가볼 곳 5곳', contents: '' }], payload: {} }) },
      llm: {
        modelVersion: 'fake-1',
        extract: async () => {
          llmCalls++
          throw new SourceError('gemini HTTP 429: quota exceeded', 429)
        },
      },
    })
    const r = await runSpotDiscover(h.deps, { regions })
    expect(r.quotaExhausted).toBe(true)
    expect(llmCalls).toBe(3)
  })

  it('쿼터가 아닌 하베스트 오류는 지역을 계속 돈다', async () => {
    let llmCalls = 0
    const regions: Region[] = Array.from({ length: 5 }, (_, i) => (
      { sido: '인천', sigungu: `지역${i}`, excluded: false } as unknown as Region
    ))
    const h = harness({
      blog: { search: async () => ({ docs: [{ title: '지역 가볼 곳 5곳', contents: '' }], payload: {} }) },
      llm: {
        modelVersion: 'fake-1',
        extract: async () => { llmCalls++; throw new Error('이상한 응답') },
      },
    })
    const r = await runSpotDiscover(h.deps, { regions })
    expect(r.quotaExhausted).toBe(false)
    expect(llmCalls).toBe(5)
  })
})
