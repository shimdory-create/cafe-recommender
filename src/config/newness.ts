/**
 * NEW 표기 — "최근에 새로 들어온 곳".
 *
 * `firstSeenAt` 을 그대로 30일 창에 넣으면 **오늘은 297곳 전부가 NEW** 다.
 * 우리가 2026-08-19~21 사흘 동안 6,218곳을 한 번에 긁었기 때문이다. 전부에
 * 붙은 배지는 아무것도 뜻하지 않는다.
 *
 * 그래서 **최초 수집분을 기준선에서 제외한다.** 이후 주간 발굴 잡이 물어온
 * 곳만 NEW 가 된다. 착수 시점(2026-08-24)에는 0곳이고, 그것이 정직한 상태다.
 *
 * 주의: 이것은 "새로 문을 연 카페" 가 아니라 **"우리 목록에 새로 들어온
 * 카페"** 다. 개업일을 주는 무료 API 가 없다 — 카카오 로컬은 상호·주소·전화·
 * 좌표만 준다. 지어내는 것보다 뜻을 좁히는 편이 낫다.
 */

/** 이 날짜(포함) 이후에 처음 본 것만 NEW 후보다. 최초 대량 수집은 08-21 에 끝났다 */
export const SEED_UNTIL = '2026-08-22'

export const NEW_DAYS = 30

export function isNewCafe(firstSeenAt: string, now: Date): boolean {
  const day = firstSeenAt.slice(0, 10)
  if (day < SEED_UNTIL) return false
  const age = (now.getTime() - new Date(day).getTime()) / 86_400_000
  return age >= 0 && age <= NEW_DAYS
}
