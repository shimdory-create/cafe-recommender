'use client'

import { useState } from 'react'
import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'
import { CourseSection } from '../../course-section'

export function SpotNearbySections(
  { cafes, restaurants }: { cafes: NearbyCard[]; restaurants: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const restHidden = new Set([...restBlacklisted, ...restDismissed])
  const filteredCafes = filterOutHidden(cafes, cafeHidden)
  const filteredRest = filterOutHidden(restaurants, restHidden)

  const [cafeIdx, setCafeIdx] = useState(0)
  const [restIdx, setRestIdx] = useState(0)

  return (
    <>
      {filteredCafes.length > 0 && filteredRest.length > 0 && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">오늘 코스</h2>
          <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
            <CourseSection
              items={filteredCafes} hrefPrefix="/cafe/" icon="☕" label="카페"
              index={cafeIdx} onNext={() => setCafeIdx((i) => i + 1)}
            />
            <CourseSection
              items={filteredRest} hrefPrefix="/restaurant/" icon="🍚" label="식당"
              index={restIdx} onNext={() => setRestIdx((i) => i + 1)}
            />
          </div>
        </section>
      )}
      <NearbySection title="근처 카페" items={filteredCafes} hrefPrefix="/cafe/" icon="☕" />
      <NearbySection title="근처 식당" items={filteredRest} hrefPrefix="/restaurant/" icon="🍚" />
    </>
  )
}
