/**
 * 식당 표시용 페이로드 타입. site-types.ts(카페)와 같은 이유로 zod 의존성이
 * 없는 순수 인터페이스 파일이다. 드리프트는 tests/site/restaurant-types-conformance.test.ts
 * 가 잡는다.
 */
export interface SiteRestaurant {
  id: string
  name: string
  sigungu: string
  zone: 'near' | 'seoul' | 'north' | 'east' | 'south' | 'west'
  area: string
  driveMinutes: number | null
  cuisineType: '한식' | '일식' | '중식' | '양식' | '분식' | '고기구이' | null
  hasRoom: boolean | null
  reservable: boolean | null
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  tags: string[]
  evidence: string
  parkingEvidence: string
  viewTypes: string[]
  outdoorSeating: boolean | null
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

export interface SiteRestaurantVisited {
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

export interface RestaurantSitePayload {
  generatedAt: string
  weekOf: string
  week: { rank: number; id: string; finalScore: number }[]
  restaurants: SiteRestaurant[]
  visited: SiteRestaurantVisited[]
  stats: {
    discovered: number
    passed: number
    regions: number
    scannedRegions: number
    driveMeasured: number
    revisitDays: number
    cityOnly: number
    staleDays: number
  }
}
