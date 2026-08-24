'use client'

import { useId } from 'react'
import { AREA_CHIPS_COLLAPSED, type AreaCount } from '@/lib/filter'

/**
 * 목록 위에 얹는 조작들. 전체 탭과 다녀온 곳 탭이 같은 것을 쓴다.
 *
 * 칩은 **줄바꿈**으로 놓는다. 가로 스크롤을 쓰면 body 가 가로로 밀려
 * 모바일에서 화면 전체가 흔들린다 (스펙 10.1). 대신 지역 칩은 29~32개라
 * 접어 둔다.
 */

const CHIP_BASE = 'min-h-[36px] rounded-full border px-3 text-[13px] transition-colors'
const CHIP_ON = 'border-bean bg-bean text-white font-semibold'
const CHIP_OFF = 'border-line bg-card text-ink-soft'

export function Chip({
  on, count, onClick, disabled, children, tone,
}: {
  on: boolean
  count?: number
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  /** 'new' 는 NEW 칩. 눈에 띄어야 하므로 색을 다르게 준다 */
  tone?: 'new'
}) {
  const off = tone === 'new' && !on
    ? 'border-bean/45 bg-bean-soft text-bean font-semibold'
    : CHIP_OFF
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      disabled={disabled}
      className={`${CHIP_BASE} disabled:opacity-35 ${on ? CHIP_ON : off}`}
    >
      {children}
      {count !== undefined && (
        <span className={`ml-1 text-[12px] ${on ? 'text-white/80' : 'opacity-70'}`}>{count}</span>
      )}
    </button>
  )
}

/**
 * 업소명 검색.
 *
 * 한 글자도 검색된다 — `콩`, `숲` 처럼 한 글자 상호가 실제로 있다. 그래서
 * 최소 길이를 두지 않고, 대신 결과 수를 옆에 붙여 "너무 많다" 를 스스로
 * 알게 한다.
 */
export function SearchBox({
  value, onChange, placeholder = '업소명 검색',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.6-3.6" />
        </svg>
      </span>
      <input
        id={id}
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[44px] w-full rounded-full border border-line bg-card pl-10 pr-10 text-[15px] outline-none focus:border-bean"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="검색어 지우기"
          className="absolute right-1 top-1/2 flex h-11 w-9 -translate-y-1/2 items-center justify-center text-[18px] text-ink-soft"
        >
          ×
        </button>
      )}
    </div>
  )
}

/**
 * 지역 칩 (시 단위).
 *
 * 32개를 다 펴면 모바일에서 일곱 줄을 먹는다. 가까운 여덟 곳만 두고 나머지는
 * 접는다 — 우리가 실제로 가는 곳은 앞쪽에 몰려 있고, 먼 곳을 찾을 때는
 * 대개 이름을 알고 있어 검색이 더 빠르다.
 */
export function AreaChips({
  counts, value, onChange, expanded, onExpand, leading,
}: {
  counts: AreaCount[]
  value: string | null
  onChange: (area: string | null) => void
  expanded: boolean
  onExpand: (v: boolean) => void
  /** NEW 칩처럼 앞에 붙일 것 */
  leading?: React.ReactNode
}) {
  // 고른 지역이 접힌 구간에 있으면 그것만 끌어올린다 — 고른 칩이 안 보이면
  // 무엇으로 걸러진 목록인지 알 수 없다
  const head = counts.slice(0, AREA_CHIPS_COLLAPSED)
  const tail = counts.slice(AREA_CHIPS_COLLAPSED)
  const pinned = !expanded && value && tail.some((a) => a.area === value)
    ? tail.filter((a) => a.area === value)
    : []
  const shown = expanded ? counts : [...head, ...pinned]
  const hiddenCount = counts.length - shown.length

  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip on={value === null} onClick={() => onChange(null)}>전체</Chip>
      {leading}
      {shown.map((a) => (
        <Chip
          key={a.area}
          on={value === a.area}
          count={a.count}
          onClick={() => onChange(value === a.area ? null : a.area)}
        >
          {a.label}
        </Chip>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => onExpand(true)}
          className={`${CHIP_BASE} border-dashed border-line bg-card text-ink-soft`}
        >
          ＋{hiddenCount}개 더
        </button>
      )}
      {expanded && counts.length > AREA_CHIPS_COLLAPSED && (
        <button
          type="button"
          onClick={() => onExpand(false)}
          className="min-h-[36px] rounded-full px-3 text-[13px] text-ink-soft underline"
        >
          접기
        </button>
      )}
    </div>
  )
}
