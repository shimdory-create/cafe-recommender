'use client'

import { useWishlist } from '@/lib/use-wishlist'

export function WishHeart({ cafeId }: { cafeId: string }) {
  const { wished, toggle } = useWishlist()
  const on = wished.has(cafeId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? '위시리스트에서 빼기' : '위시리스트에 담기'}
      onClick={() => toggle(cafeId)}
      className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border text-[20px] ${
        on ? 'border-bean bg-bean-soft text-bean' : 'border-line text-ink-soft'
      }`}
    >
      {on ? '♥' : '♡'}
    </button>
  )
}
