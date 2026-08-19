import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonStore } from '../../src/store/json-store.js'
import type { Cafe } from '../../src/schema.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cafe-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const cafe: Cafe = {
  kakaoPlaceId: '1',
  name: '테스트카페',
  sigungu: '양평군',
  lat: 37.5,
  lng: 127.4,
  firstSeenAt: '2026-08-20T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  attributes: null,
  tags: [],
}

describe('createJsonStore', () => {
  it('파일이 없으면 빈 배열을 준다', async () => {
    expect(await createJsonStore(dir).readCafes()).toEqual([])
  })

  it('쓰고 다시 읽으면 같은 값이다', async () => {
    const s = createJsonStore(dir)
    await s.writeCafes([cafe])
    expect(await s.readCafes()).toEqual([cafe])
  })

  it('사람이 읽을 수 있게 들여쓰기해 저장한다', async () => {
    await createJsonStore(dir).writeCafes([cafe])
    const text = readFileSync(join(dir, 'cafes.json'), 'utf8')
    expect(text).toContain('\n  ')
    expect(text.endsWith('\n')).toBe(true) // git diff 를 깨끗하게
  })

  it('임시 파일을 남기지 않는다', async () => {
    // 원자적 쓰기는 tmp -> rename 이므로 흔적이 남으면 안 된다
    await createJsonStore(dir).writeCafes([cafe])
    expect(() => readFileSync(join(dir, '.cafes.json.tmp'), 'utf8')).toThrow()
  })

  it('JSON 이 깨졌으면 파일명과 함께 실패한다', async () => {
    writeFileSync(join(dir, 'cafes.json'), '{ 깨진 JSON')
    await expect(createJsonStore(dir).readCafes()).rejects.toThrow(/cafes\.json/)
  })

  it('스키마에 맞지 않으면 파일명과 문제 필드를 알려준다', async () => {
    writeFileSync(join(dir, 'cafes.json'), '[{"name":"깨진데이터"}]')
    await expect(createJsonStore(dir).readCafes()).rejects.toThrow(/cafes\.json/)
  })

  it('원본 스냅샷을 날짜 폴더에 적재한다', async () => {
    const s = createJsonStore(dir)
    const p = await s.appendRaw(
      'kakao-blog',
      '양평군 테라로사',
      { documents: [] },
      new Date('2026-08-20T05:00:00Z'),
    )
    expect(p).toContain('2026-08-20')
    const saved = JSON.parse(readFileSync(p, 'utf8'))
    expect(saved.query).toBe('양평군 테라로사')
    expect(saved.source).toBe('kakao-blog')
    expect(saved.payload).toEqual({ documents: [] })
  })

  it('블랙리스트를 읽고 기본 matchType 을 채운다', async () => {
    writeFileSync(join(dir, 'blacklist.json'), '[{"pattern":"스타벅스"}]')
    const bl = await createJsonStore(dir).readBlacklist()
    expect(bl[0]!.matchType).toBe('contains')
  })

  it('방문 기록을 쓰고 읽는다', async () => {
    const s = createJsonStore(dir)
    await s.writeVisits([{ kakaoPlaceId: '1', visitedOn: '2026-08-16' }])
    expect(await s.readVisits()).toEqual([{ kakaoPlaceId: '1', visitedOn: '2026-08-16' }])
  })

  it('헬스 기록을 쓰고 읽는다', async () => {
    const s = createJsonStore(dir)
    await s.writeHealth([{
      source: 'kakao-blog',
      lastSuccessAt: '2026-08-20T00:00:00.000Z',
      lastError: null,
      consecutiveFailures: 0,
      updatedAt: '2026-08-20T00:00:00.000Z',
    }])
    expect((await s.readHealth())[0]!.source).toBe('kakao-blog')
  })
})
