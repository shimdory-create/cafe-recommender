import type { SpotAttributes } from '../spot-schema.js'

export function assignSpotTags(a: SpotAttributes): string[] {
  return [...new Set(a.tags)]
}
