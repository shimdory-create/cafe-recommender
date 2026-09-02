'use client'

import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

function filterOut(items: NearbyCard[], hidden: Set<string>): NearbyCard[] {
  return items.filter((i) => !hidden.has(i.id))
}

export function RestaurantNearbySections(
  { cafes, spots }: { cafes: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])

  return (
    <>
      <NearbySection title="근처 카페" items={filterOut(cafes, cafeHidden)} hrefPrefix="/cafe/" icon="☕" />
      <NearbySection title="근처 가볼 곳" items={filterOut(spots, spotHidden)} hrefPrefix="/spot/" icon="🏞️" />
    </>
  )
}
