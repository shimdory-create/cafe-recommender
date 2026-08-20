import { loadEnv, type Env } from '../config/env.js'
import { createJsonStore } from '../store/json-store.js'
import { createRateLimiter } from '../sources/rate-limiter.js'
import { createKakaoLocal } from '../sources/kakao-local.js'
import { createKakaoBlog } from '../sources/kakao-blog.js'
import { createKakaoDirections } from '../sources/kakao-directions.js'
import { createLlm } from '../llm/index.js'
import type { Store } from '../store/types.js'
import type { LlmClient } from '../llm/types.js'

/**
 * CLI·잡이 쓰는 배선. 실제 의존을 한곳에서 조립한다.
 * 테스트는 이 파일을 쓰지 않고 가짜를 직접 주입한다.
 */
export interface Context {
  env: Env
  store: Store
  local: ReturnType<typeof createKakaoLocal>
  blog: ReturnType<typeof createKakaoBlog>
  directions: ReturnType<typeof createKakaoDirections>
  llm: LlmClient
}

export function createContext(): Context {
  const env = loadEnv()
  // 카카오 초당 10건 상한 (Global Constraints)
  const kakaoLimit = createRateLimiter({ perSecond: 10 })
  // LLM 은 더 보수적으로. 무료 티어 분당 한도를 넘지 않게.
  const llmLimit = createRateLimiter({ perSecond: 1 })

  return {
    env,
    store: createJsonStore(env.DATA_DIR),
    local: createKakaoLocal({
      apiKey: env.KAKAO_REST_API_KEY,
      fetcher: fetch,
      limit: kakaoLimit,
    }),
    blog: createKakaoBlog({
      apiKey: env.KAKAO_REST_API_KEY,
      fetcher: fetch,
      limit: kakaoLimit,
    }),
    directions: createKakaoDirections({
      apiKey: env.KAKAO_REST_API_KEY,
      fetcher: fetch,
      limit: kakaoLimit,
    }),
    llm: createLlm(env, { fetcher: fetch, limit: llmLimit }),
  }
}

/** `--flag value` 와 `--flag` 를 읽는다 */
export function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  if (i < 0) return undefined
  const next = argv[i + 1]
  return next && !next.startsWith('--') ? next : ''
}

export function numFlag(argv: string[], name: string): number | undefined {
  const v = flag(argv, name)
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
