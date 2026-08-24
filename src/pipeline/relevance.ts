import type { BlogDoc } from '../sources/kakao-blog.js'

/**
 * 카페 문맥어. 상호명만으로는 부족하다 — "가평 수목원" 은 상호명을
 * 포함하지만 카페 글이 아니다 (실측: 정밀도 100%, 월 634건).
 */
const CAFE_CONTEXT = ['카페', '까페', '베이커리', '커피', '빵', '디저트', '브런치'] as const

/** 일반명사 상호. 걸리면 골든셋 경계 구간으로 강제 편입한다. */
const AMBIGUOUS_NAMES = new Set([
  '수목원', '식물원', '농원', '공원', '정원', '마당', '숲', '뜰',
  '언덕', '호수', '바다', '하늘', '카페', '커피', '베이커리',
])

const squeeze = (s: string) => s.replace(/\s+/g, '')

/**
 * 지점 접미사를 뗀 기본 상호와 지점 힌트.
 *
 * `포레스트아웃팅스 일산본점` -> `포레스트아웃팅스` + `일산`
 *
 * 공백을 **요구한다.** 없이 붙여 쓰면 `카페만점` 이 `카페` + `만` 으로
 * 갈라진다. 우리 데이터의 지점명은 카카오 표기라 항상 띄어져 있다.
 *
 * 지점 힌트가 한 글자면 지점으로 보지 않는다 — `삼거리 큰점` 같은 상호를
 * 잘못 가르는 것보다 그대로 두는 편이 안전하다.
 */
export function splitBranch(cafeName: string): { base: string; branch: string } {
  const name = cafeName.trim()
  const m = /^(.+?)\s+([가-힣A-Za-z0-9]{2,}?)(본점|지점|점)$/.exec(name)
  if (!m) return { base: name, branch: '' }
  return { base: m[1]!.trim(), branch: m[2]! }
}

/**
 * Layer 2 관련성 판정. 두 조건을 **모두** 요구한다 (Global Constraints).
 *   1) 제목·본문에 상호명 포함
 *   2) 카페 문맥어 하나 이상 포함
 *
 * 1번에서 **지점명을 통째로 요구하면 안 된다.** 블로거는 `포레스트아웃팅스
 * 일산본점` 이라고 쓰지 않는다 — `일산 포레스트아웃팅스`, `포레스트아웃팅스
 * 본점` 이라고 쓴다. 실측 (2026-08-25, 받은 글 50건 기준):
 *
 * ```
 * 상호 전체 요구      4건 -> 정밀도 8%  -> 탈락
 * 기본상호 + 지점 힌트 11건 -> 통과
 * ```
 *
 * 그래서 **기본 상호와 지점 힌트를 둘 다** 요구한다. 지점 힌트가 있어야
 * 용인점 글이 송도점에 잡히지 않는다 — 기본 상호만 보면 브랜드 전체 글이
 * 모든 지점에 중복으로 잡혀 화제량이 부풀려진다 (`포레스트아웃팅스` 만으로는
 * 46/50건).
 */
export function isRelevant(doc: BlogDoc, cafeName: string): boolean {
  const hay = squeeze(`${doc.title} ${doc.contents}`)
  const needle = squeeze(cafeName)
  if (!needle) return false
  if (!hay.includes(needle)) {
    const { base, branch } = splitBranch(cafeName)
    if (!branch || !hay.includes(squeeze(base)) || !hay.includes(branch)) return false
  }
  return CAFE_CONTEXT.some((w) => hay.includes(w))
}

export function isAmbiguousName(name: string): boolean {
  const n = squeeze(name)
  return n.length <= 2 || AMBIGUOUS_NAMES.has(n)
}
