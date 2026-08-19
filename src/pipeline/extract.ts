import { CafeAttributesSchema, type CafeAttributes } from '../schema.js'
import { buildExtractPrompt, type ExtractPromptInput } from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'

/**
 * LLM 이 채우는 부분만. extractedAt·modelVersion 은 우리가 붙인다 —
 * 모델이 날짜나 자기 버전을 발명하는 것을 신뢰하지 않는다.
 */
export const LlmAttributesSchema = CafeAttributesSchema.omit({
  extractedAt: true,
  modelVersion: true,
})

export async function extractAttributes(
  deps: { llm: LlmClient; now?: Date },
  input: ExtractPromptInput,
): Promise<CafeAttributes> {
  const { llm, now = new Date() } = deps
  const raw = await llm.extract({
    prompt: buildExtractPrompt(input),
    schema: LlmAttributesSchema,
    maxRetries: 3,
    // 재시도는 상위 모델로 승급한다 (스펙 v3 6.3)
    escalateTo: 'gemini-3.6-flash',
  })
  return CafeAttributesSchema.parse({
    ...raw,
    extractedAt: now.toISOString(),
    modelVersion: llm.modelVersion,
  })
}
