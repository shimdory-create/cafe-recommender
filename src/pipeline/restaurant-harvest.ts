import { z } from 'zod'
import { restaurantCurationQueries } from '../config/restaurant-keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { buildRestaurantHarvestPrompt } from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

const HarvestSchema = z.object({
  names: z.array(z.string().min(1)).max(40),
})

export interface RestaurantHarvestDeps {
  blog: {
    search: (
      q: string, o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  local: { searchKeyword: (q: string, page: number) => Promise<{ places: KakaoPlace[] }> }
  llm: LlmClient
  store: Pick<RestaurantStore, 'appendRaw'>
}

export async function harvestCuratedRestaurants(
  deps: RestaurantHarvestDeps,
  region: Region,
): Promise<{ names: string[]; places: KakaoPlace[] }> {
  const { blog, local, llm, store } = deps
  const label = regionLabel(region)

  const snippets: string[] = []
  for (const q of restaurantCurationQueries(label)) {
    const res = await blog.search(q, { size: 30, sort: 'accuracy' })
    await store.appendRaw('kakao-blog-curation-restaurant', q, res.payload)
    snippets.push(...res.docs.map((d) => `${d.title} ${d.contents}`))
  }
  if (snippets.length === 0) return { names: [], places: [] }

  const { names } = await llm.extract({
    prompt: buildRestaurantHarvestPrompt(label, snippets),
    schema: HarvestSchema,
    maxRetries: 2,
  })

  const seen = new Set<string>()
  const places: KakaoPlace[] = []
  for (const name of names) {
    const { places: found } = await local.searchKeyword(`${region.sigungu} ${name}`, 1)
    const best = found[0]
    if (!best) continue
    if (seen.has(best.id)) continue
    seen.add(best.id)
    places.push(best)
  }
  return { names, places }
}
