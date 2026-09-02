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
        on
          ? 'border-red-600 bg-red-50 text-red-600 dark:border-red-400 dark:bg-red-950/40 dark:text-red-400'
          : 'border-line text-ink-soft'
      }`}
    >
      ⊘
    </button>
  )
}
