import type { RestaurantAttributes } from '../restaurant-schema.js'

export function assignRestaurantTags(a: RestaurantAttributes): string[] {
  const tags = new Set<string>()
  if (a.cuisineType) tags.add(a.cuisineType)
  if (a.hasRoom) tags.add('룸있음')
  if (a.reservable) tags.add('예약가능')
  return [...tags]
}
