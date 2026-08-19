import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonStore } from '../../src/store/json-store.js'
import { recordSuccess, recordFailure } from '../../src/sources/health.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cafe-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const NOW = new Date('2026-08-20T00:00:00Z')

describe('health', () => {
  it('성공을 기록하면 소스가 새로 생긴다', async () => {
    const store = createJsonStore(dir)
    await recordSuccess(store, 'kakao-blog', NOW)
    const rows = await store.readHealth()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.source).toBe('kakao-blog')
    expect(rows[0]!.lastSuccessAt).toBe(NOW.toISOString())
    expect(rows[0]!.consecutiveFailures).toBe(0)
  })

  it('실패를 기록하면 연속 실패 수가 올라간다', async () => {
    const store = createJsonStore(dir)
    await recordFailure(store, 'kakao-blog', new Error('장애'), NOW)
    await recordFailure(store, 'kakao-blog', new Error('또 장애'), NOW)
    const rows = await store.readHealth()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.consecutiveFailures).toBe(2)
    expect(rows[0]!.lastError).toBe('또 장애')
  })

  it('성공하면 연속 실패 수가 0으로 리셋된다', async () => {
    const store = createJsonStore(dir)
    await recordFailure(store, 'kakao-blog', new Error('장애'), NOW)
    await recordFailure(store, 'kakao-blog', new Error('장애'), NOW)
    await recordSuccess(store, 'kakao-blog', NOW)
    const rows = await store.readHealth()
    expect(rows[0]!.consecutiveFailures).toBe(0)
    expect(rows[0]!.lastError).toBeNull()
  })

  it('소스별로 따로 기록한다', async () => {
    const store = createJsonStore(dir)
    await recordSuccess(store, 'kakao-local', NOW)
    await recordFailure(store, 'kakao-blog', new Error('장애'), NOW)
    const rows = await store.readHealth()
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.source === 'kakao-local')!.consecutiveFailures).toBe(0)
    expect(rows.find((r) => r.source === 'kakao-blog')!.consecutiveFailures).toBe(1)
  })

  it('Error 가 아닌 것도 문자열로 기록한다', async () => {
    const store = createJsonStore(dir)
    await recordFailure(store, 'x', 'plain string', NOW)
    expect((await store.readHealth())[0]!.lastError).toBe('plain string')
  })

  it('성공 시각을 지우지 않는다 (직전 성공 시점을 알아야 한다)', async () => {
    const store = createJsonStore(dir)
    await recordSuccess(store, 'kakao-blog', NOW)
    const later = new Date('2026-08-21T00:00:00Z')
    await recordFailure(store, 'kakao-blog', new Error('장애'), later)
    const row = (await store.readHealth())[0]!
    expect(row.lastSuccessAt).toBe(NOW.toISOString())
    expect(row.updatedAt).toBe(later.toISOString())
  })
})
