'use client'

import { useSpotWishlist } from '@/lib/use-spot-wishlist'

export function WishHeart({ spotId }: { spotId: string }) {
  const { wished, toggle } = useSpotWishlist()
  const on = wished.has(spotId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? '위시리스트에서 빼기' : '위시리스트에 담기'}
      onClick={() => toggle(spotId)}
      className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border text-[20px] ${
        on ? 'border-bean bg-bean-soft text-bean' : 'border-line text-ink-soft'
      }`}
    >
      {on ? '♥' : '♡'}
    </button>
  )
}
