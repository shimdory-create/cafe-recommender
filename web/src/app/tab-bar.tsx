'use client'

import Link, { type LinkProps } from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 하단 탭바. 상단 햄버거 메뉴를 만들지 않는다 (스펙 10.1) —
 * 엄지 도달 범위에 있어야 한 손으로 끝까지 볼 수 있다.
 * 터치 타겟은 44px 이상.
 *
 * 탭을 배열로 돌리지 않고 하나씩 적는다. Next 의 타입 라우트가 `href` 를
 * 리터럴로 요구하기 때문에 배열의 유니온 타입은 받지 않는다.
 */
function Tab({
  href, label, icon, active,
}: { href: LinkProps<string>['href']; label: string; icon: string; active: boolean }) {
  return (
    <span className="flex-1">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[12px] ${
          active ? 'text-bean font-semibold' : 'text-ink-soft'
        }`}
      >
        <span className="text-[17px] leading-none">{icon}</span>
        {label}
      </Link>
    </span>
  )
}

export function TabBar() {
  const path = usePathname()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-[480px]">
        <Tab href="/" label="이번 주" icon="☕" active={path === '/'} />
        <Tab href="/list" label="전체" icon="📋" active={path.startsWith('/list')} />
        <Tab href="/visited" label="다녀온 곳" icon="★" active={path.startsWith('/visited')} />
        <Tab href="/info" label="정보" icon="ⓘ" active={path.startsWith('/info')} />
      </div>
    </nav>
  )
}
