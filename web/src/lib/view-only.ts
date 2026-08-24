/**
 * 열람 전용 배포.
 *
 * 같은 저장소를 Vercel 프로젝트 두 개로 띄운다. 하나는 가족용(쓰기 가능),
 * 하나는 동료에게 주는 열람용이다.
 *
 * **막는 쪽이 기본값이다.** 처음에는 열람용에 환경변수를 넣어 막으려 했는데,
 * 그 변수를 빠뜨리면 조용히 쓰기가 열린다 — 실패했을 때 위험한 쪽으로
 * 넘어지는 설계다. 그래서 뒤집었다: **가족용 주소가 아니면 쓸 수 없다.**
 *
 * 세 겹이다.
 *   1. 화면   `NEXT_PUBLIC_VIEW_ONLY` (next.config 가 프로젝트 이름으로 판단)
 *   2. 서버   요청의 host 가 가족용이 아니면 403 — **이것이 실제 방어선**
 *   3. 저장소 열람용에 읽기 전용 토큰을 주거나, 아예 안 준다 (선택)
 *
 * 1번만 두면 개발자도구로 뚫린다. 2번은 클라이언트가 건드릴 수 없다.
 */

/** 가족용 Vercel 프로젝트 이름. 이 이름으로 시작하는 주소만 쓸 수 있다 */
const FAMILY_PROJECT = 'cafe-recommender'

/**
 * 이 host 에서 쓰기를 허용하는가.
 *
 * 알 수 없는 host 는 **거절**한다. 새로 띄운 배포가 기본적으로 열람 전용이
 * 되므로, 열람용 프로젝트 이름을 무엇으로 짓든 안전하다.
 */
export function hostCanWrite(host: string | null): boolean {
  if (!host) return false
  const name = host.split(':')[0]!.toLowerCase()
  if (name === 'localhost' || name === '127.0.0.1') return true
  return name.startsWith(FAMILY_PROJECT)
}

/**
 * 화면이 입력칸을 감출지. 빌드 시점에 값이 박히므로 첫 렌더부터 맞다.
 *
 * 이름을 잘못 지어 이 값이 `false` 로 남아도 서버가 막는다 — 버튼이 보였다가
 * 눌렀을 때 실패할 뿐이고, 그 상태는 API 응답의 `writable` 로 화면이 다시
 * 바로잡는다.
 */
export const VIEW_ONLY = process.env.NEXT_PUBLIC_VIEW_ONLY === '1'

export const VIEW_ONLY_NOTE = '열람 전용 페이지예요. 별점·다녀왔어요는 가족 화면에서만 남길 수 있어요.'
