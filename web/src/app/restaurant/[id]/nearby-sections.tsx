'use client'

import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

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
      <NearbySection title="근처 카페" items={filterOutHidden(cafes, cafeHidden)} hrefPrefix="/cafe/" icon="☕" />
      <NearbySection title="근처 가볼 곳" items={filterOutHidden(spots, spotHidden)} hrefPrefix="/spot/" icon="🏞️" />
    </>
  )
}
