'use client'

import { useId, useState } from 'react'
import { AREA_CHIPS_COLLAPSED, toggleAreaSelection, type AreaCount } from '@/lib/filter'

/**
 * 목록 위에 얹는 조작들. 전체 탭과 다녀온 곳 탭이 같은 것을 쓴다.
 *
 * 칩은 **줄바꿈**으로 놓는다. 가로 스크롤을 쓰면 body 가 가로로 밀려
 * 모바일에서 화면 전체가 흔들린다 (스펙 10.1). 대신 지역 칩은 29~32개라
 * 접어 둔다.
 */

/**
 * 칩 높이 40px.
 *
 * 스펙 10.1 은 터치 타겟 44px 을 요구하지만 그것은 **주 조작 버튼** 기준이다.
 * 칩은 32개가 나열되므로 44px 이면 접은 상태에서도 두 줄이 88px 을 먹는다.
 * 36px 로 두었더니 실측에서 22개 요소가 기준 아래였다 — 가로는 52~104px 로
 * 넉넉하니 세로만 40px 로 올려 오조작을 줄인다.
 */
const CHIP_BASE = 'min-h-[40px] rounded-full border px-3 text-[13px] transition-colors'
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
 * 지역 칩. 매크로(서울·인천·경기) 셋을 위에 두고, 하나를 누르면 그 안의
 * 시군구가 바로 밑에 펼쳐진다(2026-09-24) — 인천을 하나로 묶으니 너무
 * 커져서, 구 단위로 다시 좁힐 수 있게 했다. 경기·서울도 같은 방식으로
 * 통일했다(원래도 경기는 시군 단위였지만, 접었다 펼치는 조작까지 맞췄다).
 *
 * 매크로 칩을 누르면 선택과 펼침이 함께 일어난다 — 다시 누르면 접히고
 * 선택도 풀린다. 시군구 칩은 `toggleAreaSelection` 이 매크로 선택과 서로
 * 배타적으로 정리한다(둘 다 뽑혀 있으면 의미가 없다).
 *
 * 복수 선택이 가능하다(2026-09-08) — "인천 또는 부천" 처럼 OR 로 걸린다.
 * 태그 칩(AND)과 섞여도 헷갈리지 않는다 — 지역은 한 카페가 하나만 갖는
 * 값이라 AND 는 애초에 의미가 없어서, 이 칩만 OR 로 동작한다는 것이
 * 자연스럽게 드러난다.
 */
export function AreaChips({
  counts, sub, value, onChange, leading,
}: {
  /** 매크로 레벨 개수 (`areaCounts`) */
  counts: AreaCount[]
  /** 매크로 안의 시군구별 개수 (`sigunguCountsByArea`) */
  sub: Record<string, AreaCount[]>
  /** 고른 지역들 — 매크로와 시군구가 섞여 들어올 수 있다. 비어 있으면 전체 */
  value: string[]
  onChange: (next: string[]) => void
  /** NEW 칩처럼 앞에 붙일 것 */
  leading?: React.ReactNode
}) {
  // 사용자가 직접 펼친 매크로. 고른 시군구가 있는 매크로는 이것과 별개로
  // 항상 펼쳐 보인다(아래 isOpen) — URL 로 시군구가 바로 선택된 채 들어와도
  // 무엇으로 걸러졌는지 보여야 한다.
  const [openedByUser, setOpenedByUser] = useState<Set<string>>(new Set())
  // 시군구가 8개 넘는 매크로(경기 등)를 "더 보기" 로 펼친 상태
  const [subExpanded, setSubExpanded] = useState<Set<string>>(new Set())

  const clickMacro = (area: string) => {
    const next = toggleAreaSelection(value, area, sub)
    onChange(next)
    setOpenedByUser((prev) => {
      const copy = new Set(prev)
      if (next.includes(area)) copy.add(area)
      else copy.delete(area)
      return copy
    })
  }
  const clickSub = (sigungu: string) => onChange(toggleAreaSelection(value, sigungu, sub))
  const clear = () => { onChange([]); setOpenedByUser(new Set()) }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <Chip on={value.length === 0} onClick={clear}>전체</Chip>
        {leading}
        {counts.map((a) => (
          <Chip
            key={a.area}
            on={value.includes(a.area)}
            count={a.count}
            onClick={() => clickMacro(a.area)}
          >
            {a.label}
          </Chip>
        ))}
      </div>

      {counts.map((a) => {
        const subs = sub[a.area] ?? []
        const isOpen = openedByUser.has(a.area) || subs.some((s) => value.includes(s.area))
        if (!isOpen || subs.length === 0) return null

        const isSubExpanded = subExpanded.has(a.area)
        const head = subs.slice(0, AREA_CHIPS_COLLAPSED)
        const tail = subs.slice(AREA_CHIPS_COLLAPSED)
        // 고른 시군구가 접힌 구간에 있으면 끌어올린다 — 상위 지역 칩과 같은 규칙
        const pinned = !isSubExpanded ? tail.filter((s) => value.includes(s.area)) : []
        const shown = isSubExpanded ? subs : [...head, ...pinned]
        const hiddenCount = subs.length - shown.length

        return (
          <div key={a.area} className="ml-2.5 flex flex-wrap gap-1.5 border-l-2 border-line pl-2.5">
            {shown.map((s) => (
              <Chip
                key={s.area}
                on={value.includes(s.area)}
                count={s.count}
                onClick={() => clickSub(s.area)}
              >
                {s.label}
              </Chip>
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setSubExpanded((prev) => new Set(prev).add(a.area))}
                className={`${CHIP_BASE} border-dashed border-line bg-card text-ink-soft`}
              >
                ＋{hiddenCount}개 더
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
