'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WishRow } from './reviews'

export interface WishlistState {
  wished: Set<string>
  ready: boolean
  toggle: (cafeId: string) => void
}

/**
 * 위시리스트를 한 번만 읽어 여러 카드가 나눠 쓴다.
 *
 * 카드마다 각자 `/api/wishlist` 를 부르면 리스트 화면에서 요청이 카드 수만큼
 * 나간다 (`visited` 를 홈 피드 레벨에서 한 번만 읽는 것과 같은 이유,
 * `home-feed.tsx` 참고).
 */
export function useWishlist(): WishlistState {
  const [wished, setWished] = useState<Set<string>>(new Set())
  // 상태와 별도로 최신값을 동기적으로 들고 있는다. **fetch(부작용)를 setState
  // 업데이터 함수 안에 넣었다가 실측으로 걸렸다** — 리액트 개발 모드(StrictMode)가
  // 업데이터의 순수성을 확인하려고 그 함수를 두 번 부르는데, 그 안에 있던
  // fetch 도 그대로 두 번 나갔다 (한 번 눌렀는데 POST 가 두 건). 업데이터는
  // 상태 계산만 하고, 부작용은 항상 그 밖에서 ref 를 기준으로 한다.
  const wishedRef = useRef<Set<string>>(new Set())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetch('/api/wishlist')
      .then((r) => r.json())
      .then((body: { wishes?: WishRow[]; ok?: boolean }) => {
        if (body.ok !== true) return
        const s = new Set((body.wishes ?? []).map((w) => w.kakaoPlaceId))
        wishedRef.current = s
        setWished(s)
      })
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  const toggle = useCallback((cafeId: string) => {
    const isOn = wishedRef.current.has(cafeId)
    const next = new Set(wishedRef.current)
    if (isOn) next.delete(cafeId); else next.add(cafeId)
    wishedRef.current = next
    setWished(next)

    fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kakaoPlaceId: cafeId, action: isOn ? 'remove' : 'add' }),
    }).then((r) => {
      // 실패하면 되돌린다 — 하트가 눌렀는데 안 저장된 채로 남으면 다음에 열었을 때 꺼져 있다
      if (!r.ok) {
        const reverted = new Set(wishedRef.current)
        if (isOn) reverted.add(cafeId); else reverted.delete(cafeId)
        wishedRef.current = reverted
        setWished(reverted)
      }
    }).catch(() => {
      const reverted = new Set(wishedRef.current)
      if (isOn) reverted.add(cafeId); else reverted.delete(cafeId)
      wishedRef.current = reverted
      setWished(reverted)
    })
  }, [])

  return { wished, ready, toggle }
}
