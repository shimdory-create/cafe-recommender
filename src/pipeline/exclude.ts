import type { BlacklistEntry } from '../schema.js'

export type ExcludeReason = 'franchise' | 'category' | null

/**
 * 카테고리로 배제할 테마카페·무인점 키워드.
 * 딸들이 고1·중2라 키즈카페는 이미 졸업했다 (스펙 2절).
 */
const EXCLUDED_CATEGORY_KEYWORDS = [
  '스터디', '만화', '보드', '애견', '반려', '키즈', '룸카페', '무인', '테이크아웃',
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
 * 스펙 정정: `"OO점"` 지점 접미사 규칙은 폐기했다. 테라로사 서종점·
 * 앤트러사이트 서교점처럼 우리가 가장 원하는 대형 지점을 잘라낸다.
 * 명시적 블랙리스트(data/blacklist.json)만 쓰므로 오탐이 없다.
 */
export function evaluateExclusion(
  input: { name: string; categoryName: string },
  blacklist: BlacklistEntry[],
): ExcludeReason {
  if (blacklist.some((e) => hit(input.name, e))) return 'franchise'
  if (EXCLUDED_CATEGORY_KEYWORDS.some((k) => input.categoryName.includes(k))) return 'category'
  return null
}
