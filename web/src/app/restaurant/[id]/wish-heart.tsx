'use client'

import { useRestaurantWishlist } from '@/lib/use-restaurant-wishlist'

export function WishHeart({ restaurantId }: { restaurantId: string }) {
  const { wished, toggle } = useRestaurantWishlist()
  const on = wished.has(restaurantId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? '위시리스트에서 빼기' : '위시리스트에 담기'}
      onClick={() => toggle(restaurantId)}
      className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border text-[20px] ${
        on ? 'border-bean bg-bean-soft text-bean' : 'border-line text-ink-soft'
      }`}
    >
      {on ? '♥' : '♡'}
    </button>
  )
}
