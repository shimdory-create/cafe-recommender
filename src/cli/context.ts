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
  /**
   * Gemini 무료 티어 실제 한도는 분당 15건(RPM). 이 GEMINI_API_KEY 는
   * 다른 프로젝트(healthcare-radar)와 같은 Google 프로젝트를 공유한다
   * (2026-09-29 확인 — 키를 프로젝트별로 분리하려 했으나 이 계정의 새
   * 프로젝트는 서비스 계정 바인딩이 강제돼 우리 코드의 단순 API 키
   * 인증이 안 통한다. OAuth2 재구현은 범위가 커서 보류하고, 당분간은
   * 나눠 쓰는 걸 전제로 서로 합이 15를 넘지 않게 맞춘다).
   *
   * healthcare-radar 가 분당 9건(6.7초 간격)으로 맞췄고, 이쪽은 평소
   * 부담이 적어 분당 6건(초당 0.1건)으로 더 낮춰 합을 15로 맞춘다 —
   * 레이다 쪽과 합의된 배분(2026-09-29). 스케줄이 안 겹치게 조율되면
   * 더 여유를 줄 수 있다.
   */
  const llmLimit = createRateLimiter({ perSecond: 0.1 })

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
