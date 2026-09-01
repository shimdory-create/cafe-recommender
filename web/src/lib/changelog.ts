/**
 * 정보 탭의 업데이트 기록. 가족이 요청한 것 → 반영한 것 단위로 한 줄씩 적는다.
 * 오탈자 수정 같은 자잘한 것 말고, 써보면 체감되는 변경만.
 */
export interface ChangelogEntry {
  date: string
  title: string
  body: string
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-09-01',
    title: '위시리스트 · 최신순 정렬 · 폐업 의심 표시',
    body: '하트를 눌러 담아두고 모아볼 수 있어요. 정렬에 최신순을 추가했고, '
      + '한동안 확인 안 된 카페는 폐업 의심 배지로 알려드려요 (숨기기도 가능).',
  },
  {
    date: '2026-08-25',
    title: '식은 카페 비율 감시 + 지도 링크 정정',
    body: '동명 지역 문제로 지도 링크가 엉뚱한 곳을 열던 것을 고쳤어요. '
      + '터치 영역도 넓혔습니다.',
  },
]
