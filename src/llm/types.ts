import type { z } from 'zod'

export interface ExtractOptions<T> {
  prompt: string
  schema: z.ZodType<T>
  maxRetries?: number
  /** 재시도에서 올려붙일 상위 모델 */
  escalateTo?: string
}

/**
 * LLM 경계. Gemini 무료 티어를 쓰지만 정책이 바뀌면 .env 두 줄로
 * Anthropic 으로 옮긴다 (스펙 6.6 원칙 3).
 */
export interface LlmClient {
  readonly name: string
  readonly modelVersion: string
  extract<T>(opts: ExtractOptions<T>): Promise<T>
}

/** 모델이 코드펜스로 감싸 오는 경우가 있다. 벗겨서 JSON 만 남긴다. */
export function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (fenced?.[1] ?? text).trim()
}

/** 앞뒤에 설명이 붙어와도 첫 JSON 객체를 찾아낸다. */
export function firstJsonObject(text: string): string | null {
  const stripped = stripFences(text)
  if (stripped.startsWith('{')) return stripped
  const m = stripped.match(/\{[\s\S]*\}/)
  return m ? m[0] : null
}
