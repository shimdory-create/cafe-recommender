export class SourceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SourceError'
  }
}

export interface RateLimiterOptions {
  perSecond: number
  maxRetries?: number
  /** 주입 가능 — 테스트에서 실제로 기다리지 않는다 */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * 초당 상한 + 429/5xx 지수 백오프.
 *
 * 호출을 직렬화한다. 동시 호출이 초당 상한을 우회하지 못하게 하기 위함이다.
 * 401·403 은 재시도하지 않는다 — 다섯 번 두드려도 열리지 않는다.
 */
export function createRateLimiter(opts: RateLimiterOptions) {
  const { perSecond, maxRetries = 4, sleep = realSleep, now = Date.now } = opts
  const minGapMs = 1000 / perSecond
  let lastAt = -Infinity
  let chain: Promise<unknown> = Promise.resolve()

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = lastAt + minGapMs - now()
      if (wait > 0) await sleep(wait)
      lastAt = now()

      let lastErr: unknown
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn()
        } catch (e) {
          lastErr = e
          const status = e instanceof SourceError ? e.status : undefined
          const retryable = status === 429 || (status !== undefined && status >= 500)
          if (!retryable || attempt === maxRetries) throw e
          await sleep(minGapMs * 2 ** (attempt + 1))
        }
      }
      throw lastErr
    })
    // 실패가 뒤 요청을 막지 않게 체인에서 떼어낸다
    chain = run.catch(() => {})
    return run as Promise<T>
  }
}
