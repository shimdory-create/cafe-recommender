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
  lat: number
  lng: number
  name: string
  sigungu: string
  /** 방향 구획 (집 기준). 감사 규칙이 시도 정합성을 볼 때 쓴다 */
  zone: 'near' | 'seoul' | 'north' | 'east' | 'south' | 'west'
  /** 시 단위 묶음 키. 전체 리스트의 지역 칩 (서울·인천은 하나로) */
  area: string
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
  /** 추정 발행률. **점수 전용** — 화면에는 실측(posts30·posts90)을 쓴다 */
  postsPer30: number
  /** 최근 30일 블로그 글 수 (검증 통과분, 실측) */
  posts30: number
  /** 최근 90일 블로그 글 수 (검증 통과분). 네이버 리뷰수를 대신한다 */
  posts90: number
  acceleration: number
  /** 'unknown' 은 50건 창이 잘려 비교 불가라는 뜻. 늘었다고 쓰지 않는다 */
  trend: 'rising' | 'steady' | 'unknown'
  /** 가족 별점 (없으면 0) */
  ratingAvg: number
  ratingCount: number
  /** 빌드 시점 후기 (최대 10건, 최근순). 실시간 읽기가 되면 덮인다 */
  familyReviews: { nickname: string; rating: number; comment: string; createdAt: string }[]
  cityOnly: boolean
  visitedOn: string | null
  /** 우리 목록에 처음 들어온 시각. NEW 정렬 기준 */
  firstSeenAt: string
  /** 최초 대량 수집 이후 30일 안에 들어온 곳 */
  isNew: boolean
  /** liveness 잡이 카카오에서 마지막으로 확인한 시각. 한 번도 확인 못 했으면 null */
  lastSeenAt: string | null
}

export interface SiteVisited {
  id: string
  name: string
  sigungu: string
  /** 시 단위 묶음 키. 다녀온 곳 탭도 같은 지역 칩을 쓴다 */
  area: string
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

/** 폐업 의심 후보. 방문 기록 있는 곳은 절대 안 들어있다(백엔드에서 뺌) */
export interface MaybeClosed {
  id: string
  name: string
  sigungu: string
  days: number
  naverMapUrl: string
}

export interface SitePayload {
  generatedAt: string
  weekOf: string
  /** usage-watch.ts의 statusLine() 한 줄. 카페/식당/가볼곳 페이로드가 같은 값을 공유한다 */
  pipelineStatus: string
  week: { rank: number; id: string; finalScore: number }[]
  cafes: SiteCafe[]
  visited: SiteVisited[]
  maybeClosed: MaybeClosed[]
  stats: {
    discovered: number
    passed: number
    regions: number
    /** 훑고 있는 시군구 수 */
    scannedRegions: number
    /** 실제 길찾기로 이동시간을 잰 카페 수 */
    driveMeasured: number
    /** 다녀온 곳을 추천에서 내리는 기간(일) */
    revisitDays: number
    cityOnly: number
    /** 이 날수를 넘도록 안 보이면 폐업 의심 배지를 띄운다 */
    staleDays: number
  }
}
