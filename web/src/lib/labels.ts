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

/** 목록에 들어온 날짜. "8/25 추가" 형태 — 최신순 정렬의 기준을 눈으로도 보이게 한다 */
export function addedLabel(firstSeenAt: string): string {
  const d = new Date(firstSeenAt)
  return `${d.getMonth() + 1}/${d.getDate()} 추가`
}

/**
 * 블로그 언급량. "블로그량 1개월 N건 · 3개월 M건" 형태 — 홈("이번 주 추천")과
 * 같은 규칙이다(2026-09-08). 30일=1개월·90일=3개월은 정확한 환산은 아니지만
 * 가족이 감을 잡기엔 일수보다 개월 수가 빠르다.
 *
 * 두 값이 같으면 하나만 쓴다 — 90일 창이 아직 30일 분량도 못 채운 신규
 * 카페라 두 수가 같을 때, 같은 수를 두 번 쓰면 오타로 보인다(reasonLine 과 동일 규칙).
 */
export function postsLabel(posts30: number, posts90: number): string {
  return posts30 === posts90
    ? `블로그량 1개월 ${posts30}건`
    : `블로그량 1개월 ${posts30}건 · 3개월 ${posts90}건`
}
