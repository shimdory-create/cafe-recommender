import type { BuzzSnapshot, Cafe, Health, NotifyLog } from '../schema.js'
import { PENDING_PER_DAY } from './daily-buzz.js'

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
  /** 카카오톡 발송 기록. 없으면(첫 주) 판단하지 않는다 */
  notifyLog?: NotifyLog[]
  now: Date
}

/** 매일 도는 소스: 하루 반이 지나도 성공이 없으면 뭔가 멈춘 것이다 */
const DAILY_SOURCES = ['kakao-blog', 'classify'] as const
const DAILY_STALE_HOURS = 36
/** 주 1회 도는 소스 */
const WEEKLY_SOURCES = ['kakao-local', 'kakao-directions', 'harvest'] as const
const WEEKLY_STALE_HOURS = 24 * 9

/** 쿼터 소진을 가리키는 문구. provider 마다 다르게 말한다 */
const QUOTA_HINTS = ['429', 'quota', 'RESOURCE_EXHAUSTED', 'rate limit', 'too many requests']

/**
 * "최근" 의 폭 — 오늘과 어제(UTC)까지 인정한다.
 *
 * 같은 UTC 날짜만 인정하면 **금요일 정오 카톡이 매주 거짓 경보를 낸다.**
 * 수집은 04:17 KST = 19:17 UTC 에 돌아 그 날짜(D)를 찍는다. 카톡은 12:04 KST
 * = 03:04 UTC, 즉 D+1 에 상태를 계산하므로 "오늘 측정 0곳" 이 된다 (실측).
 *
 * 하루를 더 인정하면 수집이 완전히 멈춘 경우의 발견이 늦어질 수 있지만,
 * 그 경우는 `source_stale` 이 36시간 기준으로 먼저 잡는다 — health 는 날짜가
 * 아니라 시각을 기록하기 때문이다.
 */
const FRESH_DAYS = 1

/** active 카페 중 최근 측정된 비율. 이 밑이면 알린다 */
const BUZZ_TODAY_MIN_RATIO = 0.8
/** 오늘 측정 총량이 기대치의 이 비율보다 낮으면 수집이 죽은 것으로 본다 */
const BUZZ_THROUGHPUT_MIN_RATIO = 0.3
/** 판정 대기가 남아 있는데 오늘 이만큼도 못 했으면 경고 */
const CLASSIFY_WARN_BELOW = 50
/**
 * 카톡이 이 일수보다 오래 안 나갔으면 알린다.
 *
 * 주 1회 발송이므로 8일이면 "한 번 건너뛴 것" 이 확실하다. 발송은 이 PC 의
 * 커넥터로 나가서 클라우드가 알 수 없는데, 실제로 조용히 누락된 적이 있다
 * (2026-08-21 정오: 예약 세션이 승인 대기로 멈춤 -> 아무 신호도 없었다).
 */
const NOTIFY_STALE_DAYS = 8

const hoursBetween = (a: Date, b: Date): number =>
  Math.abs(a.getTime() - b.getTime()) / 3_600_000

const dayOf = (iso: string): string => iso.slice(0, 10)

/** 날짜 문자열(YYYY-MM-DD)이 오늘부터 `days` 일 안인가 */
function isFresh(day: string, now: Date, days = FRESH_DAYS): boolean {
  for (let i = 0; i <= days; i++) {
    const d = new Date(now.getTime() - i * 86_400_000)
    if (dayOf(d.toISOString()) === day) return true
  }
  return false
}

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

  // 1. 쿼터 소진.
  //
  //    **무료 티어에서 이것은 정상이다.** 하루 한도까지 쓰면 429 가 오고 잡은
  //    거기서 멈춘다 — 매일 일어난다. 그래서 경보로 올리지 않는다. 이걸로
  //    매일 메일을 보내면 사흘 뒤부터 아무도 열지 않는다.
  //
  //    키가 새서 남이 쓰는 경우는 **진행량 0** 으로 드러난다 (아래 5번).
  //    "429 가 왔다" 가 아니라 "한 곳도 못 했다" 가 신호다.
  for (const h of health) {
    if (h.lastError && isQuotaError(h.lastError)) {
      out.push({
        level: 'warn',
        code: 'quota_error',
        message:
          `${h.source} 가 일일 쿼터를 다 썼다 (무료 티어에서는 정상).`
          + ` 진행량이 0이면 아래 항목이 경보로 알린다.`,
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

  // 4. 화제량 측정.
  //
  //    전체 비율로 보지 않는다 — 판정 대기 카페는 **돌려가며** 재므로 (하루
  //    800곳) 전체 대비 오늘 비율은 원래 낮다. 대신 두 가지를 본다.
  //
  //    (a) active 카페는 매일 전부 재야 한다. 순위와 대표 이미지가 여기서 나온다.
  //    (b) 오늘 측정한 총량. 카카오 쿼터가 끊기면 이 숫자가 무너진다.
  const measuredToday = new Set(
    buzz.filter((b) => isFresh(b.capturedAt, now)).map((b) => b.kakaoPlaceId),
  )
  const activeCafes = cafes.filter((c) => c.status === 'active')
  if (activeCafes.length >= 20) {
    const hit = activeCafes.filter((c) => measuredToday.has(c.kakaoPlaceId)).length
    const ratio = hit / activeCafes.length
    if (ratio < BUZZ_TODAY_MIN_RATIO) {
      out.push({
        level: 'alert',
        code: 'buzz_drop',
        message:
          `추천 대상 ${activeCafes.length}곳 중 최근 측정이 ${hit}곳`
          + ` (${Math.round(ratio * 100)}%) 뿐이다. 카카오 쿼터나 수집 잡을 확인한다.`,
      })
    }
  }
  const pendingCount = cafes.filter((c) => c.status === 'pending_extraction').length
  if (pendingCount > 0 && buzz.length >= 100) {
    // 기대치: active 전부 + 회전분. 그 30% 도 못 했으면 수집이 죽은 것이다.
    const expected = activeCafes.length + Math.min(pendingCount, PENDING_PER_DAY)
    if (measuredToday.size < expected * BUZZ_THROUGHPUT_MIN_RATIO) {
      out.push({
        level: 'alert',
        code: 'buzz_throughput',
        message:
          `최근 화제량 측정 ${measuredToday.size}곳 (기대 ${expected}곳).`
          + ` 수집이 일찍 끊겼다.`,
      })
    }
  }

  // 5. 판정 정체 — Gemini 쿼터를 남이 쓰면 여기 나타난다
  const pending = cafes.filter((c) => c.status === 'pending_extraction').length
  if (pending > 0) {
    const extractedToday = cafes.filter(
      (c) => c.attributes && isFresh(dayOf(c.attributes.extractedAt), now),
    ).length
    if (extractedToday === 0) {
      out.push({
        level: 'alert',
        code: 'classify_stalled',
        message: `판정 대기 ${pending}곳이 남았는데 최근 판정이 0곳이다.`,
      })
    } else if (extractedToday < CLASSIFY_WARN_BELOW) {
      out.push({
        level: 'warn',
        code: 'classify_slow',
        message:
          `최근 판정 ${extractedToday}곳 (하루 목표 200곳).`
          + ` 쿼터가 일찍 끊겼을 수 있다.`,
      })
    }
  }

  // 6. 카톡이 지난주에 안 나갔다
  const log = input.notifyLog ?? []
  const last = log.reduce<string>((a, r) => (r.sentAt > a ? r.sentAt : a), '')
  if (last) {
    const days = hoursBetween(now, new Date(last)) / 24
    if (days > NOTIFY_STALE_DAYS) {
      out.push({
        level: 'alert',
        code: 'notify_missing',
        message:
          `카카오톡이 ${Math.floor(days)}일째 안 나갔다 (기준 ${NOTIFY_STALE_DAYS}일).`
          + ` 예약 작업이 멈췄는지 본다 — 발송은 이 PC 의 Claude Code 가 필요하다.`,
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
  const buzzToday = input.buzz.filter((b) => isFresh(b.capturedAt, input.now)).length
  const activeMeasured = (() => {
    const done = new Set(
      input.buzz.filter((b) => isFresh(b.capturedAt, input.now)).map((b) => b.kakaoPlaceId),
    )
    return input.cafes.filter((c) => c.status === 'active' && done.has(c.kakaoPlaceId)).length
  })()
  const classifiedToday = input.cafes.filter(
    (c) => c.attributes && isFresh(dayOf(c.attributes.extractedAt), input.now),
  ).length

  const lines = [
    `사용량 점검 ${today}`,
    `  화제량 측정 최근 ${buzzToday}곳 (추천 대상 ${activeMeasured}/${active}곳)`,
    `  판정 최근 ${classifiedToday}곳 · 대기 ${pending}곳 · 통과 ${active}곳`,
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

/** 이상 코드를 사람 말로. 카톡 한 줄에 들어가야 하므로 짧게 */
const LABELS: Record<string, string> = {
  quota_error: '쿼터 오류',
  source_failing: '수집 실패',
  source_stale: '수집 멈춤',
  buzz_drop: '화제량 측정 부족',
  buzz_throughput: '수집 조기 중단',
  notify_missing: '카톡 누락',
  classify_stalled: '판정 정체',
  classify_slow: '판정 지연',
}

/**
 * 카카오톡 문구 끝에 붙일 한 줄.
 *
 * 사용자 요청("이상 없음을 같이 보내줘")의 핵심은 **없으면 이상한 신호**를
 * 만드는 것이다. 메일 알림은 알림 자체가 죽으면 조용하지만, 매주 오는 이 줄은
 * 빠지면 눈에 띈다.
 */
export function statusLine(anomalies: Anomaly[]): string {
  if (anomalies.length === 0) return '자동수집 정상'
  const alerts = anomalies.filter((a) => a.level === 'alert')
  const shown = (alerts.length > 0 ? alerts : anomalies)
    .map((a) => LABELS[a.code] ?? a.code)
  const uniq = [...new Set(shown)]
  const head = uniq.slice(0, 2).join('·')
  const rest = uniq.length > 2 ? ` 외 ${uniq.length - 2}건` : ''
  return `${alerts.length > 0 ? '점검 필요' : '주의'}: ${head}${rest}`
}
