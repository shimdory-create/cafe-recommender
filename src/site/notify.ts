import type { SitePayload } from '../schema.js'

/** 카카오톡 "나에게 보내기" 텍스트 템플릿 상한 (스펙 10.2) */
export const KAKAO_TEXT_LIMIT = 200

/** 다녀온 곳은 이 기간 동안 추천에서 내려간다 (스펙 8.2). 화면과 같은 값 */
const REVISIT_DAYS = 180

/**
 * 이 주 목록은 목요일 밤에 굳는다. 그 뒤 금요일 정오까지 사이에 다녀오면
 * **화면에서는 사라지는데 카톡에는 남아 있었다** — 화면은 `homeFeed` 가
 * 걸러내지만 문구는 `payload.week` 를 그대로 썼다.
 *
 * 실측: 2026-08-24 문구 3번이 `더티트렁크` 였는데 08-21 에 다녀온 곳이다.
 */
function stillWorthGoing(visitedOn: string | null, now: Date): boolean {
  if (!visitedOn) return true
  const days = (now.getTime() - new Date(visitedOn).getTime()) / 86_400_000
  return days < 0 || days > REVISIT_DAYS
}

export interface NotifyInput {
  payload: SitePayload
  /** 배포된 웹앱 주소. 없으면 링크 줄을 뺀다 */
  baseUrl?: string
  /**
   * 자동 수집 상태 한 줄. 사용자 요청이다 — "정상으로 작동되는지는 카카오톡
   * 메시지로 보낼 때 이상 없음을 같이 보내줘".
   *
   * 매주 눈으로 확인하는 것이 메일 알림보다 확실하다: 메일은 안 오면 알 수
   * 없지만(알림 자체가 죽어도 조용하다), 이 줄은 **없으면 이상하다**.
   */
  status?: string
  /** 다녀온 곳을 걸러내는 기준 시각 */
  now?: Date
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
  const { payload, baseUrl } = input
  const byId = new Map(payload.cafes.map((c) => [c.id, c]))

  const now = input.now ?? new Date()
  const all = payload.week
    .map((w) => byId.get(w.id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .filter((c) => stillWorthGoing(c.visitedOn, now))
  const picks = all.slice(0, NAMED_IN_MESSAGE)
  const more = all.length - picks.length

  const link = baseUrl ? baseUrl.replace(/\/$/, '') : ''

  // 이름을 앞에 둔다 — 카톡 목록에서 무엇인지 바로 보인다.
  // 200자를 넘기면 아래 ladder 가 카페 설명부터 줄인다.
  const head = '[심김 빵지순례 · 이번 주]'
  const moreLine = more > 0 ? `\n… 외 ${more}곳` : ''
  const statusLine = input.status ? `\n${input.status}` : ''
  const tail = (link ? `${moreLine}\n자세히 → ${link}` : moreLine) + statusLine

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
