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
 * 목록에 들어온 날짜. "26/8/25 추가" 형태 — 최신순 정렬의 기준을 눈으로도
 * 보이게 한다. 계속 운영할 서비스라 연도가 없으면 해가 바뀐 뒤 헷갈린다.
 * 두 자리만 쓰는 건 카드 폭이 좁아 네 자리는 다른 줄바꿈 문제를 새로 만들기
 * 때문(2026-09-09) — 이 서비스가 22세기까지 갈 일은 없다.
 */
export function addedLabel(firstSeenAt: string): string {
  const d = new Date(firstSeenAt)
  return `${d.getFullYear() % 100}/${d.getMonth() + 1}/${d.getDate()} 추가`
}

/**
 * "26년 9월 2주차" — 홈 화면 상단 한 줄 요약에 쓴다. 그 달 1일이 속한
 * 일~토 구간을 1주차로 놓고 다음 일요일부터 2주차로 센다(네이버 캘린더와
 * 같은 방식) — 월요일 기준으로 세면 매달 첫 월요일이 항상 1주차가 되어
 * "이번 주" 감각과 어긋난다(2026-09-09, 실측: 9/7 월요일이 그 달 첫
 * 월요일인데도 가족들은 이걸 "9월 둘째 주"로 인식했다).
 */
export function weekLabel(weekOf: string): string {
  const d = new Date(weekOf)
  const firstWeekday = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
  const weekNo = Math.ceil((d.getDate() + firstWeekday) / 7)
  return `${d.getFullYear() % 100}년 ${d.getMonth() + 1}월 ${weekNo}주차`
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
