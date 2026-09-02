import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSpotJsonStore } from '../../src/store/spot-json-store.js'

let dir: string

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('createSpotJsonStore', () => {
  it('쓴 뒤 읽으면 같은 내용이 온다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'spot-store-'))
    const store = createSpotJsonStore(dir)
    expect(await store.readSpots()).toEqual([])
    const row = {
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'pending_extraction' as const,
      ambiguousName: false, attributes: null, tags: [],
    }
    await store.writeSpots([row])
    expect(await store.readSpots()).toEqual([row])
  })

  it('파일이 없으면 빈 배열이다 (카페·식당 저장소와 같은 동작)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'spot-store-'))
    const store = createSpotJsonStore(dir)
    expect(await store.readSpotBuzz()).toEqual([])
    expect(await store.readSpotSuggestions()).toEqual([])
    expect(await store.readHealth()).toEqual([])
  })

  it('readSpotVisits: 파일이 없으면 빈 배열', async () => {
    const store = createSpotJsonStore(dir)
    expect(await store.readSpotVisits()).toEqual([])
  })

  it('readSpotReviews: 파일이 없으면 빈 배열', async () => {
    const store = createSpotJsonStore(dir)
    expect(await store.readSpotReviews()).toEqual([])
  })
})
