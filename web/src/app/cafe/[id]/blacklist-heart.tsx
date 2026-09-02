'use client'

import { useBlacklist } from '@/lib/use-blacklist'

export function BlacklistHeart({ cafeId }: { cafeId: string }) {
  const { blacklisted, toggle } = useBlacklist()
  const on = blacklisted.has(cafeId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? '블랙리스트에서 빼기' : '블랙리스트에 추가'}
      onClick={() => toggle(cafeId)}
      className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border text-[20px] ${
        on ? 'border-ink bg-line text-ink' : 'border-line text-ink-soft'
      }`}
    >
      {on ? '🖤' : '🤍'}
    </button>
  )
}
