'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/** 타자 한 글자마다 주소를 바꾸지 않는다 */
const DEBOUNCE_MS = 400

/**
 * 고른 필터를 주소창에 남긴다. 목적은 하나 — **상세에서 뒤로 왔을 때 복원.**
 *
 * `window.history.replaceState` 로 먼저 만들었는데 되지 않았다. 주소창은
 * 바뀌지만 Next 라우터가 들고 있는 항목은 그대로여서, 카페를 열었다 뒤로
 * 오면 필터 없는 `/list` 가 나왔다 (실측). 라우터를 거쳐야 라우터가 안다.
 *
 * `push` 가 아니라 `replace` 인 이유: 칩을 다섯 번 눌렀다고 뒤로가기를 다섯
 * 번 눌러야 목록을 벗어나는 것은 아무도 원하지 않는다. 고치려던 것은
 * **상세에서 돌아왔을 때** 필터가 풀리는 것이고, 그건 replace 로 된다.
 */
export function useUrlSync(query: string): void {
  const router = useRouter()
  const pathname = usePathname()
  const first = useRef(true)

  useEffect(() => {
    // 첫 렌더에서는 서버가 준 주소가 이미 맞다. 덮어쓰면 히스토리만 더럽힌다
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => {
      router.replace(`${pathname}${query}`, { scroll: false })
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, pathname, router])
}
