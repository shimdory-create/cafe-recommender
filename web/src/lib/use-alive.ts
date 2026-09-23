'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isConfirmedAlive, type AliveRow } from './reviews'

export interface AliveState {
  /** 확인했고 유예 기간이 안 지난 id들 — 폐업 의심 목록에서 뺄 때 쓴다 */
  aliveIds: Set<string>
  ready: boolean
  confirm: (kakaoPlaceId: string) => void
}

/**
 * `useRemoteSet`(위시리스트·숨기기)과 같은 경쟁 조건 방지 패턴을 쓰지만,
 * id만 있는 `Set<string>` 대신 `confirmedAt`이 필요해서 별도로 뺐다 —
 * 유예 기간이 지났는지 판단하려면 확인 시각이 있어야 한다.
 */
export function useAliveConfirmed(apiPath: string): AliveState {
  const [rows, setRows] = useState<AliveRow[]>([])
  const rowsRef = useRef<AliveRow[]>([])
  const touchedRef = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetch(apiPath)
      .then((r) => r.json())
      .then((body: unknown) => {
        if (touchedRef.current) return
        const b = body as { alive?: AliveRow[]; ok?: boolean }
        if (b.ok !== true) return
        const next = b.alive ?? []
        rowsRef.current = next
        setRows(next)
      })
      .catch(() => {})
      .finally(() => setReady(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath])

  const confirm = useCallback((kakaoPlaceId: string) => {
    touchedRef.current = true
    const confirmedAt = new Date().toISOString()
    const prev = rowsRef.current
    const next = [...prev.filter((r) => r.kakaoPlaceId !== kakaoPlaceId), { kakaoPlaceId, confirmedAt }]
    rowsRef.current = next
    setRows(next)

    const revert = () => {
      rowsRef.current = prev
      setRows(prev)
    }

    fetch(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kakaoPlaceId, action: 'add' }),
    }).then((r) => {
      if (!r.ok) revert()
    }).catch(revert)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath])

  const aliveIds = useMemo(() => {
    const now = new Date()
    return new Set(rows.filter((r) => isConfirmedAlive(rows, r.kakaoPlaceId, now)).map((r) => r.kakaoPlaceId))
  }, [rows])

  return { aliveIds, ready, confirm }
}
