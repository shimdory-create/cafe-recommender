'use client'

import { useRemoteSet } from './use-remote-set'
import type { BlacklistRow } from './reviews'

export interface BlacklistState {
  blacklisted: Set<string>
  ready: boolean
  toggle: (spotId: string) => void
}

export function useSpotBlacklist(): BlacklistState {
  const { ids, ready, toggle } = useRemoteSet(
    '/api/spot/blacklist',
    (body) => {
      const b = body as { blacklist?: BlacklistRow[]; ok?: boolean }
      return { ok: b.ok === true, ids: (b.blacklist ?? []).map((w) => w.kakaoPlaceId) }
    },
  )
  return { blacklisted: ids, ready, toggle }
}
