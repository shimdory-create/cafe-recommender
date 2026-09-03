'use client'

import { useState } from 'react'
import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'
import { CourseSection } from '../../course-section'

export function RestaurantNearbySections(
  { cafes, spots }: { cafes: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])
  const filteredCafes = filterOutHidden(cafes, cafeHidden)
  const filteredSpots = filterOutHidden(spots, spotHidden)

  const [cafeIdx, setCafeIdx] = useState(0)
  const [spotIdx, setSpotIdx] = useState(0)

  return (
    <>
      {filteredCafes.length > 0 && filteredSpots.length > 0 && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">오늘 코스</h2>
          <div className="mt-2 flex gap-3">
            <CourseSection
              items={filteredCafes} hrefPrefix="/cafe/" icon="☕" label="카페"
              index={cafeIdx} onNext={() => setCafeIdx((i) => i + 1)}
            />
            <CourseSection
              items={filteredSpots} hrefPrefix="/spot/" icon="🏞️" label="가볼 곳"
              index={spotIdx} onNext={() => setSpotIdx((i) => i + 1)}
            />
          </div>
        </section>
      )}
      <NearbySection title="근처 카페" items={filteredCafes} hrefPrefix="/cafe/" icon="☕" />
      <NearbySection title="근처 가볼 곳" items={filteredSpots} hrefPrefix="/spot/" icon="🏞️" />
    </>
  )
}
