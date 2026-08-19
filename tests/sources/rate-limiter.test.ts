import { describe, it, expect, vi } from 'vitest'
import { createRateLimiter, SourceError } from '../../src/sources/rate-limiter.js'

describe('SourceError', () => {
  it('상태코드를 담는다', () => {
    const e = new SourceError('nope', 403)
    expect(e.status).toBe(403)
    expect(e.name).toBe('SourceError')
  })
})

describe('createRateLimiter', () => {
  it('초당 상한을 넘으면 대기시킨다', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const limit = createRateLimiter({ perSecond: 2, sleep, now: () => 0 })
    await limit(async () => 'a')
    await limit(async () => 'b')
    expect(sleep).toHaveBeenCalled()
  })

  it('상한 안에서는 대기하지 않는다', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    let t = 0
    const limit = createRateLimiter({ perSecond: 10, sleep, now: () => (t += 200) })
    await limit(async () => 'a')
    await limit(async () => 'b')
    expect(sleep).not.toHaveBeenCalled()
  })

  it('결과를 그대로 통과시킨다', async () => {
    const limit = createRateLimiter({ perSecond: 100, sleep: async () => {}, now: () => 0 })
    expect(await limit(async () => ({ ok: 1 }))).toEqual({ ok: 1 })
  })

  it('429 를 받으면 지수 백오프로 재시도한다', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const limit = createRateLimiter({ perSecond: 100, sleep, now: () => 0, maxRetries: 3 })
    let calls = 0
    const result = await limit(async () => {
      calls++
      if (calls < 3) throw new SourceError('rate limited', 429)
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(calls).toBe(3)
    const waits = sleep.mock.calls.map((c) => c[0])
    expect(waits[1]).toBeGreaterThan(waits[0]!)
  })

  it('5xx 도 재시도한다', async () => {
    const limit = createRateLimiter({
      perSecond: 100, sleep: async () => {}, now: () => 0, maxRetries: 3,
    })
    let calls = 0
    const r = await limit(async () => {
      calls++
      if (calls < 2) throw new SourceError('overloaded', 503)
      return 'ok'
    })
    expect(r).toBe('ok')
    expect(calls).toBe(2)
  })

  it('재시도 한도를 넘으면 마지막 오류를 던진다', async () => {
    const limit = createRateLimiter({
      perSecond: 100, sleep: async () => {}, now: () => 0, maxRetries: 2,
    })
    await expect(limit(async () => {
      throw new SourceError('nope', 429)
    })).rejects.toThrow('nope')
  })

  it('429 가 아닌 오류는 재시도하지 않는다', async () => {
    // 401·403 을 다섯 번 두드려봐야 소용없다. Task 0 에서 얻은 교훈.
    const limit = createRateLimiter({
      perSecond: 100, sleep: async () => {}, now: () => 0, maxRetries: 5,
    })
    let calls = 0
    await expect(limit(async () => {
      calls++
      throw new SourceError('bad key', 401)
    })).rejects.toThrow('bad key')
    expect(calls).toBe(1)
  })

  it('상태코드 없는 오류도 재시도하지 않는다', async () => {
    const limit = createRateLimiter({
      perSecond: 100, sleep: async () => {}, now: () => 0, maxRetries: 5,
    })
    let calls = 0
    await expect(limit(async () => {
      calls++
      throw new Error('프로그래밍 오류')
    })).rejects.toThrow('프로그래밍 오류')
    expect(calls).toBe(1)
  })

  it('한 호출의 실패가 다음 호출을 막지 않는다', async () => {
    const limit = createRateLimiter({
      perSecond: 100, sleep: async () => {}, now: () => 0, maxRetries: 1,
    })
    await expect(limit(async () => { throw new SourceError('x', 401) })).rejects.toThrow()
    expect(await limit(async () => 'still works')).toBe('still works')
  })
})
