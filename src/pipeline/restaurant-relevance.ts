import type { BlogDoc } from '../sources/kakao-blog.js'

/**
 * 식당 문맥어. 상호명만으로는 부족하다 — 관련 없는 글이 잡힐 수 있다.
 */
const RESTAURANT_CONTEXT = ['맛집', '음식점', '메뉴', '식사', '먹방'] as const
// '식당' 은 뺀다 — 상호명 대부분이 이 단어를 포함해서(예: 소문난식당), 문맥어가 아니라 상호명 매칭만으로 통과된다.

/** 일반명사 상호. 걸리면 골든셋 경계 구간으로 강제 편입한다. */
const AMBIGUOUS_NAMES = new Set(['식당', '맛집', '음식점', '가든', '하우스', '식탁'])

const squeeze = (s: string) => s.replace(/\s+/g, '')

/**
 * 지점 접미사를 뗀 기본 상호와 지점 힌트.
 *
 * `서울숯불구이 강남본점` -> `서울숯불구이` + `강남`
 *
 * 공백을 **요구한다.** 없이 붙여 쓰면 `식당만점` 이 `식당` + `만` 으로
 * 갈라진다. 우리 데이터의 지점명은 카카오 표기라 항상 띄어져 있다.
 *
 * 지점 힌트가 한 글자면 지점으로 보지 않는다 — `삼거리 큰점` 같은 상호를
 * 잘못 가르는 것보다 그대로 두는 편이 안전하다.
 */
export function splitBranch(name: string): { base: string; branch: string } {
  const n = name.trim()
  const m = /^(.+?)\s+([가-힣A-Za-z0-9]{2,}?)(본점|지점|점)$/.exec(n)
  if (!m) return { base: n, branch: '' }
  return { base: m[1]!.trim(), branch: m[2]! }
}

/**
 * Layer 2 관련성 판정. 두 조건을 **모두** 요구한다.
 *   1) 제목·본문에 상호명 포함
 *   2) 식당 문맥어 하나 이상 포함
 *
 * 1번에서 **지점명을 통째로 요구하면 안 된다.** 블로거는 상호명과 지점명을
 * 함께 쓰지 않는다. 실측 기반으로 기본 상호와 지점 힌트를 둘 다 요구한다.
 */
export function isRestaurantRelevant(doc: BlogDoc, name: string): boolean {
  const hay = squeeze(`${doc.title} ${doc.contents}`)
  const needle = squeeze(name)
  if (!needle) return false
  if (!hay.includes(needle)) {
    const { base, branch } = splitBranch(name)
    if (!branch || !hay.includes(squeeze(base)) || !hay.includes(branch)) return false
  }
  return RESTAURANT_CONTEXT.some((w) => hay.includes(w))
}

export function isAmbiguousRestaurantName(name: string): boolean {
  const n = squeeze(name)
  return n.length <= 2 || AMBIGUOUS_NAMES.has(n)
}
