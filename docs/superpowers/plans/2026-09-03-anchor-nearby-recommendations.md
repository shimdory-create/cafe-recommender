# 앵커 기반 도메인 간 근처 추천 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카페/식당/가볼 곳 상세 페이지에서 나머지 두 도메인의 가까운 곳(직선거리 기준, 최대 5개씩)을 보여준다.

**Architecture:** 빌드 타임(`npm run site`)에 원본 데이터의 좌표와 이미 만들어진 사이트 페이로드의 카드 필드를 조인해 `site-{domain}-nearby.json` 3개를 새로 계산한다. 순수 haversine 계산이라 API 호출이 없다. 상세 페이지는 자기 도메인의 nearby 파일만 읽고, 클라이언트에서 다른 도메인의 블랙리스트·폐업숨김 훅으로 한 번 더 걸러 보여준다.

**Tech Stack:** TypeScript, Zod 없이 순수 함수(내부 계산이라 외부 입력 검증 불필요), Next.js 클라이언트 컴포넌트, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-anchor-nearby-recommendations-design.md`

## Global Constraints

- 거리는 직선거리(haversine)만 쓴다. 실제 도로 이동시간은 범위 밖.
- 도메인당 최대 5개, 거리 상한 없음(있는 만큼 가까운 순으로).
- `cityOnly: true`(주차 C) 항목은 근처 추천 후보에서 제외한다.
- 근처 추천 카드에 `driveMinutes`를 넣지 않는다 — "집에서"와 "이 앵커에서"를 혼동시키는 필드라 아예 뺀다. `distanceKm`(앵커 기준 직선거리)만 쓴다.
- 근처 추천 카드에는 위시리스트·블랙리스트 토글을 안 넣는다(범위 밖) — 클릭하면 그 도메인 상세 페이지로 이동만 한다.
- 상세 페이지에서 렌더링 직전에 다른 도메인의 `useXWishlist`/`useXBlacklist`/`useXDismissed` 훅으로 걸러낸다(새 훅 없음, 기존 훅 재사용).
- 후보가 하나도 없으면(그 도메인 자체가 근처에 없거나 앵커가 아직 판정 전) 섹션 자체를 렌더링하지 않는다.

---

### Task 1: haversine 거리·최근접 순수 함수

**Files:**
- Create: `src/site/nearby.ts`
- Test: `tests/site/nearby.test.ts`

**Interfaces:**
- Produces: `GeoPoint { id: string; lat: number; lng: number }`, `NearbyMatch { id: string; distanceKm: number }`, `haversineKm(a: GeoPoint, b: GeoPoint): number`, `nearestByDomain(anchors: GeoPoint[], candidates: GeoPoint[], limit: number): Map<string, NearbyMatch[]>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/site/nearby.test.ts
import { describe, it, expect } from 'vitest'
import { haversineKm, nearestByDomain, type GeoPoint } from '../../src/site/nearby.js'

describe('haversineKm', () => {
  it('같은 점은 0km', () => {
    const p: GeoPoint = { id: 'a', lat: 37.5, lng: 126.9 }
    expect(haversineKm(p, p)).toBe(0)
  })

  it('서울시청(37.5665,126.9780)과 인천시청(37.4563,126.7052) 거리가 실측과 비슷하다', () => {
    const seoul: GeoPoint = { id: 'seoul', lat: 37.5665, lng: 126.9780 }
    const incheon: GeoPoint = { id: 'incheon', lat: 37.4563, lng: 126.7052 }
    const km = haversineKm(seoul, incheon)
    // 실제 직선거리는 약 26.4km. ±1km 허용.
    expect(km).toBeGreaterThan(25)
    expect(km).toBeLessThan(28)
  })

  it('소수 첫째 자리로 반올림한다', () => {
    const seoul: GeoPoint = { id: 'seoul', lat: 37.5665, lng: 126.9780 }
    const incheon: GeoPoint = { id: 'incheon', lat: 37.4563, lng: 126.7052 }
    const km = haversineKm(seoul, incheon)
    expect(km).toBe(Math.round(km * 10) / 10)
  })
})

describe('nearestByDomain', () => {
  const anchor: GeoPoint = { id: 'anchor', lat: 37.5, lng: 126.9 }
  const near: GeoPoint = { id: 'near', lat: 37.501, lng: 126.901 }
  const mid: GeoPoint = { id: 'mid', lat: 37.55, lng: 126.95 }
  const far: GeoPoint = { id: 'far', lat: 38.5, lng: 127.9 }

  it('가까운 순으로 정렬해 limit개까지 반환한다', () => {
    const result = nearestByDomain([anchor], [far, near, mid], 2)
    const matches = result.get('anchor')
    expect(matches).toHaveLength(2)
    expect(matches?.[0].id).toBe('near')
    expect(matches?.[1].id).toBe('mid')
  })

  it('candidates가 limit보다 적으면 있는 만큼만 반환한다', () => {
    const result = nearestByDomain([anchor], [near], 5)
    expect(result.get('anchor')).toHaveLength(1)
  })

  it('candidates가 비어있으면 빈 배열을 반환한다', () => {
    const result = nearestByDomain([anchor], [], 5)
    expect(result.get('anchor')).toEqual([])
  })

  it('anchor가 여러 개면 각각 독립적으로 계산한다', () => {
    const anchor2: GeoPoint = { id: 'anchor2', lat: 38.4, lng: 127.8 }
    const result = nearestByDomain([anchor, anchor2], [near, far], 1)
    expect(result.get('anchor')?.[0].id).toBe('near')
    expect(result.get('anchor2')?.[0].id).toBe('far')
  })

  it('anchors가 비어있으면 빈 Map을 반환한다', () => {
    const result = nearestByDomain([], [near], 5)
    expect(result.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/site/nearby.test.ts`
Expected: FAIL — `Cannot find module './nearby.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/site/nearby.ts
export interface GeoPoint {
  id: string
  lat: number
  lng: number
}

export interface NearbyMatch {
  id: string
  distanceKm: number
}

const EARTH_RADIUS_KM = 6371

/** 두 좌표 사이의 직선거리(km), 소수 첫째 자리 반올림 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  if (a.lat === b.lat && a.lng === b.lng) return 0
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  const km = EARTH_RADIUS_KM * c
  return Math.round(km * 10) / 10
}

/**
 * anchors 각각에 대해 candidates 중 가장 가까운 limit개를 가까운 순으로
 * 반환한다. anchors 와 candidates 는 서로 다른 도메인이라는 전제 —
 * 같은 도메인끼리는 호출하지 않는다(자기 자신 제외 로직이 없다).
 */
export function nearestByDomain(
  anchors: GeoPoint[],
  candidates: GeoPoint[],
  limit: number,
): Map<string, NearbyMatch[]> {
  const result = new Map<string, NearbyMatch[]>()
  for (const anchor of anchors) {
    const matches = candidates
      .map((c): NearbyMatch => ({ id: c.id, distanceKm: haversineKm(anchor, c) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit)
    result.set(anchor.id, matches)
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/site/nearby.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/site/nearby.ts tests/site/nearby.test.ts
git commit -m "feat(nearby): haversine 거리·최근접 도메인 계산 순수 함수"
```

---

### Task 2: 도메인 조인 + 근처 추천 페이로드 빌더

**Files:**
- Create: `src/site/nearby-payload.ts`
- Test: `tests/site/nearby-payload.test.ts`

**Interfaces:**
- Consumes: `haversineKm`, `nearestByDomain`, `GeoPoint`, `NearbyMatch` from Task 1 (`./nearby.js`)
- Consumes: `Cafe`, `SiteCafe` from `../schema.js`; `Restaurant`, `SiteRestaurant` from `../restaurant-schema.js`; `Spot`, `SiteSpot` from `../spot-schema.js` (이미 존재하는 타입 — 좌표는 `Cafe`/`Restaurant`/`Spot`(원본)에, 카드 필드는 `SiteCafe`/`SiteRestaurant`/`SiteSpot`(최종 페이로드)에 있다)
- Produces: `NearbyCard { id: string; name: string; imageUrl: string | null; tags: string[]; sigungu: string; ratingAvg: number; ratingCount: number; distanceKm: number }`, `buildNearbyPayloads(input: BuildNearbyInput): { cafe: Record<string, { restaurants: NearbyCard[]; spots: NearbyCard[] }>; restaurant: Record<string, { cafes: NearbyCard[]; spots: NearbyCard[] }>; spot: Record<string, { cafes: NearbyCard[]; restaurants: NearbyCard[] }> }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/site/nearby-payload.test.ts
import { describe, it, expect } from 'vitest'
import { buildNearbyPayloads } from '../../src/site/nearby-payload.js'
import type { Cafe } from '../../src/schema.js'
import type { Restaurant } from '../../src/restaurant-schema.js'
import type { Spot } from '../../src/spot-schema.js'

// 좌표·id·status 만 있으면 되는 최소 필드. 나머지는 any 캐스팅 없이
// 실제 스키마 필드를 채운다 — 테스트 파일이라도 타입은 정확해야 한다.
function cafe(overrides: Partial<Cafe>): Cafe {
  return {
    kakaoPlaceId: 'c1', name: '카페', sigungu: '부평구', roadAddress: '',
    address: '', lat: 37.5, lng: 126.9, categoryName: '', kakaoPlaceUrl: null,
    naverMapUrl: null, phone: null, straightKm: 0, driveMinutesEst: null,
    firstSeenAt: '2026-01-01', status: 'active', excludeReason: null,
    ambiguousName: false, imageUrl: null, attributes: null, tags: [],
    ...overrides,
  } as Cafe
}

function siteCafe(overrides: Partial<{ id: string; cityOnly: boolean }>) {
  return {
    id: overrides.id ?? 'c1', name: '카페', sigungu: '부평구', zone: 'near',
    area: '인천', driveMinutes: 10, scale: null, parkingGrade: 'A', menuLevel: 1,
    tags: [], evidence: '', parkingEvidence: '', signatureMenu: null,
    viewTypes: [], mealTypes: [], outdoorSeating: null, teenAppeal: null,
    stayDuration: null, naverMapUrl: '', kakaoPlaceUrl: null, imageUrl: null,
    hotScore: 0, finalScore: 0, postsPer30: 0, posts30: 0, posts90: 0,
    acceleration: 0, trend: 'unknown', ratingAvg: 0, ratingCount: 0,
    familyReviews: [], cityOnly: overrides.cityOnly ?? false, visitedOn: null,
    firstSeenAt: '2026-01-01', isNew: false, lastSeenAt: null,
  }
}

describe('buildNearbyPayloads', () => {
  it('카페 앵커 기준으로 가까운 식당·가볼곳을 채운다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [{ kakaoPlaceId: 's1', lat: 37.502, lng: 126.902 } as Spot],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      spotSite: [{ id: 's1', name: '가볼곳', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      limit: 5,
    })
    expect(result.cafe.c1.restaurants).toHaveLength(1)
    expect(result.cafe.c1.restaurants[0].id).toBe('r1')
    expect(result.cafe.c1.spots).toHaveLength(1)
    expect(result.restaurant.r1.cafes[0].id).toBe('c1')
    expect(result.spot.s1.cafes[0].id).toBe('c1')
  })

  it('cityOnly 후보는 제외한다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: true } as never],
      spotSite: [],
      limit: 5,
    })
    expect(result.cafe.c1.restaurants).toEqual([])
  })

  it('출력 카드에 driveMinutes 필드가 없다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      spotSite: [],
      limit: 5,
    })
    expect(result.cafe.c1.restaurants[0]).not.toHaveProperty('driveMinutes')
    expect(result.cafe.c1.restaurants[0]).toHaveProperty('distanceKm')
  })

  it('원본 배열이 비어있으면 그 도메인 관련 결과가 빈 배열이다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [],
      spotSite: [],
      limit: 5,
    })
    expect(result.cafe.c1.restaurants).toEqual([])
    expect(result.cafe.c1.spots).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/site/nearby-payload.test.ts`
Expected: FAIL — `Cannot find module './nearby-payload.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/site/nearby-payload.ts
import { nearestByDomain, type GeoPoint, type NearbyMatch } from './nearby.js'
import type { Cafe, SiteCafe } from '../schema.js'
import type { Restaurant, SiteRestaurant } from '../restaurant-schema.js'
import type { Spot, SiteSpot } from '../spot-schema.js'

export interface NearbyCard {
  id: string
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
  distanceKm: number
}

export interface BuildNearbyInput {
  cafes: Cafe[]
  restaurants: Restaurant[]
  spots: Spot[]
  cafeSite: SiteCafe[]
  restaurantSite: SiteRestaurant[]
  spotSite: SiteSpot[]
  limit: number
}

export interface NearbyPayloads {
  cafe: Record<string, { restaurants: NearbyCard[]; spots: NearbyCard[] }>
  restaurant: Record<string, { cafes: NearbyCard[]; spots: NearbyCard[] }>
  spot: Record<string, { cafes: NearbyCard[]; restaurants: NearbyCard[] }>
}

interface GeoCard extends GeoPoint {
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
}

/**
 * 원본 배열(좌표)과 최종 사이트 페이로드(카드 필드)를 id 로 조인해
 * GeoCard 목록을 만든다. 사이트 페이로드는 이미 판정 통과분만 담고
 * 있으므로 별도 status 필터가 필요 없다 — cityOnly 만 여기서 뺀다.
 */
function toGeoCards<TRaw extends { kakaoPlaceId: string; lat: number; lng: number }>(
  raw: TRaw[],
  site: { id: string; name: string; imageUrl: string | null; tags: string[]; sigungu: string; ratingAvg: number; ratingCount: number; cityOnly: boolean }[],
): GeoCard[] {
  const coordById = new Map(raw.map((r) => [r.kakaoPlaceId, r]))
  const cards: GeoCard[] = []
  for (const s of site) {
    if (s.cityOnly) continue
    const coord = coordById.get(s.id)
    if (!coord) continue
    cards.push({
      id: s.id, lat: coord.lat, lng: coord.lng, name: s.name, imageUrl: s.imageUrl,
      tags: s.tags, sigungu: s.sigungu, ratingAvg: s.ratingAvg, ratingCount: s.ratingCount,
    })
  }
  return cards
}

function toCards(matches: NearbyMatch[], byId: Map<string, GeoCard>): NearbyCard[] {
  const out: NearbyCard[] = []
  for (const m of matches) {
    const c = byId.get(m.id)
    if (!c) continue
    out.push({
      id: c.id, name: c.name, imageUrl: c.imageUrl, tags: c.tags, sigungu: c.sigungu,
      ratingAvg: c.ratingAvg, ratingCount: c.ratingCount, distanceKm: m.distanceKm,
    })
  }
  return out
}

/** anchors 각 항목에 대해 candidates 중 가까운 순 카드 목록을 만든다 */
function nearbyMap(
  anchors: GeoCard[],
  candidates: GeoCard[],
  limit: number,
): Map<string, NearbyCard[]> {
  const matches = nearestByDomain(anchors, candidates, limit)
  const candidateById = new Map(candidates.map((c) => [c.id, c]))
  const result = new Map<string, NearbyCard[]>()
  for (const [anchorId, m] of matches) result.set(anchorId, toCards(m, candidateById))
  return result
}

export function buildNearbyPayloads(input: BuildNearbyInput): NearbyPayloads {
  const { cafes, restaurants, spots, cafeSite, restaurantSite, spotSite, limit } = input

  const cafeGeo = toGeoCards(cafes, cafeSite)
  const restGeo = toGeoCards(restaurants, restaurantSite)
  const spotGeo = toGeoCards(spots, spotSite)

  const cafeToRest = nearbyMap(cafeGeo, restGeo, limit)
  const cafeToSpot = nearbyMap(cafeGeo, spotGeo, limit)
  const restToCafe = nearbyMap(restGeo, cafeGeo, limit)
  const restToSpot = nearbyMap(restGeo, spotGeo, limit)
  const spotToCafe = nearbyMap(spotGeo, cafeGeo, limit)
  const spotToRest = nearbyMap(spotGeo, restGeo, limit)

  const cafe: NearbyPayloads['cafe'] = {}
  for (const c of cafeGeo) {
    cafe[c.id] = { restaurants: cafeToRest.get(c.id) ?? [], spots: cafeToSpot.get(c.id) ?? [] }
  }
  const restaurant: NearbyPayloads['restaurant'] = {}
  for (const r of restGeo) {
    restaurant[r.id] = { cafes: restToCafe.get(r.id) ?? [], spots: restToSpot.get(r.id) ?? [] }
  }
  const spot: NearbyPayloads['spot'] = {}
  for (const s of spotGeo) {
    spot[s.id] = { cafes: spotToCafe.get(s.id) ?? [], restaurants: spotToRest.get(s.id) ?? [] }
  }

  return { cafe, restaurant, spot }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/site/nearby-payload.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/site/nearby-payload.ts tests/site/nearby-payload.test.ts
git commit -m "feat(nearby): 원본 좌표 + 사이트 페이로드 조인해 근처 추천 3파일 빌드"
```

---

### Task 3: `site` CLI 케이스에 근처 추천 파일 생성 연결

**Files:**
- Modify: `src/cli/run.ts` (`case 'site':` 블록 끝, 가볼 곳 페이로드 try/catch 다음)

**Interfaces:**
- Consumes: `buildNearbyPayloads` from `../site/nearby-payload.js` (Task 2). `case 'site':` 블록은 이미 `cafes`, `restaurants`, `spots`(원본 배열), `payload`, `restPayload`, `spotPayload`(최종 페이로드, 각각 `.cafes`/`.restaurants`/`.spots` 프로퍼티) 를 스코프 안에 갖고 있다 — 단, `restaurants`/`restPayload`/`spots`/`spotPayload`는 각자의 try 블록 **안에서** 선언되므로, 근처 추천 계산도 그 두 try 블록이 끝난 뒤 이어지는 자기 자신의 try/catch 안에서 그 변수들을 다시 선언해 읽어야 한다(식당/가볼 곳 로드를 중복하지 않도록 try 블록 바깥의 `let`로 끌어올린다).

먼저 기존 코드를 읽어 정확한 위치를 확인한다:

- [ ] **Step 1: 기존 변수 선언을 try 블록 바깥으로 끌어올리기 위해 현재 구조 확인**

Run: `grep -n "case 'site':" -A 5 src/cli/run.ts` 로 시작 줄을 확인하고, 식당·가볼 곳 try 블록 안의 `restaurants`/`restPayload`/`spots`/`spotPayload` 선언 줄 번호를 적어둔다(이 계획 작성 시점 기준 각각 434번·441번, 493번·500번 부근 — 실제 줄 번호는 파일 상태에 따라 달라질 수 있으니 직접 확인).

- [ ] **Step 2: `restaurants`/`restPayload`/`spots`/`spotPayload`를 try 블록 바깥에서 선언하도록 수정**

`case 'site':` 블록 맨 위, `const now = new Date()` 다음 줄에 추가:

```typescript
      let restaurants: Awaited<ReturnType<typeof createRestaurantJsonStore>['readRestaurants']> = []
      let restPayload: ReturnType<typeof buildRestaurantSitePayload> | null = null
      let spots: Awaited<ReturnType<typeof createSpotJsonStore>['readSpots']> = []
      let spotPayload: ReturnType<typeof buildSpotSitePayload> | null = null
```

식당 try 블록 안에서 기존에 `const restaurants = ...`, `const restPayload = ...`로 선언하던 줄을 `restaurants = ...`, `restPayload = ...`(재할당)로 바꾼다. 가볼 곳 try 블록도 동일하게 `spots`/`spotPayload`를 재할당으로 바꾼다.

- [ ] **Step 3: 가볼 곳 try/catch 블록이 끝난 직후, 새 try/catch로 근처 추천 3파일 생성**

```typescript
      // 근처 추천 3파일 — 카페·식당·가볼 곳 페이로드가 전부 준비된 뒤에만
      // 계산 가능하다. 실패해도 위에서 이미 써진 세 페이로드는 그대로 —
      // 식당·가볼 곳 페이로드 실패 처리와 같은 이유(독립 try/catch).
      try {
        const cafeNearbyOut = flag(rest, 'cafe-nearby-out') || 'web/src/generated/site-cafe-nearby.json'
        const restNearbyOut = flag(rest, 'restaurant-nearby-out') || 'web/src/generated/site-restaurant-nearby.json'
        const spotNearbyOut = flag(rest, 'spot-nearby-out') || 'web/src/generated/site-spot-nearby.json'
        const nearby = buildNearbyPayloads({
          cafes, restaurants, spots,
          cafeSite: payload.cafes,
          restaurantSite: restPayload?.restaurants ?? [],
          spotSite: spotPayload?.spots ?? [],
          limit: 5,
        })
        await writeFile(cafeNearbyOut, JSON.stringify(nearby.cafe, null, 2) + '\n', 'utf8')
        await writeFile(restNearbyOut, JSON.stringify(nearby.restaurant, null, 2) + '\n', 'utf8')
        await writeFile(spotNearbyOut, JSON.stringify(nearby.spot, null, 2) + '\n', 'utf8')
        console.log(
          `근처 추천 3파일 생성 완료 (카페 ${Object.keys(nearby.cafe).length}곳 `
          + `· 식당 ${Object.keys(nearby.restaurant).length}곳 `
          + `· 가볼 곳 ${Object.keys(nearby.spot).length}곳)`,
        )
      } catch (e) {
        console.error(`[!] 근처 추천 계산 실패 — 다른 페이로드는 이미 써졌다: ${(e as Error).message}`)
      }
```

- [ ] **Step 4: import 추가**

`src/cli/run.ts` 상단 import 목록에 추가:

```typescript
import { buildNearbyPayloads } from '../site/nearby-payload.js'
```

- [ ] **Step 5: 타입 검사와 기존 CLI 테스트 확인**

Run: `npm run typecheck` (또는 `npx tsc --noEmit`)
Expected: 에러 없음

Run: `npm test -- tests/cli` (CLI 관련 기존 테스트가 있으면 전부 통과 확인. 없으면 `npm test`로 전체 스위트 확인)
Expected: 기존 테스트 전부 PASS (이 태스크는 새 유닛 테스트를 추가하지 않는다 — CLI 배선은 Task 9의 실측 빌드로 검증한다)

- [ ] **Step 6: Commit**

```bash
git add src/cli/run.ts
git commit -m "feat(nearby): site CLI 케이스에 근처 추천 3파일 생성 연결"
```

---

### Task 4: 웹에서 근처 추천 파일 읽는 lib 함수 3개

**Files:**
- Create: `web/src/lib/nearby-types.ts`
- Modify: `web/src/lib/site.ts` (카페)
- Modify: `web/src/lib/restaurant-site.ts` (식당)
- Modify: `web/src/lib/spot-site.ts` (가볼 곳)

**Interfaces:**
- Produces: `NearbyCard` 타입(Task 2의 `NearbyCard`와 필드 동일), `nearbyForCafe(id: string): { restaurants: NearbyCard[]; spots: NearbyCard[] } | undefined`, `nearbyForRestaurant(id: string): { cafes: NearbyCard[]; spots: NearbyCard[] } | undefined`, `nearbyForSpot(id: string): { cafes: NearbyCard[]; restaurants: NearbyCard[] } | undefined`

- [ ] **Step 1: 공용 타입 파일 작성** (테스트 없음 — 타입 전용 파일)

```typescript
// web/src/lib/nearby-types.ts
export interface NearbyCard {
  id: string
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
  distanceKm: number
}
```

- [ ] **Step 2: 생성된 JSON을 프로젝트에 준비**

이 시점엔 `web/src/generated/site-cafe-nearby.json` 등이 아직 없다(Task 9에서 `npm run site`로 처음 생성된다). Next.js/TypeScript가 `import`할 파일을 찾지 못해 빌드가 깨지지 않도록, 최소 형태의 빈 객체 파일을 미리 커밋해 둔다 — 기존 `web/src/generated/site.json` 등도 커밋된 정적 파일이라 같은 관례다.

```bash
echo '{}' > web/src/generated/site-cafe-nearby.json
echo '{}' > web/src/generated/site-restaurant-nearby.json
echo '{}' > web/src/generated/site-spot-nearby.json
```

- [ ] **Step 3: `web/src/lib/spot-site.ts`에 `nearbyForSpot` 추가**

`spotById` 함수 바로 아래에 추가:

```typescript
import nearbyRaw from '../generated/site-spot-nearby.json'
import type { NearbyCard } from './nearby-types'

export type { NearbyCard }

const spotNearby = nearbyRaw as unknown as Record<string, { cafes: NearbyCard[]; restaurants: NearbyCard[] }>

export const nearbyForSpot = (id: string) => spotNearby[id]
```

(`import`는 파일 맨 위 기존 import 목록에 합친다 — 위 코드는 추가할 두 줄의 import와 아래 두 줄의 함수를 함께 보여준 것이다.)

- [ ] **Step 4: `web/src/lib/site.ts`(카페)에 `nearbyForCafe` 추가**

`site.ts`에서 `byId` 함수를 찾아 그 아래 같은 패턴으로 추가:

```typescript
import nearbyRaw from '../generated/site-cafe-nearby.json'
import type { NearbyCard } from './nearby-types'

export type { NearbyCard }

const cafeNearby = nearbyRaw as unknown as Record<string, { restaurants: NearbyCard[]; spots: NearbyCard[] }>

export const nearbyForCafe = (id: string) => cafeNearby[id]
```

- [ ] **Step 5: `web/src/lib/restaurant-site.ts`에 `nearbyForRestaurant` 추가**

`restaurantById` 함수 아래 같은 패턴:

```typescript
import nearbyRaw from '../generated/site-restaurant-nearby.json'
import type { NearbyCard } from './nearby-types'

export type { NearbyCard }

const restaurantNearby = nearbyRaw as unknown as Record<string, { cafes: NearbyCard[]; spots: NearbyCard[] }>

export const nearbyForRestaurant = (id: string) => restaurantNearby[id]
```

- [ ] **Step 6: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/nearby-types.ts web/src/lib/site.ts web/src/lib/restaurant-site.ts web/src/lib/spot-site.ts web/src/generated/site-cafe-nearby.json web/src/generated/site-restaurant-nearby.json web/src/generated/site-spot-nearby.json
git commit -m "feat(nearby): 근처 추천 파일을 읽는 도메인별 lib 함수 3개"
```

---

### Task 5: 공용 `NearbyCard`/`NearbySection` UI 컴포넌트

**Files:**
- Create: `web/src/app/nearby-card.tsx`

**Interfaces:**
- Consumes: `NearbyCard` type from `@/lib/nearby-types` (Task 4)
- Produces: `NearbySection({ title, items, hrefPrefix }: { title: string; items: NearbyCard[]; hrefPrefix: string }): JSX.Element | null`

기존 카드 컴포넌트(`web/src/app/spot-card.tsx` 등)를 먼저 참고해 톤(className, 태그 스타일)을 맞춘다 — `Badge` 컴포넌트(`./badge`)와 `Thumb` 컴포넌트(`./thumb`)를 그대로 재사용한다.

**이 태스크엔 유닛 테스트가 없다.** `web/` 패키지엔 React 컴포넌트를 렌더링하는
테스트 인프라(`@testing-library/react`, jsdom 환경)가 아예 없다 — 기존
200개 테스트 전부 `.test.ts`(순수 함수)뿐이고, `CafeCard`/`SpotCard`/
`RestaurantCard` 등 기존 카드 컴포넌트도 전부 테스트가 없다. 이 컴포넌트도
같은 관례를 따른다 — 검증은 Task 9의 실측 브라우저 확인으로 한다.

- [ ] **Step 1: Write the implementation**

```typescript
// web/src/app/nearby-card.tsx
import Link from 'next/link'
import type { NearbyCard as NearbyCardData } from '@/lib/nearby-types'
import { Thumb } from './thumb'
import { Badge } from './badge'

function NearbyCard({ item, href }: { item: NearbyCardData; href: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 flex-col gap-2 rounded-2xl border border-line bg-card p-3 active:bg-bean-soft/40"
      style={{ width: '160px' }}
    >
      <Thumb src={item.imageUrl} alt={item.name} size={56} />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-bold">{item.name}</p>
        <p className="mt-0.5 text-[12px] text-ink-soft">
          {item.sigungu} · 직선거리 {item.distanceKm}km
        </p>
        {item.ratingCount > 0 && (
          <p className="mt-0.5 text-[12px] font-bold text-bean">★ {item.ratingAvg.toFixed(1)}</p>
        )}
        {item.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.tags.slice(0, 2).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}

export function NearbySection(
  { title, items, hrefPrefix }: { title: string; items: NearbyCardData[]; hrefPrefix: string },
) {
  if (items.length === 0) return null
  return (
    <section className="mt-5">
      <h2 className="text-[15px] font-bold">{title}</h2>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <NearbyCard key={item.id} item={item} href={`${hrefPrefix}${item.id}`} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add web/src/app/nearby-card.tsx
git commit -m "feat(nearby): 3도메인 공용 근처 추천 카드·섹션 컴포넌트"
```

---

### Task 6: 카페 상세 페이지에 근처 추천 배치

**Files:**
- Create: `web/src/app/cafe/[id]/nearby-sections.tsx`
- Modify: `web/src/app/cafe/[id]/page.tsx`

**Interfaces:**
- Consumes: `nearbyForCafe` from `@/lib/site` (Task 4), `NearbySection` from `../../nearby-card` (Task 5), `useRestaurantWishlist`/`useRestaurantBlacklist`/`useRestaurantDismissed`(이미 존재), `useSpotWishlist`/`useSpotBlacklist`/`useSpotDismissed`(이미 존재) — 위시리스트 훅은 걸러내기에 쓰지 않지만 이미 있는 훅이라 언급만; 실제로 쓰는 건 블랙리스트·폐업숨김 두 종류다.

- [ ] **Step 1: 클라이언트 컴포넌트 작성**

```typescript
// web/src/app/cafe/[id]/nearby-sections.tsx
'use client'

import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

function filterOut(items: NearbyCard[], hidden: Set<string>): NearbyCard[] {
  return items.filter((i) => !hidden.has(i.id))
}

export function CafeNearbySections(
  { restaurants, spots }: { restaurants: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const restHidden = new Set([...restBlacklisted, ...restDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])

  return (
    <>
      <NearbySection
        title="근처 식당"
        items={filterOut(restaurants, restHidden)}
        hrefPrefix="/restaurant/"
      />
      <NearbySection
        title="근처 가볼 곳"
        items={filterOut(spots, spotHidden)}
        hrefPrefix="/spot/"
      />
    </>
  )
}
```

- [ ] **Step 2: `page.tsx`에 배치**

`web/src/app/cafe/[id]/page.tsx`에서 `import { WishHeart } from './wish-heart'` 아래에 추가:

```typescript
import { CafeNearbySections } from './nearby-sections'
import { nearbyForCafe } from '@/lib/site'
```

`</dl>` 태그(주차 등급 등을 나열하는 `<dl>`)가 끝나는 지점 바로 다음, `<section>주차</section>` 앞에 추가:

```typescript
      {(() => {
        const nearby = nearbyForCafe(cafe.id)
        return nearby ? (
          <CafeNearbySections restaurants={nearby.restaurants} spots={nearby.spots} />
        ) : null
      })()}
```

- [ ] **Step 3: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add web/src/app/cafe/[id]/nearby-sections.tsx web/src/app/cafe/[id]/page.tsx
git commit -m "feat(nearby): 카페 상세 페이지에 근처 식당·가볼 곳 섹션 배치"
```

---

### Task 7: 식당 상세 페이지에 근처 추천 배치

**Files:**
- Create: `web/src/app/restaurant/[id]/nearby-sections.tsx`
- Modify: `web/src/app/restaurant/[id]/page.tsx`

**Interfaces:**
- Consumes: `nearbyForRestaurant` from `@/lib/restaurant-site` (Task 4), `NearbySection` from `../../nearby-card` (Task 5), `useWishlist`/`useBlacklist`/`useDismissed`(카페, 이미 존재), `useSpotBlacklist`/`useSpotDismissed`(이미 존재)

Task 6과 완전히 같은 구조 — 도메인 이름만 바꾼다.

- [ ] **Step 1: 클라이언트 컴포넌트 작성**

```typescript
// web/src/app/restaurant/[id]/nearby-sections.tsx
'use client'

import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

function filterOut(items: NearbyCard[], hidden: Set<string>): NearbyCard[] {
  return items.filter((i) => !hidden.has(i.id))
}

export function RestaurantNearbySections(
  { cafes, spots }: { cafes: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])

  return (
    <>
      <NearbySection title="근처 카페" items={filterOut(cafes, cafeHidden)} hrefPrefix="/cafe/" />
      <NearbySection title="근처 가볼 곳" items={filterOut(spots, spotHidden)} hrefPrefix="/spot/" />
    </>
  )
}
```

- [ ] **Step 2: `page.tsx`에 배치**

`web/src/app/restaurant/[id]/page.tsx`에서 `import { WishHeart } from './wish-heart'` 아래에 추가:

```typescript
import { RestaurantNearbySections } from './nearby-sections'
import { nearbyForRestaurant } from '@/lib/restaurant-site'
```

주차 정보 `<dl>` 다음, 주차 안내 `<section>` 앞에 추가:

```typescript
      {(() => {
        const nearby = nearbyForRestaurant(restaurant.id)
        return nearby ? (
          <RestaurantNearbySections cafes={nearby.cafes} spots={nearby.spots} />
        ) : null
      })()}
```

- [ ] **Step 3: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add web/src/app/restaurant/[id]/nearby-sections.tsx web/src/app/restaurant/[id]/page.tsx
git commit -m "feat(nearby): 식당 상세 페이지에 근처 카페·가볼 곳 섹션 배치"
```

---

### Task 8: 가볼 곳 상세 페이지에 근처 추천 배치

**Files:**
- Create: `web/src/app/spot/[id]/nearby-sections.tsx`
- Modify: `web/src/app/spot/[id]/page.tsx`

**Interfaces:**
- Consumes: `nearbyForSpot` from `@/lib/spot-site` (Task 4), `NearbySection` from `../../nearby-card` (Task 5), `useWishlist`/`useBlacklist`/`useDismissed`(카페), `useRestaurantBlacklist`/`useRestaurantDismissed`(식당) — 전부 이미 존재

- [ ] **Step 1: 클라이언트 컴포넌트 작성**

```typescript
// web/src/app/spot/[id]/nearby-sections.tsx
'use client'

import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

function filterOut(items: NearbyCard[], hidden: Set<string>): NearbyCard[] {
  return items.filter((i) => !hidden.has(i.id))
}

export function SpotNearbySections(
  { cafes, restaurants }: { cafes: NearbyCard[]; restaurants: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const restHidden = new Set([...restBlacklisted, ...restDismissed])

  return (
    <>
      <NearbySection title="근처 카페" items={filterOut(cafes, cafeHidden)} hrefPrefix="/cafe/" />
      <NearbySection title="근처 식당" items={filterOut(restaurants, restHidden)} hrefPrefix="/restaurant/" />
    </>
  )
}
```

- [ ] **Step 2: `page.tsx`에 배치**

`web/src/app/spot/[id]/page.tsx`에서 `import { WishHeart } from './wish-heart'` 아래에 추가:

```typescript
import { SpotNearbySections } from './nearby-sections'
import { nearbyForSpot } from '@/lib/spot-site'
```

`<dl>`(태그·주차·이동 등을 나열) 다음, 주차 `<section>` 앞에 추가:

```typescript
      {(() => {
        const nearby = nearbyForSpot(spot.id)
        return nearby ? (
          <SpotNearbySections cafes={nearby.cafes} restaurants={nearby.restaurants} />
        ) : null
      })()}
```

- [ ] **Step 3: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add web/src/app/spot/[id]/nearby-sections.tsx web/src/app/spot/[id]/page.tsx
git commit -m "feat(nearby): 가볼 곳 상세 페이지에 근처 카페·식당 섹션 배치"
```

---

### Task 9: 실측 빌드 + 전체 검증

**Files:** 없음(검증 전용 태스크)

**Interfaces:**
- Consumes: Task 1~8 전부

- [ ] **Step 1: 실제 데이터로 근처 추천 3파일 생성**

Run: `npm run site`
Expected: 콘솔에 "근처 추천 3파일 생성 완료 (카페 N곳 · 식당 N곳 · 가볼 곳 N곳)" 출력, `web/src/generated/site-cafe-nearby.json`/`site-restaurant-nearby.json`/`site-spot-nearby.json` 실제 데이터로 갱신됨(Task 4에서 커밋한 `{}` 자리 대체)

- [ ] **Step 2: 생성된 파일 육안 확인**

Run: `node -e "const d=require('./web/src/generated/site-cafe-nearby.json'); const k=Object.keys(d)[0]; console.log(k, JSON.stringify(d[k], null, 2))"`
Expected: 어떤 카페 하나의 근처 식당·가볼 곳 목록이 `distanceKm` 오름차순으로 최대 5개씩 나온다. `driveMinutes` 필드가 없다.

- [ ] **Step 3: 전체 테스트 + 타입 검사 + 빌드**

Run: `npm test && npx tsc --noEmit && cd web && npx tsc --noEmit && npm test && npm run build`
Expected: 전부 통과, 빌드 성공(카페/식당/가볼 곳 상세 페이지 전부 정적 생성됨)

- [ ] **Step 4: 로컬 프리뷰로 실제 렌더링 확인**

`npm run dev`(web 디렉터리)로 로컬 서버를 띄우고, 판정 통과한 카페 하나의 상세 페이지에 접속해 "근처 식당"·"근처 가볼 곳" 섹션이 실제로 뜨는지, 카드 클릭 시 해당 도메인 상세 페이지로 이동하는지 브라우저로 직접 확인한다. 식당·가볼 곳 상세 페이지도 각각 한 번씩 같은 방식으로 확인한다.

- [ ] **Step 5: 근처 추천 데이터 커밋**

```bash
git add web/src/generated/site-cafe-nearby.json web/src/generated/site-restaurant-nearby.json web/src/generated/site-spot-nearby.json
git commit -m "chore(nearby): 실측 근처 추천 데이터로 갱신 (npm run site)"
```
