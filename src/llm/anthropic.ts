import { SourceError } from '../sources/rate-limiter.js'
import type { Fetcher, Limiter } from '../sources/types.js'
import { firstJsonObject, type ExtractOptions, type LlmClient } from './types.js'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export interface AnthropicDeps {
  apiKey: string
  fetcher: Fetcher
  limit: Limiter
  model?: string
}

/**
 * 지금 쓰지 않지만 인터페이스가 실제로 provider 를 갈아끼울 수 있음을
 * 코드로 증명한다. Gemini 무료 티어 정책이 바뀌면 .env 두 줄로 옮긴다.
 */
export function createAnthropic(deps: AnthropicDeps): LlmClient {
  const { apiKey, fetcher, limit, model = DEFAULT_MODEL } = deps

  return {
    name: 'anthropic',
    modelVersion: model,

    async extract<T>(opts: ExtractOptions<T>): Promise<T> {
      const { prompt, schema, maxRetries = 3 } = opts
      let lastIssue = ''
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const text = await limit(async () => {
          const res = await fetcher('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model,
              max_tokens: 2048,
              temperature: 0,
              messages: [{
                role: 'user',
                content: attempt === 0
                  ? prompt
                  : `${prompt}\n\n이전 응답이 스키마를 위반했다: ${lastIssue}`,
              }],
            }),
          })
          if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new SourceError(`anthropic HTTP ${res.status}: ${body.slice(0, 200)}`, res.status)
          }
          const b = (await res.json()) as { content?: { text?: string }[] }
          return b.content?.[0]?.text ?? ''
        })

        const json = firstJsonObject(text)
        if (json === null) { lastIssue = 'JSON 객체를 찾을 수 없음'; continue }
        let parsedJson: unknown
        try { parsedJson = JSON.parse(json) } catch { lastIssue = 'JSON 파싱 실패'; continue }
        const parsed = schema.safeParse(parsedJson)
        if (parsed.success) return parsed.data
        lastIssue = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      }
      throw new Error(`LLM 스키마 검증 실패 (${maxRetries}회 시도): ${lastIssue}`)
    },
  }
}
