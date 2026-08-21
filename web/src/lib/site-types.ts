/**
 * 표시용 페이로드 타입.
 *
 * **의존성이 없는 순수 인터페이스 파일이다.** 파이프라인의
 * `src/schema.ts` 에서 타입을 직접 import 하던 것을 걷어냈다 — 그 파일은
 * `web/` 밖에 있어서 모듈 해석이 위로 올라가고, Vercel 이 `web/` 에서만
 * 설치하므로 `zod` 를 찾지 못해 배포가 두 번 실패했다 (실측).
 *
 * 그래서 여기에 한 번 더 적고, **드리프트는 파이프라인 테스트가 잡는다** —
 * `tests/site/types-conformance.test.ts` 가 zod 스키마와 이 인터페이스의
 * 상호 대입 가능성을 타입 수준에서 검사한다. 생성기가 필드를 바꾸면
 * 파이프라인 쪽(zod 가 있는 쪽) 테스트가 깨진다.
 */
export interface SiteCafe {
  id: string
  name: string
  sigungu: string
  /** 방향 구획 (집 기준). 전체 리스트에서 "어느 쪽" 으로 묶는다 */
  zone: 'near' | 'seoul' | 'north' | 'east' | 'south' | 'west'
  driveMinutes: number | null
  scale: '대형' | '중형' | '소형' | null
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  menuLevel: number
  tags: string[]
  evidence: string
  parkingEvidence: string
  signatureMenu: string | null
  viewTypes: string[]
  mealTypes: string[]
  outdoorSeating: boolean | null
  teenAppeal: number | null
  stayDuration: string | null
  naverMapUrl: string
  kakaoPlaceUrl: string | null
  /** 대표 이미지 (130x130 정사각). 없으면 null */
  imageUrl: string | null
  hotScore: number
  /** 화제도 x 가족 적합도. 홈 피드와 목록의 정렬 기준 */
  finalScore: number
  postsPer30: number
  acceleration: number
  /** 'unknown' 은 50건 창이 잘려 비교 불가라는 뜻. 늘었다고 쓰지 않는다 */
  trend: 'rising' | 'steady' | 'unknown'
  /** 가족 별점 (없으면 0) */
  ratingAvg: number
  ratingCount: number
  cityOnly: boolean
  visitedOn: string | null
}

export interface SiteVisited {
  id: string
  name: string
  sigungu: string
  visitedOn: string
  note: string
  tags: string[]
  scale: '대형' | '중형' | '소형' | null
  naverMapUrl: string
  imageUrl: string | null
  /** 가족 별점 요약 (빌드 시점). 화면은 실시간 값으로 덮어쓴다 */
  ratingAvg: number
  ratingCount: number
}

export interface SitePayload {
  generatedAt: string
  weekOf: string
  week: { rank: number; id: string; finalScore: number }[]
  cafes: SiteCafe[]
  visited: SiteVisited[]
  stats: { discovered: number; passed: number; regions: number; cityOnly: number }
}
