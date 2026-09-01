'use client'

import { useRemoteSet } from './use-remote-set'
import type { WishRow } from './reviews'

export interface WishlistState {
  wished: Set<string>
  ready: boolean
  toggle: (cafeId: string) => void
}

/**
 * 위시리스트를 한 번만 읽어 여러 카드가 나눠 쓴다.
 *
 * 카드마다 각자 `/api/wishlist` 를 부르면 리스트 화면에서 요청이 카드 수만큼
 * 나간다 (`visited` 를 홈 피드 레벨에서 한 번만 읽는 것과 같은 이유,
 * `home-feed.tsx` 참고).
 */
export function useWishlist(): WishlistState {
  const { ids, ready, toggle } = useRemoteSet(
    '/api/wishlist',
    (body) => {
      const b = body as { wishes?: WishRow[]; ok?: boolean }
      return { ok: b.ok === true, ids: (b.wishes ?? []).map((w) => w.kakaoPlaceId) }
    },
  )
  return { wished: ids, ready, toggle }
}
