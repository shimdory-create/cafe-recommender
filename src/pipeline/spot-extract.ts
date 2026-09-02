import { SpotAttributesSchema, type SpotAttributes } from '../spot-schema.js'
import {
  buildSpotExtractPrompt, SPOT_PROMPT_VERSION, type SpotExtractPromptInput,
} from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'

export const LlmSpotAttributesSchema = SpotAttributesSchema.omit({
  extractedAt: true,
  modelVersion: true,
})

export async function extractSpotAttributes(
  deps: { llm: LlmClient; now?: Date },
  input: SpotExtractPromptInput,
): Promise<SpotAttributes> {
  const { llm, now = new Date() } = deps
  const raw = await llm.extract({
    prompt: buildSpotExtractPrompt(input),
    schema: LlmSpotAttributesSchema,
    maxRetries: 3,
    escalateTo: 'gemini-3.6-flash',
  })
  return SpotAttributesSchema.parse({
    ...raw,
    extractedAt: now.toISOString(),
    modelVersion: `${llm.modelVersion}+${SPOT_PROMPT_VERSION}`,
  })
}
