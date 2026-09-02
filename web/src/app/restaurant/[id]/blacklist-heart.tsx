'use client'

import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'

export function BlacklistHeart({ restaurantId }: { restaurantId: string }) {
  const { blacklisted, toggle } = useRestaurantBlacklist()
  const on = blacklisted.has(restaurantId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? '블랙리스트에서 빼기' : '블랙리스트에 추가'}
      onClick={() => toggle(restaurantId)}
      className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border text-[20px] ${
        on ? 'border-ink bg-line text-ink' : 'border-line text-ink-soft'
      }`}
    >
      {on ? '🖤' : '🤍'}
    </button>
  )
}
