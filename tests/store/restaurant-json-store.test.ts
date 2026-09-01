import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRestaurantJsonStore } from '../../src/store/restaurant-json-store.js'

let dir: string

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('createRestaurantJsonStore', () => {
  it('쓴 뒤 읽으면 같은 내용이 온다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'rest-store-'))
    const store = createRestaurantJsonStore(dir)
    expect(await store.readRestaurants()).toEqual([])
    const row = {
      kakaoPlaceId: '1', name: '식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-01T00:00:00.000Z', status: 'pending_extraction' as const,
      ambiguousName: false, attributes: null, tags: [],
    }
    await store.writeRestaurants([row])
    expect(await store.readRestaurants()).toEqual([row])
  })

  it('파일이 없으면 빈 배열이다 (카페 저장소와 같은 동작)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'rest-store-'))
    const store = createRestaurantJsonStore(dir)
    expect(await store.readRestaurantBuzz()).toEqual([])
    expect(await store.readRestaurantSuggestions()).toEqual([])
    expect(await store.readHealth()).toEqual([])
  })

  it('실제 data/restaurant-blacklist.json 이 BlacklistEntrySchema 로 파싱된다 (Fix 3)', async () => {
    const store = createRestaurantJsonStore('data')
    const rows = await store.readBlacklist()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((e) => e.pattern === '맥도날드')).toBe(true)
    for (const e of rows) {
      expect(e.pattern.length).toBeGreaterThan(0)
      expect(['contains', 'exact', 'regex']).toContain(e.matchType)
    }
  })
})
