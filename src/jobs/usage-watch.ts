import type { BuzzSnapshot, Cafe, Health } from '../schema.js'

/**
 * 사용량 이상 감시.
 *
 * API 키가 대화 기록에 노출된 상태를 사용자가 **알고서** 유지하기로 했다
 * (교체 대신 감시). 무료 키라 청구는 발생하지 않으므로 실제 피해는 하나뿐이다 —
 * **남이 우리 일일 쿼터를 쓰면 수집·판정이 조용히 멈춘다.**
 *
 * 그래서 "누가 썼나" 를 보지 않는다 (무료 티어는 사용량 API 가 없다).
 * 대신 **증상**을 본다: 어제까지 되던 일이 오늘 안 되면 알린다.
 *
 * 임계값은 오탐이 나지 않는 쪽으로 잡았다. 이 감시가 늑대를 두 번 외치면
 * 세 번째부터는 아무도 보지 않는다.
 */

export type Level = 'alert' | 'warn'

export interface Anomaly {
  level: Level
  code: string
  message: string
}

export interface WatchInput {
  cafes: Cafe[]
  buzz: BuzzSnapshot[]
  health: Health[]
  now: Date
}

/** 매일 도는 소스: 하루 반이 지나도 성공이 없으면 뭔가 멈춘 것이다 */
const DAILY_SOURCES = ['kakao-blog', 'classify'] as const
const DAILY_STALE_HOURS = 36
/** 주 1회 도는 소스 */
const WEEKLY_SOURCES = ['kakao-local', 'kakao-directions'] as const
const WEEKLY_STALE_HOURS = 24 * 9

/** 쿼터 소진을 가리키는 문구. provider 마다 다르게 말한다 */
const QUOTA_HINTS = ['429', 'quota', 'RESOURCE_EXHAUSTED', 'rate limit', 'too many requests']

/** 화제량 측정이 오늘 몇 %나 됐는지. 이 밑이면 알린다 */
const BUZZ_TODAY_MIN_RATIO = 0.8
/** 판정 대기가 남아 있는데 오늘 이만큼도 못 했으면 경고 */
const CLASSIFY_WARN_BELOW = 50

const hoursBetween = (a: Date, b: Date): number =>
  Math.abs(a.getTime() - b.getTime()) / 3_600_000

const dayOf = (iso: string): string => iso.slice(0, 10)

function isQuotaError(message: string): boolean {
  const lower = message.toLowerCase()
  return QUOTA_HINTS.some((h) => lower.includes(h.toLowerCase()))
}

/**
 * 순수 함수. 파일도 시계도 읽지 않는다 (`now` 는 인자).
 * 이상이 없으면 빈 배열이다.
 */
export function detectAnomalies(input: WatchInput): Anomaly[] {
  const { cafes, buzz, health, now } = input
  const out: Anomaly[] = []
  const today = dayOf(now.toISOString())

  // 1. 쿼터 소진 — 키가 새어 남이 쓰고 있을 때 가장 먼저 여기 걸린다
  for (const h of health) {
    if (h.lastError && isQuotaError(h.lastError)) {
      out.push({
        level: 'alert',
        code: 'quota_error',
        message:
          `${h.source} 가 쿼터 오류를 냈다 (연속 ${h.consecutiveFailures}회).`
          + ` 남이 우리 키를 쓰고 있을 수 있다 — 키 교체를 검토한다. [${h.lastError.slice(0, 120)}]`,
      })
    }
  }

  // 2. 소스 실패 — 쿼터가 아니어도 연속 실패는 알린다
  for (const h of health) {
    if (h.consecutiveFailures > 0 && !(h.lastError && isQuotaError(h.lastError))) {
      out.push({
        level: h.consecutiveFailures >= 3 ? 'alert' : 'warn',
        code: 'source_failing',
        message:
          `${h.source} 연속 실패 ${h.consecutiveFailures}회`
          + `: ${(h.lastError ?? '사유 없음').slice(0, 120)}`,
      })
    }
  }

  // 3. 소스가 오래 조용하다 — 실패도 없이 아예 돌지 않은 경우 (크론·워크플로 고장)
  const staleOf = (source: string) =>
    (DAILY_SOURCES as readonly string[]).includes(source)
      ? DAILY_STALE_HOURS
      : (WEEKLY_SOURCES as readonly string[]).includes(source)
        ? WEEKLY_STALE_HOURS
        : null
  for (const h of health) {
    const limit = staleOf(h.source)
    if (limit === null) continue
    if (!h.lastSuccessAt) continue // 한 번도 안 돈 소스는 판단하지 않는다
    const hours = hoursBetween(now, new Date(h.lastSuccessAt))
    if (hours > limit) {
      out.push({
        level: 'alert',
        code: 'source_stale',
        message:
          `${h.source} 가 ${Math.floor(hours)}시간 동안 성공하지 못했다`
          + ` (기준 ${limit}시간). 워크플로가 도는지 확인한다.`,
      })
    }
  }

  // 4. 화제량 측정이 급감 — 카카오 쿼터를 남이 쓰면 여기 나타난다.
  //    buzz.json 은 카페별 최신 1건만 보관하므로 "오늘 날짜 비율" 이 곧 오늘 성공률이다.
  if (buzz.length >= 100) {
    const todayCount = buzz.filter((b) => b.capturedAt === today).length
    const ratio = todayCount / buzz.length
    if (ratio < BUZZ_TODAY_MIN_RATIO) {
      out.push({
        level: 'alert',
        code: 'buzz_drop',
        message:
          `화제량 측정이 오늘 ${todayCount}/${buzz.length}곳`
          + ` (${Math.round(ratio * 100)}%) 뿐이다. 카카오 쿼터나 수집 잡을 확인한다.`,
      })
    }
  }

  // 5. 판정 정체 — Gemini 쿼터를 남이 쓰면 여기 나타난다
  const pending = cafes.filter((c) => c.status === 'pending_extraction').length
  if (pending > 0) {
    const extractedToday = cafes.filter(
      (c) => c.attributes && dayOf(c.attributes.extractedAt) === today,
    ).length
    if (extractedToday === 0) {
      out.push({
        level: 'alert',
        code: 'classify_stalled',
        message: `판정 대기 ${pending}곳이 남았는데 오늘 판정이 0곳이다.`,
      })
    } else if (extractedToday < CLASSIFY_WARN_BELOW) {
      out.push({
        level: 'warn',
        code: 'classify_slow',
        message:
          `오늘 판정 ${extractedToday}곳 (하루 목표 200곳).`
          + ` 쿼터가 일찍 끊겼을 수 있다.`,
      })
    }
  }

  return out
}

/** 사람이 읽는 요약. 이상이 없으면 그것도 말한다 — 조용한 성공은 신뢰를 못 준다 */
export function formatWatch(anomalies: Anomaly[], input: WatchInput): string {
  const today = dayOf(input.now.toISOString())
  const active = input.cafes.filter((c) => c.status === 'active').length
  const pending = input.cafes.filter((c) => c.status === 'pending_extraction').length
  const buzzToday = input.buzz.filter((b) => b.capturedAt === today).length
  const classifiedToday = input.cafes.filter(
    (c) => c.attributes && dayOf(c.attributes.extractedAt) === today,
  ).length

  const lines = [
    `사용량 점검 ${today}`,
    `  화제량 측정 오늘 ${buzzToday}/${input.buzz.length}곳`,
    `  판정 오늘 ${classifiedToday}곳 · 대기 ${pending}곳 · 통과 ${active}곳`,
  ]

  if (anomalies.length === 0) {
    lines.push('  이상 없음')
    return lines.join('\n')
  }

  for (const a of anomalies) {
    lines.push(`  [${a.level === 'alert' ? '!' : '~'}] ${a.code}: ${a.message}`)
  }
  return lines.join('\n')
}
