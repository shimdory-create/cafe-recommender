'use client'

import { useRouter, usePathname } from 'next/navigation'
import { domainOf } from '@/lib/domain-switch'

/**
 * "← 목록" — **왔던 곳으로 돌아간다.**
 *
 * `<Link href="/list">` 였다. 그래서 이번 주 2페이지에서 카페를 열고 이 버튼을
 * 누르면 전체 탭으로 튀었다 (사용자 보고). 히스토리를 되돌리면 이번 주 2페이지든
 * 필터가 걸린 전체 목록이든 보던 화면이 그대로 복원된다.
 *
 * 카톡 링크로 상세를 직접 열었을 때는 되돌릴 히스토리가 없다. 그때만 홈으로
 * 보낸다 — 새 탭의 `history.length` 는 1 이다.
 */
export function BackLink() {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <button
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back()
        else router.push(domainOf(pathname) === 'restaurant' ? '/restaurant' : '/')
      }}
      // 터치 타겟을 44px 로 (스펙 10.1). 글자는 작지만 누르는 영역은 넓다.
      className="-ml-1 flex min-h-[44px] items-center px-1 text-[13px] text-ink-soft active:text-ink"
    >
      ← 목록
    </button>
  )
}
