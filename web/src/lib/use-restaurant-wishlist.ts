'use client'

import { useRemoteSet } from './use-remote-set'
import type { WishRow } from './reviews'

export interface WishlistState {
  wished: Set<string>
  ready: boolean
  toggle: (restaurantId: string) => void
}

export function useRestaurantWishlist(): WishlistState {
  const { ids, ready, toggle } = useRemoteSet(
    '/api/restaurant/wishlist',
    (body) => {
      const b = body as { wishes?: WishRow[]; ok?: boolean }
      return { ok: b.ok === true, ids: (b.wishes ?? []).map((w) => w.kakaoPlaceId) }
    },
  )
  return { wished: ids, ready, toggle }
}
