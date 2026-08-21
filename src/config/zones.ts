import { REGIONS, type Region } from './regions.js'

/**
 * 방향 구획 — "오늘 어느 쪽으로 갈까".
 *
 * 시군구 칩을 43개 만드는 방법도 있었지만 실측 분포가 그것을 막았다:
 * 표시 대상 210곳이 43개 시군구에 흩어져 있고 **17개는 1~2곳뿐**이다.
 * 칩 43개는 모바일에서 세 줄을 먹고, 그중 절반은 카드 한 장을 위한 칩이다.
 *
 * 차로 나가는 가족이 실제로 하는 말은 "안성시 볼까" 가 아니라 "오늘 어느
 * 쪽" 이다. 그래서 방향으로 묶고, 방향을 고르면 **그 안에서 시군구별로**
 * 묶어 보여준다 (원래 요청한 행정구역 묶음은 여기서 충족된다).
 *
 * 기준점은 집(인천 부평)이다. 기점이 바뀌면 이 배정도 바뀌어야 하므로
 * 나중에 기점 선택을 붙일 때는 이 파일이 기점별로 계산하게 된다.
 */

export type ZoneId = 'near' | 'seoul' | 'north' | 'east' | 'south' | 'west'

export interface Zone {
  id: ZoneId
  /** 칩에 쓰는 짧은 이름 */
  label: string
  /**
   * 대표 지역 (문서용). 화면에 쓰지 않는다 — 고정 문자열은 배정과 어긋난다.
   * 웹은 `zoneHint()` 로 데이터에서 계산한다.
   */
  hint: string
}

/** 화면에 보여줄 순서. 가까운 쪽부터 */
export const ZONES: Zone[] = [
  { id: 'near', label: '가까운 곳', hint: '인천·부천·시흥' },
  { id: 'seoul', label: '서울', hint: '서울 전역' },
  { id: 'west', label: '서쪽', hint: '김포·강화' },
  { id: 'north', label: '북쪽', hint: '고양·파주·양주·의정부·포천·연천' },
  { id: 'east', label: '동쪽', hint: '양평·남양주·가평·하남·이천·광주·여주·구리' },
  { id: 'south', label: '남쪽', hint: '용인·평택·수원·안산·광명 등 경기 남부' },
]

/**
 * 시군구 -> 방향. 계산이 아니라 **명시적 배정**이다.
 *
 * 방위각으로 계산하면 강화군(북서)이나 하남시(동남)처럼 경계에 걸린 곳이
 * 사람 감각과 어긋난다. 65개뿐이므로 손으로 적는 편이 예측 가능하다.
 */
const BY_SIGUNGU: Record<ZoneId, string[]> = {
  // 인천 8구 + 붙어 있는 경기 서남
  near: [
    '중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구',
    // 2026년 인천 개편 신설구 (구 중구·동구·서구가 나뉘었다)
    '제물포구', '영종구', '검단구', '서해구',
    '부천시', '시흥시',
  ],
  seoul: [], // 서울은 시도로 판단한다 (동명 시군구가 있어 이름만으로는 못 가른다)
  west: ['김포시', '강화군'],
  north: ['고양시', '파주시', '양주시', '의정부시', '동두천시', '포천시', '연천군'],
  east: ['남양주시', '양평군', '가평군', '하남시', '광주시', '구리시', '여주시', '이천시'],
  south: [
    '광명시', '안산시', '수원시', '용인시', '평택시', '성남시', '안양시',
    '과천시', '군포시', '의왕시', '오산시', '화성시', '안성시',
  ],
}

const LOOKUP = new Map<string, ZoneId>()
for (const [zone, list] of Object.entries(BY_SIGUNGU) as [ZoneId, string[]][]) {
  for (const s of list) LOOKUP.set(s, zone)
}

/**
 * 카페 한 곳의 방향. 서울은 시도로, 나머지는 시군구로 가른다.
 *
 * 서울 중구와 인천 중구가 동명이므로 **시도를 먼저 본다** — 이 순서가
 * 바뀌면 서울 중구가 '가까운 곳' 이 된다.
 */
export function zoneOf(input: {
  sido?: string | null
  sigungu: string
  address?: string | null
  roadAddress?: string | null
}): ZoneId {
  const sido = input.sido ?? (input.roadAddress ?? input.address ?? '').slice(0, 2)
  if (sido === '서울') return 'seoul'
  return LOOKUP.get(input.sigungu) ?? 'near'
}

/** 배정이 빠진 시군구를 찾는다. 지역이 늘면 테스트가 여기서 잡는다 */
export function unassignedRegions(regions: Region[] = REGIONS): string[] {
  return regions
    .filter((r) => !r.excluded && r.sido !== '서울' && !LOOKUP.has(r.sigungu))
    .map((r) => `${r.sido} ${r.sigungu}`)
}
