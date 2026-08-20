import type { SitePayload } from '../schema.js'

/** 카카오톡 "나에게 보내기" 텍스트 템플릿 상한 (스펙 10.2) */
export const KAKAO_TEXT_LIMIT = 200

export interface NotifyInput {
  payload: SitePayload
  /** 배포된 웹앱 주소. 없으면 링크 줄을 뺀다 */
  baseUrl?: string
  /** 접근 코드가 있으면 링크에 붙여 한 번에 통과시킨다 */
  accessCode?: string
}

/** 카톡에 이름을 적는 수. 추천은 10곳이지만 200자에 다 들어가지 않는다 */
const NAMED_IN_MESSAGE = 3

/**
 * 금요일 정오 카카오톡 문구를 만든다 (스펙 10.2 Phase 1).
 *
 * 200자 제한이 하드 제약이다. 넘치면 잘리므로 **줄여서라도 링크는 살린다** —
 * 이 메시지의 목적은 정보 전달이 아니라 앱을 열게 하는 것이다. 그래서
 * 추천이 10곳이어도 이름은 3곳만 적고 나머지는 개수로 알린다.
 */
export function buildNotifyText(input: NotifyInput): string {
  const { payload, baseUrl, accessCode } = input
  const byId = new Map(payload.cafes.map((c) => [c.id, c]))

  const all = payload.week
    .map((w) => byId.get(w.id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
  const picks = all.slice(0, NAMED_IN_MESSAGE)
  const more = all.length - picks.length

  const link = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}${accessCode ? `/?code=${encodeURIComponent(accessCode)}` : ''}`
    : ''

  const head = '[이번 주 추천 카페]'
  const moreLine = more > 0 ? `\n… 외 ${more}곳` : ''
  const tail = link ? `${moreLine}\n자세히 → ${link}` : moreLine

  if (picks.length === 0) {
    return `${head}\n\n이번 주는 새로 추천할 곳이 없어요.${tail}`
  }

  // 긴 형태부터 시도해 200자에 들어가는 가장 자세한 것을 쓴다
  const forms: ((i: number, c: (typeof picks)[number]) => string)[] = [
    (i, c) => `${i + 1}. ${c.name} (${c.sigungu} ${c.driveMinutes ?? '?'}분)\n   ${c.tags.slice(0, 2).join('·')}`,
    (i, c) => `${i + 1}. ${c.name} (${c.sigungu} ${c.driveMinutes ?? '?'}분)`,
    (i, c) => `${i + 1}. ${c.name} (${c.sigungu})`,
    (i, c) => `${i + 1}. ${c.name}`,
  ]

  for (const form of forms) {
    const body = picks.map((c, i) => form(i, c)).join('\n')
    const text = `${head}\n\n${body}\n${tail}`.trimEnd()
    if (text.length <= KAKAO_TEXT_LIMIT) return text
  }

  // 마지막 수단 — 상호만 이어 붙이고 링크를 지킨다
  const names = picks.map((c) => c.name).join(', ')
  const bare = `${head}\n${names}${tail}`
  return bare.length <= KAKAO_TEXT_LIMIT
    ? bare
    : `${head}${tail}`
}
