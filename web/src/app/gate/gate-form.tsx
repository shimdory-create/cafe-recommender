'use client'

import { useState } from 'react'

/**
 * 코드를 쿼리스트링으로 붙여 새로 진입한다. 검증은 미들웨어가 하고
 * 통과하면 httpOnly 쿠키가 심긴다 — 여기서 코드를 저장하지 않는다.
 */
export function GateForm() {
  const [code, setCode] = useState('')
  return (
    <form
      className="mt-6 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const next = new URLSearchParams(window.location.search).get('next') || '/'
        window.location.href = `${next}?code=${encodeURIComponent(code.trim())}`
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="off"
        inputMode="text"
        placeholder="접근 코드"
        aria-label="접근 코드"
        className="min-h-[52px] rounded-2xl border border-line bg-card px-4 text-[16px] outline-none focus:border-bean"
      />
      <button
        type="submit"
        disabled={code.trim().length === 0}
        className="min-h-[52px] rounded-2xl bg-bean text-[16px] font-bold text-white disabled:opacity-40"
      >
        들어가기
      </button>
    </form>
  )
}
