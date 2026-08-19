import type { Cafe } from '../schema.js'

export type Resolved =
  | { kind: 'one'; cafe: Cafe }
  | { kind: 'many'; candidates: Cafe[] }
  | { kind: 'none' }

const squeeze = (s: string) => s.replace(/\s+/g, '')

/**
 * 부분 이름 + 선택적 지역명으로 카페를 특정한다.
 *
 * 여러 곳이 걸리면 임의로 고르지 않는다. "테라로사"만 쳤을 때 서종점과
 * 포천점 중 아무거나 고르면 방문 기록이 틀린 곳에 남는다.
 */
export function resolveCafe(cafes: Cafe[], query: string): Resolved {
  // 토큰 단위로 매칭한다. 통째로 붙여 비교하면 "양평 테라로사" 가
  // "양평군 테라로사 서종점" 에 안 걸린다 — 사람은 "양평군"이 아니라
  // "양평"이라고 친다.
  const tokens = query.trim().split(/\s+/).map(squeeze).filter(Boolean)
  if (tokens.length === 0) return { kind: 'none' }

  const hits = cafes.filter((c) => {
    const hay = squeeze(`${c.sigungu}${c.name}`)
    return tokens.every((t) => hay.includes(t))
  })
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length === 1) return { kind: 'one', cafe: hits[0]! }

  // 상호가 정확히 일치하는 곳이 하나면 그것으로 확정한다
  const q = squeeze(query)
  const exact = hits.filter((c) => squeeze(c.name) === q)
  if (exact.length === 1) return { kind: 'one', cafe: exact[0]! }

  return { kind: 'many', candidates: hits }
}

/** 여러 후보를 사람이 고를 수 있게 출력한다 */
export function printCandidates(candidates: Cafe[]): void {
  console.error('여러 곳이 걸립니다. 지역명을 붙여 주세요:')
  for (const c of candidates.slice(0, 12)) {
    console.error(`  - ${c.sigungu} ${c.name}`)
  }
  if (candidates.length > 12) console.error(`  ... 외 ${candidates.length - 12}곳`)
}
