# 근처 추천 페이로드 용량 축소 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 근처 추천 3파일(19MB/10MB/2.7MB)을 관계 정보(`{id, distanceKm, driveMinutes}`)만 담게 줄이고, 표시 필드는 읽는 시점에 리스트 페이로드에서 id로 조회해 조립한다.

**Architecture:** 리스트 페이로드 3개(카페·식당·가볼 곳)에 위경도를 추가해, `directionsUrl` 계산을 build 시점(`src/site/nearby-payload.ts`)에서 read 시점(웹)으로 옮긴다. 근처 추천 파일은 더는 이름·이미지·태그·평점을 안 담고, 새 웹 모듈(`nearby-resolve.ts`)이 id로 리스트 페이로드를 조회해 기존과 똑같은 모양의 `NearbyCard`를 조립한다. 렌더링 컴포넌트(`nearby-card.tsx` 등)는 무변경.

**Tech Stack:** TypeScript, Zod(스키마), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-nearby-payload-size-design.md`

## Global Constraints

- 근처 추천 파일에 저장하는 건 `{id, distanceKm, driveMinutes}` 세 필드뿐 — 이름·이미지·태그·평점·`directionsUrl`은 저장하지 않는다.
- `directionsUrl`은 read 시점(웹)에서 계산한다. 계산 공식은 기존과 **동일**(좌표 뒤에 이름 붙이는 3차 시도 형식, `https://map.naver.com/p/directions/{lng},{lat},{name}/{lng},{lat},{name}/-/car`).
- 웹(`web/`)은 `src/`(백엔드 패키지)를 import할 수 없다 — Vercel이 `web/`에서만 설치해서 `zod`를 못 찾는다(기존에 실측된 배포 실패 2회, `web/src/lib/site-types.ts` 주석 참고). 그래서 `directionsUrl` 계산 함수는 웹 쪽에 **새로 작성**한다(기존 함수를 지우고 옮기는 게 아니라, 같은 로직을 두 번 쓴다).
- `nearby-card.tsx`·`nearby-sections.tsx`(3개)·`course-section.tsx`는 이 계획에서 전혀 안 건드린다.
- 리스트 페이로드 zod 스키마(`SiteCafeSchema` 등)를 바꾸면 웹 쪽 타입 미러(`web/src/lib/site-types.ts` 등)도 **같이** 바꿔야 한다 — `tests/site/types-conformance.test.ts`(그리고 식당·가볼 곳용 두 자매 파일)가 타입 수준에서 이 둘의 상호 대입 가능성을 검사해서, 하나만 바꾸면 `npx tsc --noEmit`이 깨진다.

---

### Task 1: 리스트 페이로드에 위경도 추가

**Files:**
- Modify: `src/schema.ts:233` (`SiteCafeSchema`)
- Modify: `src/restaurant-schema.ts:63` (`SiteRestaurantSchema`)
- Modify: `src/spot-schema.ts:64` (`SiteSpotSchema`)
- Modify: `src/site/payload.ts:196` (행 생성부)
- Modify: `src/site/restaurant-payload.ts:137` (행 생성부)
- Modify: `src/site/spot-payload.ts:134` (행 생성부)
- Modify: `web/src/lib/site-types.ts:15` (`SiteCafe` 인터페이스)
- Modify: `web/src/lib/restaurant-site-types.ts:7` (`SiteRestaurant` 인터페이스)
- Modify: `web/src/lib/spot-site-types.ts` (`SiteSpot` 인터페이스, `id` 필드 다음)

**Interfaces:**
- Produces: `SiteCafe.lat: number`, `SiteCafe.lng: number` (그리고 식당·가볼 곳도 동일) — Task 4의 웹 리졸버가 이 필드로 `directionsUrl`을 계산한다.

이 태스크는 새 테스트를 추가하지 않는다 — 기존 `tests/site/types-conformance.test.ts`(3개)가 스키마와 웹 타입이 어긋나면 컴파일 자체를 막아주고, 기존 `tests/site/payload.test.ts` 등은 필드 단위로만 검증해서(`c.id`처럼) 새 필드가 생겨도 안 깨진다. 검증은 typecheck + 기존 전체 테스트로 한다.

- [ ] **Step 1: `SiteCafeSchema`에 필드 추가**

`src/schema.ts`의 `id: z.string(),`(233번 줄) 바로 다음 줄에 추가:

```typescript
  lat: z.number(),
  lng: z.number(),
```

- [ ] **Step 2: `SiteRestaurantSchema`에 동일하게 추가**

`src/restaurant-schema.ts`의 `id: z.string(),`(63번 줄) 다음:

```typescript
  lat: z.number(),
  lng: z.number(),
```

- [ ] **Step 3: `SiteSpotSchema`에 동일하게 추가**

`src/spot-schema.ts`의 `id: z.string(),`(64번 줄) 다음:

```typescript
  lat: z.number(),
  lng: z.number(),
```

- [ ] **Step 4: 카페 payload 빌더에서 값 채우기**

`src/site/payload.ts`의 `id: c.kakaoPlaceId,`(196번 줄) 다음 줄에 추가:

```typescript
      lat: c.lat,
      lng: c.lng,
```

(`c`는 이미 그 스코프에서 원본 `Cafe` 레코드를 가리키는 변수다 — `c.lat`/`c.lng`는 이미 존재하는 필드를 그대로 옮기는 것뿐이다.)

- [ ] **Step 5: 식당 payload 빌더에서 값 채우기**

`src/site/restaurant-payload.ts`의 `id: r.kakaoPlaceId,`(137번 줄) 다음:

```typescript
      lat: r.lat,
      lng: r.lng,
```

- [ ] **Step 6: 가볼 곳 payload 빌더에서 값 채우기**

`src/site/spot-payload.ts`의 `id: s.kakaoPlaceId,`(134번 줄) 다음:

```typescript
      lat: s.lat,
      lng: s.lng,
```

- [ ] **Step 7: 웹 쪽 `SiteCafe` 타입 미러에 추가**

`web/src/lib/site-types.ts`의 `export interface SiteCafe {`(14번 줄) 바로 다음, `id: string`(15번 줄) 다음에 추가:

```typescript
  lat: number
  lng: number
```

- [ ] **Step 8: 웹 쪽 `SiteRestaurant` 타입 미러에 추가**

`web/src/lib/restaurant-site-types.ts`의 `id: string`(7번 줄) 다음:

```typescript
  lat: number
  lng: number
```

- [ ] **Step 9: 웹 쪽 `SiteSpot` 타입 미러에 추가**

`web/src/lib/spot-site-types.ts`의 `export interface SiteSpot {`(6번 줄) 다음, `id: string`(7번 줄) 다음에 추가:

```typescript
  lat: number
  lng: number
```

- [ ] **Step 10: 타입 검사 + 전체 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 없음, 기존 테스트 전부 PASS(root). 이 스텝이 `types-conformance` 테스트 3개가 실제로 통과하는지도 함께 확인한다 — 만약 Step 7~9 중 하나라도 빠뜨렸으면 여기서 타입 에러로 걸린다.

Run: `cd web && npx tsc --noEmit && npm test`
Expected: 에러 없음, 기존 테스트 전부 PASS(web)

- [ ] **Step 11: Commit**

```bash
git add src/schema.ts src/restaurant-schema.ts src/spot-schema.ts src/site/payload.ts src/site/restaurant-payload.ts src/site/spot-payload.ts web/src/lib/site-types.ts web/src/lib/restaurant-site-types.ts web/src/lib/spot-site-types.ts
git commit -m "feat(nearby-payload-size): 리스트 페이로드 3개에 위경도 추가"
```

---

### Task 2: `nearby-payload.ts` — 저장 형식을 `NearbyRelation`으로 축소

**Files:**
- Modify: `src/site/nearby-payload.ts` (전체 재작성 수준)
- Modify: `tests/site/nearby-payload.test.ts` (전체 재작성)

**Interfaces:**
- Consumes: `Task 1`의 `SiteCafe.lat/lng` 등(이제 site 페이로드만으로 좌표를 얻는다)
- Produces: `NearbyRelation { id: string; distanceKm: number; driveMinutes: number | null }`, `BuildNearbyInput { cafeSite: SiteCafe[]; restaurantSite: SiteRestaurant[]; spotSite: SiteSpot[]; driveCache: NearbyDrivePair[]; preLimit: number; limit: number }`(주의: `cafes`/`restaurants`/`spots` 원본 배열 입력이 **사라진다**), `NearbyPayloads { cafe: Record<string, { restaurants: NearbyRelation[]; spots: NearbyRelation[] }>; restaurant: Record<string, { cafes: NearbyRelation[]; spots: NearbyRelation[] }>; spot: Record<string, { cafes: NearbyRelation[]; restaurants: NearbyRelation[] }> }`, `buildNearbyPayloads(input: BuildNearbyInput): NearbyPayloads`(시그니처만 바뀜, 이름은 그대로)

이 태스크는 파일 하나를 사실상 다시 쓰는 것과 기존 테스트 파일을 다시 쓰는 것, 두 개를 같이 한다 — 기존 테스트 다수가 지금 형식(`NearbyCard`, `directionsUrl` 포함)을 검증하고 있어서 반쯤은 무의미해지기 때문이다.

- [ ] **Step 1: 실패하는 테스트로 전체 교체**

`tests/site/nearby-payload.test.ts`를 통째로 아래 내용으로 교체한다:

```typescript
// tests/site/nearby-payload.test.ts
import { describe, it, expect } from 'vitest'
import { buildNearbyPayloads } from '../../src/site/nearby-payload.js'
import type { SiteCafe } from '../../src/schema.js'
import type { SiteRestaurant } from '../../src/restaurant-schema.js'
import type { SiteSpot } from '../../src/spot-schema.js'
import type { NearbyDrivePair } from '../../src/schema.js'

function siteCafe(over: Partial<{ id: string; lat: number; lng: number; cityOnly: boolean }> = {}) {
  return {
    id: over.id ?? 'c1', name: '카페', sigungu: '부평구', zone: 'near',
    area: '인천', driveMinutes: 10, lat: over.lat ?? 37.5, lng: over.lng ?? 126.9,
    scale: null, parkingGrade: 'A', menuLevel: 1,
    tags: [], evidence: '', parkingEvidence: '', signatureMenu: null,
    viewTypes: [], mealTypes: [], outdoorSeating: null, teenAppeal: null,
    stayDuration: null, naverMapUrl: '', kakaoPlaceUrl: null, imageUrl: null,
    hotScore: 0, finalScore: 0, postsPer30: 0, posts30: 0, posts90: 0,
    acceleration: 0, trend: 'unknown', ratingAvg: 0, ratingCount: 0,
    familyReviews: [], cityOnly: over.cityOnly ?? false, visitedOn: null,
    firstSeenAt: '2026-01-01', isNew: false, lastSeenAt: null,
  } as unknown as SiteCafe
}

function siteRestaurant(
  over: Partial<{ id: string; lat: number; lng: number; cityOnly: boolean }> = {},
) {
  return {
    id: over.id ?? 'r1', name: '식당', sigungu: '부평구',
    lat: over.lat ?? 37.501, lng: over.lng ?? 126.901,
    imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0,
    cityOnly: over.cityOnly ?? false,
  } as unknown as SiteRestaurant
}

function siteSpot(over: Partial<{ id: string; lat: number; lng: number; cityOnly: boolean }> = {}) {
  return {
    id: over.id ?? 's1', name: '가볼곳', sigungu: '부평구',
    lat: over.lat ?? 37.502, lng: over.lng ?? 126.902,
    imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0,
    cityOnly: over.cityOnly ?? false,
  } as unknown as SiteSpot
}

describe('buildNearbyPayloads', () => {
  it('카페 앵커 기준으로 가까운 식당·가볼곳을 관계 정보로 채운다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [siteRestaurant({ id: 'r1' })],
      spotSite: [siteSpot({ id: 's1' })],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toHaveLength(1)
    expect(result.cafe.c1!.restaurants[0]).toEqual({ id: 'r1', distanceKm: expect.any(Number), driveMinutes: null })
    expect(result.cafe.c1!.spots).toHaveLength(1)
    expect(result.restaurant.r1!.cafes[0]!.id).toBe('c1')
    expect(result.spot.s1!.cafes[0]!.id).toBe('c1')
  })

  it('cityOnly 후보는 제외한다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [siteRestaurant({ id: 'r1', cityOnly: true })],
      spotSite: [],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toEqual([])
  })

  it('cityOnly 앵커도 자기 키는 갖지만, 다른 곳의 후보에는 안 낀다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1', cityOnly: true })],
      restaurantSite: [siteRestaurant({ id: 'r1' })],
      spotSite: [],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1).toBeDefined()
    expect(result.cafe.c1!.restaurants).toHaveLength(1)
    expect(result.restaurant.r1!.cafes).toEqual([])
  })

  it('site 배열이 비어있으면 그 도메인 관련 결과가 빈 배열이다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [],
      spotSite: [],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1!.restaurants).toEqual([])
    expect(result.cafe.c1!.spots).toEqual([])
  })

  it('캐시에 실측이 있으면 driveMinutes를 채우고, 없으면 null이다', () => {
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [siteRestaurant({ id: 'r1' })],
      spotSite: [],
      driveCache: [], preLimit: 10, limit: 5,
    })
    expect(result.cafe.c1!.restaurants[0]).toEqual({ id: 'r1', distanceKm: expect.any(Number), driveMinutes: null })
  })

  it('실측 페어가 있으면 그 값 기준으로 재정렬한다(직선거리 순서와 달라도)', () => {
    const near = siteRestaurant({ id: 'near', lat: 37.501, lng: 126.901 })
    const far = siteRestaurant({ id: 'far', lat: 37.502, lng: 126.902 })
    const driveCache: NearbyDrivePair[] = [
      { pairKey: 'c1:far', minutes: 3, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
      { pairKey: 'c1:near', minutes: 30, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
    ]
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [near, far],
      spotSite: [],
      driveCache, preLimit: 10, limit: 5,
    })
    const ids = result.cafe.c1!.restaurants.map((r) => r.id)
    expect(ids[0]).toBe('far')
    expect(ids[1]).toBe('near')
    expect(result.cafe.c1!.restaurants[0]!.driveMinutes).toBe(3)
  })

  it('preLimit으로 직선거리 1차 후보를 좁힌 뒤에만 재정렬한다', () => {
    const near = siteRestaurant({ id: 'near', lat: 37.501, lng: 126.901 })
    const far = siteRestaurant({ id: 'far', lat: 38.5, lng: 127.9 })
    const driveCache: NearbyDrivePair[] = [
      { pairKey: 'c1:far', minutes: 1, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
    ]
    const result = buildNearbyPayloads({
      cafeSite: [siteCafe({ id: 'c1' })],
      restaurantSite: [near, far],
      spotSite: [],
      driveCache, preLimit: 1, limit: 5,
    })
    expect(result.cafe.c1!.restaurants.map((r) => r.id)).toEqual(['near'])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- tests/site/nearby-payload.test.ts`
Expected: FAIL (타입 에러 — `BuildNearbyInput`이 아직 `cafes`/`restaurants`/`spots`를 요구하고, `NearbyCard` 출력이 `{id, distanceKm, driveMinutes}` 모양과 안 맞음)

- [ ] **Step 3: `src/site/nearby-payload.ts` 전체 교체**

```typescript
// src/site/nearby-payload.ts
import { nearestByDomain, type GeoPoint, type NearbyMatch } from './nearby.js'
import { buildPairIndex, lookupPair } from './nearby-drive-cache.js'
import { estimateDriveMinutes } from '../pipeline/geo.js'
import type { SiteCafe, NearbyDrivePair } from '../schema.js'
import type { SiteRestaurant } from '../restaurant-schema.js'
import type { SiteSpot } from '../spot-schema.js'

/** 근처 추천 파일에 실제로 저장하는 것 — 관계 정보뿐이다. 표시 필드(이름·
 * 이미지·태그·평점)와 directionsUrl 은 read 시점(웹)에서 리스트 페이로드를
 * id 로 조회해 조립한다(용량 축소 스펙 참고). */
export interface NearbyRelation {
  id: string
  distanceKm: number
  /** 실측 있으면 분 단위, 없으면 null */
  driveMinutes: number | null
}

export interface BuildNearbyInput {
  cafeSite: SiteCafe[]
  restaurantSite: SiteRestaurant[]
  spotSite: SiteSpot[]
  driveCache: NearbyDrivePair[]
  /** 직선거리 1차 필터 개수(2단계 K). 그 안에서만 실측 기준 재정렬한다 */
  preLimit: number
  limit: number
}

export interface NearbyPayloads {
  cafe: Record<string, { restaurants: NearbyRelation[]; spots: NearbyRelation[] }>
  restaurant: Record<string, { cafes: NearbyRelation[]; spots: NearbyRelation[] }>
  spot: Record<string, { cafes: NearbyRelation[]; restaurants: NearbyRelation[] }>
}

/**
 * site 페이로드에서 좌표만 뽑는다. 이제 site 페이로드 자체에 위경도가
 * 있으므로(용량 축소 스펙) 원본 배열과의 join이 필요 없다.
 *
 * `opts.excludeCityOnly`: 후보(다른 곳에 추천되는 쪽)를 만들 때는 true —
 * 도심 모드를 한 번도 안 켠 사용자에게 주차 어려운 곳이 섞여 들어가면
 * 안 된다. 앵커(자기 자신의 상세 페이지)를 만들 때는 false.
 */
function toGeoPoints(
  site: { id: string; lat: number; lng: number; cityOnly: boolean }[],
  opts: { excludeCityOnly: boolean },
): GeoPoint[] {
  const points: GeoPoint[] = []
  for (const s of site) {
    if (opts.excludeCityOnly && s.cityOnly) continue
    points.push({ id: s.id, lat: s.lat, lng: s.lng })
  }
  return points
}

/**
 * `directionsUrl`은 이제 여기서 계산하지 않는다 — 위경도가 있어야
 * 계산할 수 있는데, 그 위경도를 쓸 대상(앵커의 이름 등 표시 필드)이
 * read 시점 조립으로 옮겨갔기 때문이다. 캐시 조회는 id 문자열 두 개만
 * 있으면 되므로(`lookupPair`), 앵커도 `GeoCard` 객체가 아니라 id
 * 문자열로만 받는다.
 */
function toCards(
  anchorId: string,
  matches: NearbyMatch[],
  driveIndex: Map<string, NearbyDrivePair>,
  finalLimit: number,
): NearbyRelation[] {
  const withRank = matches.map((m) => {
    const hit = lookupPair(driveIndex, anchorId, m.id)
    const rankMinutes = hit ? hit.minutes : estimateDriveMinutes(m.distanceKm)
    return {
      relation: { id: m.id, distanceKm: m.distanceKm, driveMinutes: hit ? hit.minutes : null },
      rankMinutes,
    }
  })
  withRank.sort((a, b) => a.rankMinutes - b.rankMinutes)
  return withRank.slice(0, finalLimit).map((x) => x.relation)
}

/** anchors 각 항목에 대해 candidates 중 가까운 순 관계 목록을 만든다 */
function nearbyMap(
  anchors: GeoPoint[],
  candidates: GeoPoint[],
  driveIndex: Map<string, NearbyDrivePair>,
  preLimit: number,
  finalLimit: number,
): Map<string, NearbyRelation[]> {
  const matches = nearestByDomain(anchors, candidates, preLimit)
  const result = new Map<string, NearbyRelation[]>()
  for (const [anchorId, m] of matches) {
    result.set(anchorId, toCards(anchorId, m, driveIndex, finalLimit))
  }
  return result
}

export function buildNearbyPayloads(input: BuildNearbyInput): NearbyPayloads {
  const { cafeSite, restaurantSite, spotSite, driveCache, preLimit, limit } = input
  const driveIndex = buildPairIndex(driveCache)

  const cafeAnchors = toGeoPoints(cafeSite, { excludeCityOnly: false })
  const cafeCands = toGeoPoints(cafeSite, { excludeCityOnly: true })
  const restAnchors = toGeoPoints(restaurantSite, { excludeCityOnly: false })
  const restCands = toGeoPoints(restaurantSite, { excludeCityOnly: true })
  const spotAnchors = toGeoPoints(spotSite, { excludeCityOnly: false })
  const spotCands = toGeoPoints(spotSite, { excludeCityOnly: true })

  const cafeToRest = nearbyMap(cafeAnchors, restCands, driveIndex, preLimit, limit)
  const cafeToSpot = nearbyMap(cafeAnchors, spotCands, driveIndex, preLimit, limit)
  const restToCafe = nearbyMap(restAnchors, cafeCands, driveIndex, preLimit, limit)
  const restToSpot = nearbyMap(restAnchors, spotCands, driveIndex, preLimit, limit)
  const spotToCafe = nearbyMap(spotAnchors, cafeCands, driveIndex, preLimit, limit)
  const spotToRest = nearbyMap(spotAnchors, restCands, driveIndex, preLimit, limit)

  const cafe: NearbyPayloads['cafe'] = {}
  for (const c of cafeAnchors) {
    cafe[c.id] = { restaurants: cafeToRest.get(c.id) ?? [], spots: cafeToSpot.get(c.id) ?? [] }
  }
  const restaurant: NearbyPayloads['restaurant'] = {}
  for (const r of restAnchors) {
    restaurant[r.id] = { cafes: restToCafe.get(r.id) ?? [], spots: restToSpot.get(r.id) ?? [] }
  }
  const spot: NearbyPayloads['spot'] = {}
  for (const s of spotAnchors) {
    spot[s.id] = { cafes: spotToCafe.get(s.id) ?? [], restaurants: spotToRest.get(s.id) ?? [] }
  }

  return { cafe, restaurant, spot }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- tests/site/nearby-payload.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 타입 검사 + 전체 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 없음. **주의**: `src/cli/run.ts`가 아직 옛 `buildNearbyPayloads` 시그니처(`cafes`/`restaurants`/`spots` 포함)로 호출하고 있어서 여기서 타입 에러가 난다 — Task 3에서 고친다. 이 스텝에서 `src/cli/run.ts` 관련 에러가 나는 건 정상이니 놀라지 말고, `tests/site/nearby-payload.test.ts`가 통과하는지와 그 외 다른 파일에서 예상 못한 에러가 없는지만 확인한다.

- [ ] **Step 6: Commit**

```bash
git add src/site/nearby-payload.ts tests/site/nearby-payload.test.ts
git commit -m "feat(nearby-payload-size): NearbyCard -> NearbyRelation, directionsUrl 계산 제거"
```

---

### Task 3: `case 'site':` 호출부 갱신

**Files:**
- Modify: `src/cli/run.ts`

**Interfaces:**
- Consumes: `buildNearbyPayloads`(Task 2, 새 시그니처 — `cafes`/`restaurants`/`spots` 인자 없음)

Task 2 이후 타입 에러가 나 있던 지점을 고친다. 이 태스크는 새 테스트를 추가하지 않는다 — 1단계 계획의 CLI 배선 태스크와 같은 이유(순수 배선, 실측 빌드로 검증).

- [ ] **Step 1: 호출부 수정**

`src/cli/run.ts`에서 `buildNearbyPayloads(` 호출부를 찾아(`grep -n "buildNearbyPayloads(" src/cli/run.ts`로 정확한 위치 확인 — 이 계획 작성 시점 기준 근처 추천 try 블록 안) 교체:

```typescript
        const driveCache = await store.readNearbyDriveCache()
        const nearby = buildNearbyPayloads({
          cafeSite: payload.cafes,
          restaurantSite: outerRestPayload?.restaurants ?? [],
          spotSite: outerSpotPayload?.spots ?? [],
          driveCache,
          preLimit: 10,
          limit: 5,
        })
```

`outerRestaurants`/`outerSpots`는 이 호출(옛 528번 줄)이 유일한 사용처였다 — `cafes`(447번 줄, `buildSitePayload`가 여전히 쓴다)는 그대로 두되, `outerRestaurants`/`outerSpots`는 이제 안 쓰는 변수가 되므로 선언과 대입 지점을 전부 지운다:

- `let outerRestaurants: ... = []`(443번 줄) 선언 삭제
- `let outerSpots: ... = []`(445번 줄) 선언 삭제
- `outerRestaurants = restaurants`(481번 줄) 대입 삭제
- `outerSpots = spots`(507번 줄) 대입 삭제

(정확한 현재 줄 번호는 `grep -n "outerRestaurants\|outerSpots" src/cli/run.ts`로 재확인 후 지운다 — Task 1~2에서 이 파일 자체는 안 바뀌었으니 위 줄 번호가 그대로일 가능성이 높다.)

- [ ] **Step 2: 타입 검사 + 전체 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 없음, 전부 PASS

- [ ] **Step 3: Commit**

```bash
git add src/cli/run.ts
git commit -m "feat(nearby-payload-size): case 'site': 가 축소된 buildNearbyPayloads 시그니처를 쓰도록 갱신"
```

---

### Task 4: 웹 리졸버 신설 — `nearby-resolve.ts`

**Files:**
- Create: `web/src/lib/nearby-resolve.ts`
- Test: `web/src/lib/nearby-resolve.test.ts`

**Interfaces:**
- Consumes: `payload` from `./site.js`(기존, 이제 `lat`/`lng` 포함), `restaurantPayload` from `./restaurant-site.js`(기존), `spotPayload` from `./spot-site.js`(기존), `NearbyCard` type from `./nearby-types.js`(기존, 무변경)
- Produces: `Domain = 'cafe' | 'restaurant' | 'spot'`, `NearbyRelation { id: string; distanceKm: number; driveMinutes: number | null }`, `resolveNearbyCards(anchorDomain: Domain, anchorId: string, candidateDomain: Domain, relations: NearbyRelation[]): NearbyCard[]`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// web/src/lib/nearby-resolve.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../generated/site.json', () => ({
  default: {
    cafes: [{
      id: 'c1', name: '카페', lat: 37.5, lng: 126.9, imageUrl: 'c.jpg',
      tags: ['대형'], sigungu: '부평구', ratingAvg: 4, ratingCount: 2, cityOnly: false,
    }],
  },
}))
vi.mock('../generated/site-cafe-nearby.json', () => ({ default: {} }))
vi.mock('../generated/site-restaurant.json', () => ({
  default: {
    restaurants: [{
      id: 'r1', name: '식당', lat: 37.501, lng: 126.901, imageUrl: 'r.jpg',
      tags: ['한식'], sigungu: '부평구', ratingAvg: 0, ratingCount: 0, cityOnly: false,
    }],
  },
}))
vi.mock('../generated/site-restaurant-nearby.json', () => ({ default: {} }))
vi.mock('../generated/site-spot.json', () => ({ default: { spots: [] } }))
vi.mock('../generated/site-spot-nearby.json', () => ({ default: {} }))

const { resolveNearbyCards } = await import('./nearby-resolve')

describe('resolveNearbyCards', () => {
  it('id로 리스트 페이로드를 찾아 NearbyCard 모양으로 조립한다', () => {
    const out = resolveNearbyCards('cafe', 'c1', 'restaurant', [
      { id: 'r1', distanceKm: 0.5, driveMinutes: 3 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      id: 'r1', name: '식당', imageUrl: 'r.jpg', tags: ['한식'], sigungu: '부평구',
      ratingAvg: 0, ratingCount: 0, distanceKm: 0.5, driveMinutes: 3,
      directionsUrl: 'https://map.naver.com/p/directions/126.9,37.5,%EC%B9%B4%ED%8E%98/126.901,37.501,%EC%8B%9D%EB%8B%B9/-/car',
    })
  })

  it('앵커를 못 찾으면 빈 배열을 돌려준다', () => {
    const out = resolveNearbyCards('cafe', '없는id', 'restaurant', [
      { id: 'r1', distanceKm: 0.5, driveMinutes: 3 },
    ])
    expect(out).toEqual([])
  })

  it('후보 중 일부를 못 찾으면 그 항목만 건너뛴다', () => {
    const out = resolveNearbyCards('cafe', 'c1', 'restaurant', [
      { id: 'r1', distanceKm: 0.5, driveMinutes: 3 },
      { id: '없는id', distanceKm: 1, driveMinutes: 5 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('r1')
  })

  it('driveMinutes가 null이어도 정상 조립된다(distanceKm 폴백용)', () => {
    const out = resolveNearbyCards('cafe', 'c1', 'restaurant', [
      { id: 'r1', distanceKm: 0.5, driveMinutes: null },
    ])
    expect(out[0]!.driveMinutes).toBeNull()
    expect(out[0]!.distanceKm).toBe(0.5)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npm test -- nearby-resolve.test.ts`
Expected: FAIL — `Cannot find module './nearby-resolve'`

- [ ] **Step 3: 구현**

```typescript
// web/src/lib/nearby-resolve.ts
import { payload as cafePayload } from './site'
import { restaurantPayload } from './restaurant-site'
import { spotPayload } from './spot-site'
import type { NearbyCard } from './nearby-types'

export type Domain = 'cafe' | 'restaurant' | 'spot'

export interface NearbyRelation {
  id: string
  distanceKm: number
  driveMinutes: number | null
}

interface ResolvedPoint {
  id: string
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
  lat: number
  lng: number
}

/**
 * 도메인별 id -> 표시 필드 색인. 모듈 로드 시 한 번만 만든다 — site 빌드가
 * 정적 페이지를 수천 장 찍어내는 동안 이 조회가 페이지마다 반복되므로,
 * `nearby-drive-cache.ts`의 `buildPairIndex`와 같은 이유로 선형 탐색을
 * 피한다(기존 `byId`/`restaurantById`/`spotById`는 `.find()`라서 여기선
 * 안 쓴다).
 */
const cafeIndex = new Map<string, ResolvedPoint>(cafePayload.cafes.map((c) => [c.id, c]))
const restaurantIndex = new Map<string, ResolvedPoint>(
  restaurantPayload.restaurants.map((r) => [r.id, r]),
)
const spotIndex = new Map<string, ResolvedPoint>(spotPayload.spots.map((s) => [s.id, s]))

function indexOf(domain: Domain): Map<string, ResolvedPoint> {
  if (domain === 'cafe') return cafeIndex
  if (domain === 'restaurant') return restaurantIndex
  return spotIndex
}

/**
 * 두 지점 간 네이버지도 자동차 길찾기 웹 URL.
 *
 * `src/site/nearby-payload.ts`에 있던 것과 **동일한 공식**이다 — build
 * 시점 계산을 여기(read 시점)로 옮기면서 그대로 복사했다. 웹은 `src/`를
 * import할 수 없어서(zod 의존성 때문에 Vercel 배포가 실패한 전례가
 * 있다) 공유하지 않고 각자 갖는다. 형식 자체를 다시 바꿔야 하면 두 곳
 * 다 고쳐야 한다는 뜻이다.
 */
function directionsUrl(anchor: ResolvedPoint, dest: ResolvedPoint): string {
  const seg = (p: ResolvedPoint) => `${p.lng},${p.lat},${encodeURIComponent(p.name)}`
  return `https://map.naver.com/p/directions/${seg(anchor)}/${seg(dest)}/-/car`
}

export function resolveNearbyCards(
  anchorDomain: Domain,
  anchorId: string,
  candidateDomain: Domain,
  relations: NearbyRelation[],
): NearbyCard[] {
  const anchor = indexOf(anchorDomain).get(anchorId)
  if (!anchor) return []
  const candIndex = indexOf(candidateDomain)
  return relations.flatMap((rel) => {
    const c = candIndex.get(rel.id)
    if (!c) return []
    return [{
      id: c.id, name: c.name, imageUrl: c.imageUrl, tags: c.tags, sigungu: c.sigungu,
      ratingAvg: c.ratingAvg, ratingCount: c.ratingCount,
      distanceKm: rel.distanceKm, driveMinutes: rel.driveMinutes,
      directionsUrl: directionsUrl(anchor, c),
    }]
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npm test -- nearby-resolve.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/nearby-resolve.ts web/src/lib/nearby-resolve.test.ts
git commit -m "feat(nearby-payload-size): read 시점에 id로 근처 카드를 조립하는 리졸버"
```

---

### Task 5: 웹 lib 3개 — `nearbyForX`가 리졸버를 쓰도록 교체

**Files:**
- Modify: `web/src/lib/site.ts:76-78`
- Modify: `web/src/lib/restaurant-site.ts:71-73`
- Modify: `web/src/lib/spot-site.ts:42-44`

**Interfaces:**
- Consumes: `resolveNearbyCards`, `type NearbyRelation` from `./nearby-resolve.js`(Task 4)
- Produces: `nearbyForCafe`/`nearbyForRestaurant`/`nearbyForSpot` — **반환 타입은 기존과 동일**(`{ restaurants: NearbyCard[]; spots: NearbyCard[] } | undefined` 등). `nearby-sections.tsx` 3개는 이 태스크에서 손대지 않는다.

세 파일이 완전히 같은 모양으로 바뀌는 작은 수정이라 한 태스크로 묶는다. 새 테스트는 추가하지 않는다 — 이 함수들의 실제 동작(리스트 조회 + 조립)은 Task 4의 `nearby-resolve.test.ts`가 이미 검증했고, 여기는 그 함수를 부르기만 하는 배선이다. Task 6의 실측 빌드로 최종 확인한다.

- [ ] **Step 1: `web/src/lib/site.ts` 수정**

`import nearbyRaw from '../generated/site-cafe-nearby.json'`(2번 줄) 다음에 추가:

```typescript
import { resolveNearbyCards, type NearbyRelation } from './nearby-resolve'
```

`const cafeNearby = nearbyRaw as unknown as Record<string, { restaurants: NearbyCard[]; spots: NearbyCard[] }>`
`export const nearbyForCafe = (id: string) => cafeNearby[id]`
(76~78번 줄) 두 줄을 아래로 교체:

```typescript
const cafeNearby = nearbyRaw as unknown as Record<string, { restaurants: NearbyRelation[]; spots: NearbyRelation[] }>

export function nearbyForCafe(id: string) {
  const raw = cafeNearby[id]
  if (!raw) return undefined
  return {
    restaurants: resolveNearbyCards('cafe', id, 'restaurant', raw.restaurants),
    spots: resolveNearbyCards('cafe', id, 'spot', raw.spots),
  }
}
```

- [ ] **Step 2: `web/src/lib/restaurant-site.ts` 수정**

`import nearbyRaw from '../generated/site-restaurant-nearby.json'`(2번 줄) 다음에 추가:

```typescript
import { resolveNearbyCards, type NearbyRelation } from './nearby-resolve'
```

`const restaurantNearby = ...`/`export const nearbyForRestaurant = ...`(71~73번 줄)을 교체:

```typescript
const restaurantNearby = nearbyRaw as unknown as Record<string, { cafes: NearbyRelation[]; spots: NearbyRelation[] }>

export function nearbyForRestaurant(id: string) {
  const raw = restaurantNearby[id]
  if (!raw) return undefined
  return {
    cafes: resolveNearbyCards('restaurant', id, 'cafe', raw.cafes),
    spots: resolveNearbyCards('restaurant', id, 'spot', raw.spots),
  }
}
```

- [ ] **Step 3: `web/src/lib/spot-site.ts` 수정**

`import nearbyRaw from '../generated/site-spot-nearby.json'`(2번 줄) 다음에 추가:

```typescript
import { resolveNearbyCards, type NearbyRelation } from './nearby-resolve'
```

`const spotNearby = ...`/`export const nearbyForSpot = ...`(42~44번 줄)을 교체:

```typescript
const spotNearby = nearbyRaw as unknown as Record<string, { cafes: NearbyRelation[]; restaurants: NearbyRelation[] }>

export function nearbyForSpot(id: string) {
  const raw = spotNearby[id]
  if (!raw) return undefined
  return {
    cafes: resolveNearbyCards('spot', id, 'cafe', raw.cafes),
    restaurants: resolveNearbyCards('spot', id, 'restaurant', raw.restaurants),
  }
}
```

- [ ] **Step 4: 타입 검사 + 전체 테스트**

Run: `cd web && npx tsc --noEmit && npm test`
Expected: 에러 없음, 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/site.ts web/src/lib/restaurant-site.ts web/src/lib/spot-site.ts
git commit -m "feat(nearby-payload-size): nearbyForX 가 리졸버로 조립하도록 배선"
```

---

### Task 6: 실측 검증 — 실제 빌드로 용량 확인 + 화면 회귀 확인

**Files:** 없음(검증 전용 태스크)

**Interfaces:**
- Consumes: Task 1~5 전부

- [ ] **Step 1: 실제 데이터로 다시 빌드**

Run: `npm run site`
Expected: 콘솔에 "근처 추천 3파일 생성 완료" 출력. 에러 없음(카카오 API 키 불필요 — 이 잡은 이미 있는 파일을 읽고 계산만 한다).

- [ ] **Step 2: 파일 크기 비교**

Run: `ls -la web/src/generated/site-*-nearby.json`
Expected: `site-restaurant-nearby.json`이 기존 19MB에서 크게 줄어듦(관계 정보 세 필드만 남았으니 대략 1/10 이하 수준일 것으로 예상 — 정확한 숫자는 실제 앵커·후보 수에 따라 다르다. 파일이 안 줄었으면 Task 2가 여전히 표시 필드를 담고 있다는 뜻이니 되짚어야 한다).

- [ ] **Step 3: 근처 추천 파일 내용 육안 확인**

Run: `node -e "const d=require('./web/src/generated/site-cafe-nearby.json'); const k=Object.keys(d)[0]; console.log(JSON.stringify(d[k].restaurants.slice(0,2)))"`
Expected: 각 항목이 `{id, distanceKm, driveMinutes}` 세 필드만 갖고 있다 — `name`/`imageUrl`/`directionsUrl`이 없다.

- [ ] **Step 4: 전체 테스트 + 타입 검사 + 웹 빌드**

Run: `npx tsc --noEmit && npm test && cd web && npx tsc --noEmit && npm test && npm run build`
Expected: 전부 통과, 빌드 성공

- [ ] **Step 5: 로컬 프리뷰로 실제 렌더링 확인 (회귀 확인)**

`npm run dev`(web 디렉터리)로 로컬 서버를 띄우고, 판정 통과한 카페 하나의 상세 페이지에서 "근처 식당"·"근처 가볼 곳" 섹션이 **이전과 똑같이** 이름·이미지·태그·평점·거리(또는 "차로 N분")·"차로 길찾기" 버튼까지 다 뜨는지 확인한다. 저장 형식만 바뀌었을 뿐 화면은 한 픽셀도 안 바뀌어야 하는 태스크다 — 뭔가 비어 보이거나 링크가 깨졌으면 Task 4/5의 조립 로직을 되짚는다. 식당·가볼 곳 상세 페이지도 각각 확인한다.

- [ ] **Step 6: 근처 추천 데이터 커밋**

```bash
git add web/src/generated/site-cafe-nearby.json web/src/generated/site-restaurant-nearby.json web/src/generated/site-spot-nearby.json web/src/generated/site.json web/src/generated/site-restaurant.json web/src/generated/site-spot.json
git commit -m "chore(nearby-payload-size): 축소된 형식으로 실측 데이터 재생성 (npm run site)"
```

(리스트 페이로드 3개도 위경도가 추가돼 값이 바뀌었으므로 같이 커밋한다.)
