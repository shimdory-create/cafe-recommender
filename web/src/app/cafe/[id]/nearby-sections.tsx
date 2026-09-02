'use client'

import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

function filterOut(items: NearbyCard[], hidden: Set<string>): NearbyCard[] {
  return items.filter((i) => !hidden.has(i.id))
}

export function CafeNearbySections(
  { restaurants, spots }: { restaurants: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const restHidden = new Set([...restBlacklisted, ...restDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])

  return (
    <>
      <NearbySection
        title="근처 식당"
        items={filterOut(restaurants, restHidden)}
        hrefPrefix="/restaurant/"
      />
      <NearbySection
        title="근처 가볼 곳"
        items={filterOut(spots, spotHidden)}
        hrefPrefix="/spot/"
      />
    </>
  )
}
