import { createGemini } from './gemini.js'
import { createAnthropic } from './anthropic.js'
import type { LlmClient } from './types.js'
import type { Fetcher, Limiter } from '../sources/types.js'

export type { LlmClient, ExtractOptions } from './types.js'
export { createGemini, createAnthropic }

export interface LlmEnv {
  LLM_PROVIDER: string
  GEMINI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

export function createLlm(
  env: LlmEnv,
  deps: { fetcher: Fetcher; limit: Limiter },
): LlmClient {
  if (env.LLM_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 가 없다')
    return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY, ...deps })
  }
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 가 없다')
  return createGemini({ apiKey: env.GEMINI_API_KEY, ...deps })
}
