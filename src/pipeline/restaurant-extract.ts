import { RestaurantAttributesSchema, type RestaurantAttributes } from '../restaurant-schema.js'
import {
  buildRestaurantExtractPrompt, RESTAURANT_PROMPT_VERSION,
  type RestaurantExtractPromptInput,
} from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'

/**
 * LLM 이 채우는 부분만. extractedAt·modelVersion 은 우리가 붙인다 —
 * 모델이 날짜나 자기 버전을 발명하는 것을 신뢰하지 않는다.
 */
export const LlmRestaurantAttributesSchema = RestaurantAttributesSchema.omit({
  extractedAt: true,
  modelVersion: true,
})

export async function extractRestaurantAttributes(
  deps: { llm: LlmClient; now?: Date },
  input: RestaurantExtractPromptInput,
): Promise<RestaurantAttributes> {
  const { llm, now = new Date() } = deps
  const raw = await llm.extract({
    prompt: buildRestaurantExtractPrompt(input),
    schema: LlmRestaurantAttributesSchema,
    maxRetries: 3,
    // 재시도는 상위 모델로 승급한다 (스펙 v3 6.3)
    escalateTo: 'gemini-3.6-flash',
  })
  return RestaurantAttributesSchema.parse({
    ...raw,
    extractedAt: now.toISOString(),
    // 프롬프트 판본을 함께 남긴다. 프롬프트를 고치면 재추출 대상을
    // 이 값으로 골라낼 수 있다.
    modelVersion: `${llm.modelVersion}+${RESTAURANT_PROMPT_VERSION}`,
  })
}
