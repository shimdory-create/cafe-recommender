'use client'

import { useState } from 'react'
import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'
import { CourseSection } from '../../course-section'

export function CafeNearbySections(
  { restaurants, spots }: { restaurants: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const restHidden = new Set([...restBlacklisted, ...restDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])
  const filteredRest = filterOutHidden(restaurants, restHidden)
  const filteredSpots = filterOutHidden(spots, spotHidden)

  const [restIdx, setRestIdx] = useState(0)
  const [spotIdx, setSpotIdx] = useState(0)

  return (
    <>
      {filteredRest.length > 0 && filteredSpots.length > 0 && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">오늘 코스</h2>
          <div className="mt-2 flex gap-3">
            <CourseSection
              items={filteredRest} hrefPrefix="/restaurant/" icon="🍚" label="식당"
              index={restIdx} onNext={() => setRestIdx((i) => i + 1)}
            />
            <CourseSection
              items={filteredSpots} hrefPrefix="/spot/" icon="🏞️" label="가볼 곳"
              index={spotIdx} onNext={() => setSpotIdx((i) => i + 1)}
            />
          </div>
        </section>
      )}
      <NearbySection
        title="근처 식당"
        items={filteredRest}
        hrefPrefix="/restaurant/"
        icon="🍚"
      />
      <NearbySection
        title="근처 가볼 곳"
        items={filteredSpots}
        hrefPrefix="/spot/"
        icon="🏞️"
      />
    </>
  )
}
