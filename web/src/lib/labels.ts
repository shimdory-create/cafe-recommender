/**
 * 카페·식당 어느 쪽 payload 도 참조하지 않는 순수 포맷 함수. site.ts 에
 * 원래 있었는데, 그 파일이 모듈 스코프에서 카페 site.json 전체를 평가하는
 * 바람에 이 함수 두 개만 쓰려는 식당 쪽까지 카페 페이로드(2MB+)를 끌고
 * 들어갔다 (실측: /restaurant 번들에 카페 전용 필드 stayDuration 포함).
 */
export function driveLabel(min: number | null): string {
  if (min === null) return '거리 미확인'
  if (min < 60) return `차로 ${min}분`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `차로 ${h}시간` : `차로 ${h}시간 ${m}분`
}

/**
 * 목록에 들어온 날짜. "2026/8/25 추가" 형태 — 최신순 정렬의 기준을 눈으로도
 * 보이게 한다. 계속 운영할 서비스라 연도가 없으면 해가 바뀐 뒤 헷갈린다.
 */
export function addedLabel(firstSeenAt: string): string {
  const d = new Date(firstSeenAt)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 추가`
}

/**
 * 블로그 언급량. "블로그량 1개월 N건" — 전체 리스트·다녀온 곳·홈이 다 같은
 * 문구를 쓴다(2026-09-08). 원래는 3개월 수치도 같이 보여줬는데, 최근 글을
 * 최대 50건까지만 가져오는 탓에 화제인 곳일수록 3개월 쪽이 비어 보여서
 * 오히려 헛갈렸다 — 그래서 1개월만 남겼다. posts90 은 호출부(reasonLine
 * 등)와의 시그니처를 맞추려 남겨뒀을 뿐 더는 쓰지 않는다.
 */
export function postsLabel(posts30: number, _posts90: number): string {
  return `블로그량 1개월 ${posts30}건`
}
