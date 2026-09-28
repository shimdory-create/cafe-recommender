const DAY = 86_400_000

/**
 * 등록(firstSeenAt) 후 이만큼 지나야 휴면 판정 대상이 된다.
 *
 * `passesLayer2`의 "신규 오픈 구제"(180일)는 **그 카페에 대한 블로그
 * 글이 처음 올라온 날** 기준이라, 우리 목록에 들어온 지 얼마 안 된
 * 곳이라도 블로그 역사가 길면 보호받지 못한다. 이 값은 반대로 **우리가
 * 이 곳을 안 지 얼마나 됐는지**를 본다 — 갓 들어온 곳이 화제량이
 * 잠깐 주춤했다고 바로 휴면으로 넘어가지 않게 하는, 별도의 보호장치다
 * (2026-09-28, "화제 식음 후보" 설계).
 */
export const DORMANT_AGE_DAYS = 180

/**
 * 화제량 기준 미달이 이만큼 연속으로 이어져야 휴면으로 넘긴다.
 *
 * 하루이틀 반짝 잠잠한 것(주간 변동, 계절적 소강)까지 잡아내면 오탈락이
 * 너무 잦다. 21일이면 daily-buzz 의 활성 회전 주기(카페 기준 하루 한
 * 바퀴, 식당은 며칠에 한 바퀴)를 여러 번 지나면서도 확인하는 기간이라,
 * 일시적 흔들림과 실제 식음을 구분할 만큼은 된다.
 */
export const QUIET_STREAK_DAYS = 21

export interface QuietStateInput {
  /** 이전에 기준 미달이 시작된 날짜(YYYY-MM-DD). 처음이면 null */
  quietSince: string | null
  firstSeenAt: string
  /** 오늘 다시 잰 화제량이 Layer2 기준을 통과했는가 */
  passesBuzz: boolean
  now: Date
  /** 오늘 날짜(YYYY-MM-DD). daily-buzz 의 capturedAt과 같은 값을 쓴다 */
  today: string
}

export interface QuietState {
  /** 다음에 저장할 quietSince 값 */
  quietSince: string | null
  /** 오늘부로 dormant 로 넘겨야 하는가 */
  shouldGoDormant: boolean
}

/**
 * 활성 카페 하나의 오늘자 화제량 재확인 결과로 휴면 여부를 정한다.
 *
 * 순수 함수다 — daily-buzz 잡이 매일 활성 카페를 재는 김에 이 판단도
 * 같이 한다(추가 API 호출 없음). 통과하면 즉시 streak 를 초기화한다 —
 * "연속" 미달이라 중간에 한 번이라도 통과하면 처음부터 다시 센다.
 */
export function nextQuietState(input: QuietStateInput): QuietState {
  const {
    quietSince, firstSeenAt, passesBuzz, now, today,
  } = input
  if (passesBuzz) return { quietSince: null, shouldGoDormant: false }

  const ageDays = (now.getTime() - new Date(firstSeenAt).getTime()) / DAY
  if (ageDays < DORMANT_AGE_DAYS) return { quietSince: null, shouldGoDormant: false }

  const since = quietSince ?? today
  const streakDays = (now.getTime() - new Date(since).getTime()) / DAY
  return { quietSince: since, shouldGoDormant: streakDays >= QUIET_STREAK_DAYS }
}
