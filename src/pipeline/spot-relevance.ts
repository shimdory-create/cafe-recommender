import type { BlogDoc } from '../sources/kakao-blog.js'

/**
 * 가볼 곳 문맥어. 상호명만으로는 부족하다 — 관련 없는 글이 잡힐 수 있다.
 */
const SPOT_CONTEXT = ['나들이', '가볼만한곳', '명소', '데이트', '산책', '구경'] as const

/** 일반명사 상호. 걸리면 골든셋 경계 구간으로 강제 편입한다. */
const AMBIGUOUS_NAMES = new Set([
  '공원', '전시관', '박물관', '시장', '아울렛', '테마파크',
])

const squeeze = (s: string) => s.replace(/\s+/g, '')

/**
 * 지점 접미사를 뗀 기본 상호와 지점 힌트.
 *
 * `서울전시관 강남본점` -> `서울전시관` + `강남`
 *
 * 공백을 **요구한다.** 없이 붙여 쓰면 `전시관만점` 이 `전시관` + `만` 으로
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
 *   2) 가볼 곳 문맥어 하나 이상 포함
 *
 * 1번에서 **지점명을 통째로 요구하면 안 된다.** 블로거는 상호명과 지점명을
 * 함께 쓰지 않는다. 실측 기반으로 기본 상호와 지점 힌트를 둘 다 요구한다.
 */
export function isSpotRelevant(doc: BlogDoc, name: string): boolean {
  const hay = squeeze(`${doc.title} ${doc.contents}`)
  const needle = squeeze(name)
  if (!needle) return false
  if (!hay.includes(needle)) {
    const { base, branch } = splitBranch(name)
    if (!branch || !hay.includes(squeeze(base)) || !hay.includes(branch)) return false
  }
  return SPOT_CONTEXT.some((w) => hay.includes(w))
}

export function isAmbiguousSpotName(name: string): boolean {
  const n = squeeze(name)
  return n.length <= 2 || AMBIGUOUS_NAMES.has(n)
}

/**
 * 카카오 분류가 `음식점`(카페·식당·베이커리 전부 이 아래 있다)이면 배제한다.
 *
 * 블로그 "나들이 추천" 글은 카페·식당을 코스에 자연스럽게 끼워 넣는다 —
 * 그 결과 성격 태그(자연/공원, 아이와 가기 좋은 곳 등)를 후기에서 얻어
 * Layer 5 게이트를 통과해버린다. 카카오 자체 분류는 후기 문장과 달리
 * 흔들리지 않는 사실이라 여기서 먼저 걸러낸다.
 *
 * 키즈카페(`가정,생활 > 유아 > 놀이시설 > 키즈카페`)는 이름에 "카페"가
 * 들어가지만 분류상 음식점이 아니라 여기 안 걸린다 — 실측으로 확인한
 * 정당한 가볼 곳이다.
 */
export function isFoodCategory(categoryName: string | null | undefined): boolean {
  return (categoryName ?? '').startsWith('음식점')
}
