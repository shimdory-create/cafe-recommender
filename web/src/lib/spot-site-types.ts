/**
 * 가볼 곳 표시용 페이로드 타입. site-types.ts(카페)와 같은 이유로 zod
 * 의존성이 없는 순수 인터페이스 파일이다. 드리프트는
 * tests/site/spot-types-conformance.test.ts 가 잡는다.
 */
export interface SiteSpot {
  id: string
  lat: number
  lng: number
  name: string
  sigungu: string
  zone: 'near' | 'seoul' | 'north' | 'east' | 'south' | 'west'
  area: string
  driveMinutes: number | null
  tags: string[]
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  evidence: string
  parkingEvidence: string
  stayDuration: string | null
  indoorOutdoor: 'indoor' | 'outdoor' | 'mixed' | null
  season: string | null
  teenAppeal: number | null
  naverMapUrl: string
  kakaoPlaceUrl: string | null
  imageUrl: string | null
  hotScore: number
  finalScore: number
  postsPer30: number
  posts30: number
  posts90: number
  acceleration: number
  trend: 'rising' | 'steady' | 'unknown'
  ratingAvg: number
  ratingCount: number
  familyReviews: { nickname: string; rating: number; comment: string; createdAt: string }[]
  cityOnly: boolean
  visitedOn: string | null
  firstSeenAt: string
  isNew: boolean
  lastSeenAt: string | null
}

export interface SiteSpotVisited {
  id: string
  name: string
  sigungu: string
  area: string
  visitedOn: string
  note: string
  tags: string[]
  naverMapUrl: string
  imageUrl: string | null
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

export interface SpotSitePayload {
  generatedAt: string
  weekOf: string
  /** usage-watch.ts의 statusLine() 한 줄. 카페/식당/가볼곳 페이로드가 같은 값을 공유한다 */
  pipelineStatus: string
  week: { rank: number; id: string; finalScore: number }[]
  spots: SiteSpot[]
  visited: SiteSpotVisited[]
  maybeClosed: MaybeClosed[]
  stats: {
    discovered: number
    passed: number
    regions: number
    scannedRegions: number
    driveMeasured: number
    cityOnly: number
    staleDays: number
  }
}
