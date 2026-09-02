import type { NearbyCard } from './nearby-types'

/** 블랙리스트/다녀온 곳 숨김 목록에 들어있는 항목을 근처 추천에서 뺀다. */
export function filterOutHidden(items: NearbyCard[], hidden: Set<string>): NearbyCard[] {
  return items.filter((i) => !hidden.has(i.id))
}
