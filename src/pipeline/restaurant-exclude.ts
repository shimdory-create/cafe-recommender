import type { BlacklistEntry } from '../restaurant-schema.js'

export type ExcludeReason = 'franchise' | 'category' | null

/**
 * 카테고리로 배제할 프랜차이즈·패스트푸드, 배달·포장 전용, 술집·호프, 카페 키워드.
 *
 * 카페는 별도 도메인(cuisineType 6종 중 어디에도 안 맞는다 — 브런치카페처럼
 * 식사가 되는 카페는 카페 도메인 자체가 이미 다룬다). 실측으로 "음식점 >
 * 카페" 분류 장소가 맛집 블로그(맛집 추천/베스트, 가족 외식)에 자연스럽게
 * 끼어 들어와 식당 목록에 잘못 섞인 사례가 확인됐다.
 */
const EXCLUDED_CATEGORY_KEYWORDS = [
  '패스트푸드',
  '배달전문',
  '포장전문',
  '호프',
  '요리주점',
  '술집',
  '카페',
] as const

const squeeze = (s: string) => s.replace(/\s+/g, '')

function hit(name: string, e: BlacklistEntry): boolean {
  if (e.matchType === 'regex') {
    // 손으로 편집하는 파일이므로 잘못된 정규식이 들어올 수 있다.
    // 깨진 패턴 하나가 파이프라인 전체를 멈추게 하지 않는다.
    try {
      return new RegExp(e.pattern).test(name)
    } catch {
      return false
    }
  }
  const n = squeeze(name)
  const p = squeeze(e.pattern)
  if (e.matchType === 'exact') return n === p
  return n.includes(p)
}

/**
 * Layer 1 — 규칙 기반 하드 배제. LLM 을 쓰지 않는다.
 *
 * 프랜차이즈는 블랙리스트 파일로 (data/restaurant-blacklist.json),
 * 프랜차이즈 아닌 배달·포장 전용, 술집·호프는 카테고리 키워드로 배제한다.
 */
export function evaluateRestaurantExclusion(
  input: { name: string; categoryName: string },
  blacklist: BlacklistEntry[],
): ExcludeReason {
  if (blacklist.some((e) => hit(input.name, e))) return 'franchise'
  if (EXCLUDED_CATEGORY_KEYWORDS.some((k) => input.categoryName.includes(k))) return 'category'
  return null
}
