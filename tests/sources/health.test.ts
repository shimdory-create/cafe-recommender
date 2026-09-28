import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonStore } from '../../src/store/json-store.js'
import { recordSuccess, recordFailure, recordQuotaError } from '../../src/sources/health.js'

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

  describe('recordQuotaError', () => {
    it('오늘 쿼터 오류 수를 센다', async () => {
      const store = createJsonStore(dir)
      await recordQuotaError(store, 'classify', NOW)
      await recordQuotaError(store, 'classify', NOW)
      const row = (await store.readHealth())[0]!
      expect(row.quotaErrorsToday).toBe(2)
      expect(row.quotaErrorsDate).toBe('2026-08-20')
    })

    it('날짜가 바뀌면 다시 1부터 센다', async () => {
      const store = createJsonStore(dir)
      await recordQuotaError(store, 'classify', NOW)
      await recordQuotaError(store, 'classify', NOW)
      const nextDay = new Date('2026-08-21T00:00:00Z')
      await recordQuotaError(store, 'classify', nextDay)
      const row = (await store.readHealth())[0]!
      expect(row.quotaErrorsToday).toBe(1)
      expect(row.quotaErrorsDate).toBe('2026-08-21')
    })

    it('recordSuccess 가 나중에 와도 오늘 쿼터 오류 수는 지워지지 않는다', async () => {
      // 이게 이 함수를 만든 이유다 — 회차 끝에 하나라도 통과하면
      // recordSuccess 가 consecutiveFailures·lastError 를 지우는데,
      // 429가 있었다는 사실 자체는 남아야 daily-watch 가 놓치지 않는다.
      const store = createJsonStore(dir)
      await recordQuotaError(store, 'classify', NOW)
      await recordQuotaError(store, 'classify', NOW)
      await recordSuccess(store, 'classify', NOW)
      const row = (await store.readHealth())[0]!
      expect(row.quotaErrorsToday).toBe(2)
      expect(row.consecutiveFailures).toBe(0)
      expect(row.lastError).toBeNull()
    })

    it('recordFailure 가 오늘 쿼터 오류 수를 건드리지 않는다', async () => {
      const store = createJsonStore(dir)
      await recordQuotaError(store, 'classify', NOW)
      await recordFailure(store, 'classify', new Error('무관한 실패'), NOW)
      const row = (await store.readHealth())[0]!
      expect(row.quotaErrorsToday).toBe(1)
    })
  })
})
