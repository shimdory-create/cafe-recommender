/**
 * 지역 묶음 (시도 단위) — 전체 리스트의 지역 칩.
 *
 * 처음에는 방향 6개(가까운 곳·서울·서쪽·북쪽·동쪽·남쪽)로 묶었다가, 시 단위
 * 32개(경기는 시군 그대로, 서울·인천만 하나로)로 바꿨다. 그런데 데이터가
 * 늘면서 인천 하나가 너무 커졌고(2026-09-24, 가족 리포트 — "인천 하나로
 * 묶으니 너무 큼"), 그렇다고 경기 29개 시군을 다시 펼치면 원래 문제로
 * 돌아간다.
 *
 * 그래서 **서울·인천·경기 셋으로만** 묶고, 칩을 누르면 그 안에서 시군구별로
 * 펼쳐 보여준다(웹 `AreaChips` 의 2단 구조 + `groupBySigungu`). `sigungu`
 * 필드는 그대로 시군구 단위를 유지하므로 정보 손실은 없다 — 최상위 묶음
 * 기준만 시도로 올린 것이다.
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
  if (sido === '경기') return '경기'
  // 주소가 없는 경우 (실측 0건이지만 스키마상 가능하다)
  if (input.zone === 'seoul') return '서울'
  return INCHEON.has(input.sigungu) ? '인천' : '경기'
}

/**
 * 칩에 쓰는 짧은 이름. `남양주시` -> `남양주`, `부평구` -> `부평`.
 *
 * 시군구를 나란히 놓으면 접미사 한 글자가 줄 수를 바꾼다. 헤더에서는 전체
 * 이름을 쓰고 칩에서만 줄인다.
 */
export function areaLabel(area: string): string {
  if (area === '서울' || area === '인천') return area
  return area.replace(/[시군구]$/, '')
}
