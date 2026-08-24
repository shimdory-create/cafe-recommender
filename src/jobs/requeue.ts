import { passesLayer2 } from '../pipeline/buzz.js'
import { splitBranch } from '../pipeline/relevance.js'
import type { BuzzSnapshot, Cafe } from '../schema.js'

/**
 * 컷이 바뀌었을 때 **이미 배제된 카페를 다시 줄에 세운다.**
 *
 * 배제는 `excluded_auto` 로 굳는다. 그래서 화제량 컷을 거리별로 낮춰도
 * 이미 잘려 나간 곳은 그대로 남는다 — 새 규칙은 앞으로 들어올 카페에만
 * 적용되고, 정작 고치려던 대상(송도·영종 같은 집 근처)은 배제 상태에
 * 머문다.
 *
 * **화제량 사유로 배제된 것만** 되돌린다. 정밀도·프랜차이즈·업종 사유는
 * 규칙이 바뀌지 않았으므로 손대지 않는다.
 */

/**
 * Layer 2 가 붙이는 배제 사유. 컷이나 판정 규칙이 바뀌면 다시 봐야 한다.
 *
 *   `월 3.2건 < 8건`     화제량 컷 (거리별로 바뀜)
 *   `정밀도 8% < 30%`    관련성 판정 (지점명 처리가 바뀜)
 *
 * 프랜차이즈·업종·주차 사유는 규칙이 그대로이므로 건드리지 않는다.
 */
const LAYER2_REASON = /^(월 [\d.]+건 < [\d.]+건|정밀도 \d+% < \d+%)$/

export function isBuzzExcluded(c: Cafe): boolean {
  return c.status === 'excluded_auto' && LAYER2_REASON.test(c.excludeReason ?? '')
}

const driveOf = (c: Cafe): number =>
  c.driveMinutes ?? c.driveMinutesEst ?? Number.POSITIVE_INFINITY

/**
 * 지금 규칙이면 통과했을 카페를 고른다.
 *
 * 순수 함수다 — 무엇이 되돌아가는지 먼저 보고 나서 쓸 수 있어야 한다
 * (`npm run requeue -- --dry`).
 */
export function requeueTargets(
  cafes: Cafe[],
  buzz: BuzzSnapshot[],
  now: Date,
): Cafe[] {
  const latest = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latest.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latest.set(b.kakaoPlaceId, b)
  }
  return cafes.filter((c) => {
    if (!isBuzzExcluded(c)) return false
    const b = latest.get(c.kakaoPlaceId)
    if (!b) return false
    /*
     * 지점명이 붙은 카페는 **저장된 값으로 판단하면 안 된다.**
     *
     * 관련성 규칙이 바뀌면 정밀도도 화제량도 달라진다. 저장된 값은 옛 규칙으로
     * 잰 것이라, 그걸로 "지금도 탈락" 이라고 판단하면 영원히 못 돌아온다 —
     * `포레스트아웃팅스 송도점` 이 그랬다 (옛 값 월 2.4건, 다시 재니 통과).
     *
     * 그래서 지점 카페는 조건 없이 줄에 세우고 buzz 잡이 다시 재게 한다.
     * 지점명 없는 카페는 규칙이 그대로이므로 저장된 값으로 판단해도 된다 —
     * 전부 되돌리면 1,550곳이 되는데 대부분 다시 재도 같은 값이 나온다.
     */
    if (splitBranch(c.name).branch !== '') return true
    if ((c.excludeReason ?? '').startsWith('정밀도')) return false
    return passesLayer2(b, { now, driveMinutes: driveOf(c) }).pass
  })
}

/** 되돌린다. 배열을 그 자리에서 고치고 바뀐 수를 준다 */
export function applyRequeue(targets: Cafe[]): number {
  for (const c of targets) {
    c.status = 'pending_extraction'
    c.excludeReason = null
  }
  return targets.length
}
