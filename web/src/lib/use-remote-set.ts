'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface RemoteSetState {
  ids: Set<string>
  ready: boolean
  toggle: (id: string) => void
}

/**
 * 서버에 저장되는 카페 id 집합(위시리스트·폐업 숨김 등)을 다루는 공통 훅.
 *
 * `useWishlist` 와 `useDismissed` 가 각자 이 로직을 복붙해서 갖고 있다가,
 * 초기 GET 이 늦게 끝나면 그 사이에 사용자가 누른 낙관적 업데이트를
 * 통째로 덮어써 버리는 경쟁 조건이 **둘 다에** 있었다 (실측: 리뷰에서
 * 발견). 한 곳에 모아 한 번만 고치면 둘 다 고쳐진다.
 *
 * - `touchedRef` 로 "사용자가 이미 조작했는지" 를 본다. 초기 GET 이 그 이후에
 *   끝나면 결과를 버린다 — 늦게 도착한 스냅샷이 방금 누른 것보다 오래된
 *   상태이므로 그걸로 덮어쓰면 안 된다.
 * - 실패하면 되돌린다. 안 그러면 저장이 안 됐는데 화면만 켜진 채로 남는다.
 */
export function useRemoteSet(
  apiPath: string,
  parseBody: (body: unknown) => { ok: boolean; ids: string[] },
): RemoteSetState {
  const [ids, setIds] = useState<Set<string>>(new Set())
  const idsRef = useRef<Set<string>>(new Set())
  const touchedRef = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetch(apiPath)
      .then((r) => r.json())
      .then((body: unknown) => {
        if (touchedRef.current) return
        const parsed = parseBody(body)
        if (!parsed.ok) return
        const s = new Set(parsed.ids)
        idsRef.current = s
        setIds(s)
      })
      .catch(() => {})
      .finally(() => setReady(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath])

  const toggle = useCallback((id: string) => {
    touchedRef.current = true
    const isOn = idsRef.current.has(id)
    const next = new Set(idsRef.current)
    if (isOn) next.delete(id); else next.add(id)
    idsRef.current = next
    setIds(next)

    const revert = () => {
      const reverted = new Set(idsRef.current)
      if (isOn) reverted.add(id); else reverted.delete(id)
      idsRef.current = reverted
      setIds(reverted)
    }

    fetch(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kakaoPlaceId: id, action: isOn ? 'remove' : 'add' }),
    }).then((r) => {
      if (!r.ok) revert()
    }).catch(revert)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath])

  return { ids, ready, toggle }
}
