'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 하단 탭바. 상단 햄버거 메뉴를 만들지 않는다 (스펙 10.1) —
 * 엄지 도달 범위에 있어야 한 손으로 끝까지 볼 수 있다.
 * 터치 타겟은 44px 이상.
 */
const TABS = [
  { href: '/', label: '이번 주', icon: '☕' },
  { href: '/list', label: '전체', icon: '📋' },
  { href: '/visited', label: '다녀온 곳', icon: '★' },
  { href: '/info', label: '정보', icon: 'ⓘ' },
] as const

export function TabBar() {
  const path = usePathname()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-[480px]">
        {TABS.map((t) => {
          const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[12px] ${
                active ? 'text-bean font-semibold' : 'text-ink-soft'
              }`}
            >
              <span className="text-[17px] leading-none">{t.icon}</span>
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
