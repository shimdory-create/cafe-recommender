'use client'

import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

function filterOut(items: NearbyCard[], hidden: Set<string>): NearbyCard[] {
  return items.filter((i) => !hidden.has(i.id))
}

export function SpotNearbySections(
  { cafes, restaurants }: { cafes: NearbyCard[]; restaurants: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const restHidden = new Set([...restBlacklisted, ...restDismissed])

  return (
    <>
      <NearbySection title="근처 카페" items={filterOut(cafes, cafeHidden)} hrefPrefix="/cafe/" />
      <NearbySection title="근처 식당" items={filterOut(restaurants, restHidden)} hrefPrefix="/restaurant/" />
    </>
  )
}
