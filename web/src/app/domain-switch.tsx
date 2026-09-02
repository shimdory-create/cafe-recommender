'use client'

import { usePathname, useRouter } from 'next/navigation'
import { domainOf, switchDomainPath, type Domain } from '@/lib/domain-switch'

/**
 * 헤더 안에 들어가는 카페/식당 전환 세그먼트 버튼.
 *
 * 56px 헤더 높이를 유지해야 해서(전체 목록의 지역 헤더가 그 값에 붙는다),
 * 새 줄을 추가하지 않고 버튼 자체 높이를 36px 로 좁게 잡는다 — filters.tsx
 * 의 칩(40px) 판단과 같은 이유로, 헤더 안에서는 그보다도 더 좁혀야 한다.
 */
const OPTIONS: [Domain, string][] = [
  ['cafe', '☕ 카페'], ['restaurant', '🍚 식당'], ['spot', '🏞️ 가볼곳'],
]

export function DomainSwitch() {
  const pathname = usePathname()
  const router = useRouter()
  const current = domainOf(pathname)

  return (
    <div className="flex shrink-0 overflow-hidden rounded-full border border-line text-[12px]">
      {OPTIONS.map(([d, label]) => (
        <button
          key={d}
          type="button"
          aria-pressed={current === d}
          onClick={() => {
            if (current !== d) router.push(switchDomainPath(pathname, d))
          }}
          className={`flex min-h-[36px] items-center px-2.5 font-semibold ${
            current === d ? 'bg-bean text-white' : 'bg-card text-ink-soft'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
