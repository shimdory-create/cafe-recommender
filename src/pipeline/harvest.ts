import { z } from 'zod'
import { curationQueries } from '../config/keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { buildHarvestPrompt } from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { Store } from '../store/types.js'

const HarvestSchema = z.object({
  names: z.array(z.string().min(1)).max(40),
})

export interface HarvestDeps {
  blog: {
    search: (
      q: string,
      o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  local: {
    searchKeyword: (q: string, page: number) => Promise<{ places: KakaoPlace[] }>
  }
  llm: LlmClient
  store: Pick<Store, 'appendRaw'>
}

/**
 * 그물 C — 블로그 큐레이션 수확.
 *
 * 왜 필요한가 (실측): "양평 베이커리카페" 로 카카오 키워드 검색을 돌렸을
 * 때 1위가 무관한 커피전문점이었다. 카카오 키워드 검색은 상호명 매칭
 * 위주라 상호에 "대형"이 없는 대형카페를 놓친다.
 *
 * 블로거가 이미 손으로 큐레이션한 "BEST N" 글에서 상호명을 뽑아 이
 * 구멍을 메운다. 동네 카페는 그런 글에 등장하지 않는다.
 */
export async function harvestCurated(
  deps: HarvestDeps,
  region: Region,
): Promise<{ names: string[]; places: KakaoPlace[] }> {
  const { blog, local, llm, store } = deps
  const label = regionLabel(region)

  const snippets: string[] = []
  for (const q of curationQueries(label)) {
    const res = await blog.search(q, { size: 30, sort: 'accuracy' })
    await store.appendRaw('kakao-blog-curation', q, res.payload)
    snippets.push(...res.docs.map((d) => `${d.title} ${d.contents}`))
  }
  if (snippets.length === 0) return { names: [], places: [] }

  const { names } = await llm.extract({
    prompt: buildHarvestPrompt(label, snippets),
    schema: HarvestSchema,
    maxRetries: 2,
  })

  const seen = new Set<string>()
  const places: KakaoPlace[] = []
  for (const name of names) {
    // 카카오 로컬에는 시군구만 붙인다. 시도까지 넣으면 매칭이 나빠진다.
    const { places: found } = await local.searchKeyword(`${region.sigungu} ${name}`, 1)
    const best = found[0]
    // 못 찾으면 조용히 건너뛴다 — 블로그 오타나 폐업일 수 있고
    // 여기서 파이프라인을 멈출 이유가 없다.
    if (!best) continue
    if (seen.has(best.id)) continue
    seen.add(best.id)
    places.push(best)
  }
  return { names, places }
}
