import type { NearbyCard } from './nearby-types'

/** 배열과 (모듈로 순환하는) 인덱스로 코스에 보여줄 카드 하나를 고른다. 배열이 비어있으면 null. */
export function pickCourseItem(items: NearbyCard[], index: number): NearbyCard | null {
  if (items.length === 0) return null
  return items[index % items.length]!
}
