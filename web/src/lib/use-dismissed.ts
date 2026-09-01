'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DismissRow } from './reviews'

export interface DismissedState {
  dismissed: Set<string>
  ready: boolean
  dismiss: (cafeId: string) => void
}

/** 폐업 의심으로 숨긴 카페 id 목록. `useWishlist` 와 같은 모양 (이유는 그쪽 주석 참고) */
export function useDismissed(): DismissedState {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetch('/api/dismissed')
      .then((r) => r.json())
      .then((body: { dismissed?: DismissRow[]; ok?: boolean }) => {
        if (body.ok !== true) return
        setDismissed(new Set((body.dismissed ?? []).map((d) => d.kakaoPlaceId)))
      })
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  const dismiss = useCallback((cafeId: string) => {
    setDismissed((prev) => new Set(prev).add(cafeId))
    fetch('/api/dismissed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kakaoPlaceId: cafeId, action: 'add' }),
    }).then((r) => {
      // 실패하면 되돌린다 — 안 그러면 다음 방문 때까지 목록에 계속 안 보인다
      if (!r.ok) setDismissed((cur) => {
        const reverted = new Set(cur)
        reverted.delete(cafeId)
        return reverted
      })
    }).catch(() => {
      setDismissed((cur) => {
        const reverted = new Set(cur)
        reverted.delete(cafeId)
        return reverted
      })
    })
  }, [])

  return { dismissed, ready, dismiss }
}
