/**
 * 지역 묶음 (시 단위) — 전체 리스트의 지역 칩.
 *
 * 처음에는 방향 6개(가까운 곳·서울·서쪽·북쪽·동쪽·남쪽)로 묶었다. 시군구
 * 칩 43개가 모바일에서 세 줄을 먹고 17개가 1~2곳뿐이었기 때문이다.
 *
 * 가족이 써 보고 나온 요청은 "시 단위로 보고 싶다" 였다. 실측해 보니 경기는
 * 이미 시 단위로 저장돼 있고(수원시·용인시…) **서울과 인천만 하나로 묶으면
 * 29개**가 된다. 43 -> 29 는 접이식 칩으로 감당되는 수다.
 *
 * 서울·인천을 묶는 이유는 다르다:
 *   서울 71곳 — "거의 안 간다". 칩 10개를 줄 이유가 없다
 *   인천 23곳 — 집이 부평이다. 인천 안에서 구를 가르는 것은 우리에게 무의미하다
 * 대신 이 둘을 **누르면 그 안에서 구별로** 묶어 보여준다 (웹 `groupBySigungu`).
 */

/** 2026년 개편 후 인천 자치구·군. 주소가 없을 때의 보조 판단용 */
const INCHEON = new Set([
  '중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구',
  '제물포구', '영종구', '검단구', '서해구', '강화군', '옹진군',
])

/**
 * 카페 한 곳의 시 단위 그룹 키.
 *
 * **주소의 시도를 먼저 본다.** 서울 중구와 인천 중구가 동명이라 시군구
 * 이름만으로는 가를 수 없다 — 순서가 바뀌면 서울 중구 카페가 인천으로 간다.
 */
export function areaOf(input: {
  sigungu: string
  address?: string | null
  roadAddress?: string | null
  /** 주소가 비었을 때의 보조 신호 */
  zone?: string
}): string {
  const sido = (input.roadAddress ?? input.address ?? '').slice(0, 2)
  if (sido === '서울') return '서울'
  if (sido === '인천') return '인천'
  if (sido === '경기') return input.sigungu
  // 주소가 없는 경우 (실측 0건이지만 스키마상 가능하다)
  if (input.zone === 'seoul') return '서울'
  return INCHEON.has(input.sigungu) ? '인천' : input.sigungu
}

/**
 * 칩에 쓰는 짧은 이름. `남양주시` -> `남양주`.
 *
 * 29개를 나란히 놓으면 접미사 한 글자가 줄 수를 바꾼다. 헤더에서는 전체
 * 이름을 쓰고 칩에서만 줄인다.
 */
export function areaLabel(area: string): string {
  if (area === '서울' || area === '인천') return area
  return area.replace(/[시군]$/, '')
}
