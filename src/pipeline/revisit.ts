/**
 * 다녀온 곳을 언제까지 추천에서 내릴지 (스펙 8.2).
 *
 * 같은 규칙이 세 곳에서 필요하다 — 페이로드의 이번 주 목록, 카카오톡 문구,
 * 웹 화면. 셋이 어긋나면 **카톡에는 있는데 눌러 들어가면 없는** 상태가
 * 된다 (2026-08-24 에 실제로 그랬다).
 *
 * 웹(`web/src/lib/site.ts`)은 경계 밖이라 같은 값을 한 번 더 적는다.
 * 그쪽이 어긋나면 웹 테스트가 잡는다.
 */

export const REVISIT_DAYS = 180

/** 아직 추천에 올려도 되는가. 안 갔거나 6개월이 지났으면 그렇다 */
export function isRevisitReady(visitedOn: string | null | undefined, now: Date): boolean {
  if (!visitedOn) return true
  const days = (now.getTime() - new Date(visitedOn).getTime()) / 86_400_000
  // 미래 날짜(시계 어긋남)는 "안 간 것" 으로 본다 — 조용히 목록에서 빼지 않는다
  return days < 0 || days > REVISIT_DAYS
}
