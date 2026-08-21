/**
 * 페이지 나누기. **서버 컴포넌트도 쓰므로 클라이언트 모듈에 두지 않는다.**
 *
 * 원래 `PAGE_SIZE` 가 `home-feed.tsx`('use client')에 있었고 홈 페이지(서버
 * 컴포넌트)가 그것을 import 했다. 서버가 클라이언트 모듈의 값을 가져오면
 * 실제 숫자가 아니라 **클라이언트 참조 프록시**가 온다. 그래서 화면 하단에
 * `NaN곳씩 추렸어요` 가 떴다 (`Math.min(undefined, n)`).
 *
 * 경계를 넘는 값은 어느 쪽에도 속하지 않는 파일에 둔다.
 */

export const PAGE_SIZE = 10

/** 페이지 번호로 잘라낸다. 순수 함수라 테스트가 된다 */
export function pageOf<T>(rows: T[], page: number, size = PAGE_SIZE): T[] {
  const start = Math.max(0, page - 1) * size
  return rows.slice(start, start + size)
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}

/** URL 의 `?p=` 를 페이지 번호로. 이상한 값은 1로 본다 */
export function pageFromParam(raw: string | null, total = Infinity): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(Math.floor(n), total)
}
