import { SourceError } from '../sources/rate-limiter.js'
import type { Fetcher, Limiter } from '../sources/types.js'
import { firstJsonObject, type ExtractOptions, type LlmClient } from './types.js'
import { zodToGeminiSchema } from './gemini-schema.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * 실측(2026-08-20): gemini-3.1-flash-lite 가 gemini-3.6-flash 와 동일한
 * 정답을 내면서 11배 빠르다 (1.9초 vs 21초). 1,200곳 추출이 7시간에서
 * 38분으로 줄어든다.
 *
 * 별칭(gemini-flash-latest)은 HTTP 503 을 반환했으므로 쓰지 않는다.
 * gemini-2.5-flash 는 신규 사용자에게 404 다.
 */
const DEFAULT_MODEL = 'gemini-3.1-flash-lite'

export interface GeminiDeps {
  apiKey: string
  fetcher: Fetcher
  limit: Limiter
  model?: string
}

export function createGemini(deps: GeminiDeps): LlmClient {
  const { apiKey, fetcher, limit, model = DEFAULT_MODEL } = deps

  async function call(m: string, prompt: string, responseSchema: unknown): Promise<string> {
    return limit(async () => {
      const res = await fetcher(`${BASE}/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            // 필수다. 없으면 스키마 통과율이 0/3 이고 지연도 2배다 (실측).
            responseSchema,
            temperature: 0,
          },
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new SourceError(`gemini HTTP ${res.status}: ${body.slice(0, 200)}`, res.status)
      }
      const b = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      return b.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    })
  }

  return {
    name: 'gemini',
    modelVersion: model,

    async extract<T>(opts: ExtractOptions<T>): Promise<T> {
      const { prompt, schema, maxRetries = 3, escalateTo } = opts
      // zod 스키마에서 Gemini responseSchema 를 유도한다. 스키마를 두 곳에
      // 적어 어긋나는 문제가 없다.
      let responseSchema: unknown
      try {
        responseSchema = zodToGeminiSchema(schema)
      } catch {
        // 변환 불가한 스키마면 mimeType 만으로 진행한다 (재시도가 메꾼다)
        responseSchema = undefined
      }
      let lastIssue = ''
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // 첫 시도는 lite, 재시도부터 상위 모델로 승급 (스펙 v3 6.3)
        const m = attempt > 0 && escalateTo ? escalateTo : model
        const text = await call(
          m,
          attempt === 0
            ? prompt
            : `${prompt}\n\n이전 응답이 스키마를 위반했다: ${lastIssue}\n반드시 스키마를 지켜라.`,
          responseSchema,
        )
        const json = firstJsonObject(text)
        if (json === null) {
          lastIssue = 'JSON 객체를 찾을 수 없음'
          continue
        }
        let parsedJson: unknown
        try {
          parsedJson = JSON.parse(json)
        } catch {
          lastIssue = 'JSON 파싱 실패'
          continue
        }
        const parsed = schema.safeParse(parsedJson)
        if (parsed.success) return parsed.data
        lastIssue = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')
      }
      throw new Error(`LLM 스키마 검증 실패 (${maxRetries}회 시도): ${lastIssue}`)
    },
  }
}
