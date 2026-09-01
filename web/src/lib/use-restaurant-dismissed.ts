'use client'

import { useRemoteSet } from './use-remote-set'
import type { DismissRow } from './reviews'

export interface DismissedState {
  dismissed: Set<string>
  ready: boolean
  dismiss: (restaurantId: string) => void
}

export function useRestaurantDismissed(): DismissedState {
  const { ids, ready, toggle } = useRemoteSet(
    '/api/restaurant/dismissed',
    (body) => {
      const b = body as { dismissed?: DismissRow[]; ok?: boolean }
      return { ok: b.ok === true, ids: (b.dismissed ?? []).map((d) => d.kakaoPlaceId) }
    },
  )
  return { dismissed: ids, ready, dismiss: toggle }
}
