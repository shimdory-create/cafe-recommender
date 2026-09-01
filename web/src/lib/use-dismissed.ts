'use client'

import { useRemoteSet } from './use-remote-set'
import type { DismissRow } from './reviews'

export interface DismissedState {
  dismissed: Set<string>
  ready: boolean
  dismiss: (cafeId: string) => void
}

/** 폐업 의심으로 숨긴 카페 id 목록. `useWishlist` 와 같은 공통 훅(`useRemoteSet`)을 쓴다 */
export function useDismissed(): DismissedState {
  const { ids, ready, toggle } = useRemoteSet(
    '/api/dismissed',
    (body) => {
      const b = body as { dismissed?: DismissRow[]; ok?: boolean }
      return { ok: b.ok === true, ids: (b.dismissed ?? []).map((d) => d.kakaoPlaceId) }
    },
  )
  return { dismissed: ids, ready, dismiss: toggle }
}
