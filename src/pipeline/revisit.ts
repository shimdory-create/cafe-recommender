/**
 * 다녀온 곳은 추천에서 영구히 뺀다 (스펙 8.2, 2026-09-25 개정).
 *
 * 예전엔 180일이 지나면 다시 후보에 올렸다. "또 거기?" 보다 새로운 곳을
 * 원한다는 피드백으로 기간 없이, 한 번 다녀오면 계속 뺀다.
 *
 * 같은 규칙이 세 곳에서 필요하다 — 페이로드의 이번 주 목록, 카카오톡 문구,
 * 웹 화면. 셋이 어긋나면 **카톡에는 있는데 눌러 들어가면 없는** 상태가
 * 된다 (2026-08-24 에 실제로 그랬다).
 *
 * 웹(`web/src/lib/site.ts`)은 경계 밖이라 같은 규칙을 한 번 더 적는다.
 * 그쪽이 어긋나면 웹 테스트가 잡는다.
 */
export function isRevisitReady(visitedOn: string | null | undefined, now: Date): boolean {
  if (!visitedOn) return true
  const days = (now.getTime() - new Date(visitedOn).getTime()) / 86_400_000
  // 미래 날짜(시계 어긋남)는 "안 간 것" 으로 본다 — 조용히 목록에서 빼지 않는다
  return days < 0
}
