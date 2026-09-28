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
   * Gemini 무료 티어 실제 한도는 분당 15건(RPM)인데, 이전 값(초당 1건 =
   * 분당 최대 60건)은 그 4배로 느슨해서 사실상 방어가 안 됐다 — classify가
   * 통과 후보를 순차 처리할 때 응답 지연(약 1.9초/건)만으로도 자연스럽게
   * 분당 30건 안팎이 나와 15건을 넘겼다(2026-09-29, AI Studio 대시보드
   * 실측 RPM 429 확인).
   *
   * 게다가 이 GEMINI_API_KEY 는 다른 프로젝트(healthcare-radar)와 같은
   * Google 프로젝트를 공유한다 — 그쪽은 분당 13.3건으로 이미 낮춰뒀다.
   * 두 프로젝트가 같은 15 RPM 을 나눠 쓰는 구조라, 이쪽도 여유 있게
   * 12건(초당 0.2건)으로 낮춘다. 근본 해결은 프로젝트별로 API 키를
   * 분리하는 것 — 그전까지는 두 프로젝트 다 자기 몫을 아껴 써야 한다.
   */
  const llmLimit = createRateLimiter({ perSecond: 0.2 })

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
