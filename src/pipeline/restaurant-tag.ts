import type { RestaurantAttributes } from '../restaurant-schema.js'

export function assignRestaurantTags(a: RestaurantAttributes): string[] {
  // 음식종류 미분류면 태그를 아예 만들지 않는다 (스펙 2절) — 룸·예약
  // 같은 편의 태그만으로 하드 게이트(태그 0개 배제)를 통과시키지 않는다.
  if (!a.cuisineType) return []
  const tags = new Set<string>()
  tags.add(a.cuisineType)
  if (a.hasRoom) tags.add('룸있음')
  if (a.reservable) tags.add('예약가능')
  return [...tags]
}
