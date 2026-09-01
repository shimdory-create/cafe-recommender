# 식당 추천 웹 화면 (2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 식당 추천 데이터(1단계, master 병합 완료)를 가족용 웹앱(`web/`)에 카페와 동등한 기능(이번 주 추천·전체 목록·상세·다녀온 곳·후기·위시리스트)으로 노출한다.

**Architecture:** 카페 화면(`web/src/app/*`)과 나란한 `/restaurant/*` 경로를 새로 만든다. 상단 헤더의 카페/식당 전환 스위치로 오간다. 도메인 무관한 lib(`filter.ts`, `reviews.ts`, `store.ts`, `github-store.ts`, `use-remote-set.ts`, `paging.ts`, `url-state.ts`, `view-only.ts`)와 UI(`filters.tsx`, `thumb.tsx`, `naver-map-link.tsx`, `back-link.tsx`, `Stars`)는 그대로 재사용한다. 카페 전용 필드(scale/menuLevel)를 참조하는 파일만 포크한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, zod (파이프라인 쪽만), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-01-restaurant-web-ui-design.md`

## Global Constraints

- 지금 배포된 카페 화면(`/`, `/list`, `/visited`, `/info`, `/cafe/[id]`)은 동작이 한 줄도 바뀌지 않는다. 공유 파일(`layout.tsx`, `tab-bar.tsx`, `reviews.ts`, `src/cli/run.ts`, `src/store/restaurant-json-store.ts`)은 **순수 추가**만 한다 — 기존 로직·시그니처를 바꾸지 않는다.
- 식당 쪽 표시용 데이터는 `data/restaurant-reviews.json`, `data/restaurant-visits.json`, `data/restaurant-wishlist.json`, `data/restaurant-dismissed.json` 4개 새 파일에 쓴다. 기존 `data/reviews.json` 등은 절대 건드리지 않는다.
- `SiteRestaurant`/`RestaurantSitePayload` zod 스키마는 `src/restaurant-schema.ts`에 둔다(`src/schema.ts`에 얹지 않는다). web 쪽 타입 사본은 `web/src/lib/restaurant-site-types.ts`에 둔다(`web/src/lib/site-types.ts`에 얹지 않는다) — zod 의존성이 web 빌드에서 해석되면 Vercel 빌드가 실패한다(실측 2회, `site-types.ts` 자체 주석 참고).
- 헤더 높이는 56px 고정을 유지한다. 새로 추가하는 조작 요소(전환 스위치)의 세로 높이는 36~40px로 잡아 56px 헤더 안에 넣는다.
- 터치 타겟은 주 조작 44px 이상, 칩·보조 조작 40px 이상 (스펙 10.1, `filters.tsx`의 `CHIP_BASE` 판단과 동일).
- 새 API 라우트(`/api/restaurant/*`)는 기존 라우트(`/api/reviews` 등)와 응답 형태(`ok`/`enabled`/`writable` 필드)를 그대로 따른다 — 화면 쪽 "읽기 실패와 진짜 빈 목록을 구분한다" 로직이 이 계약에 의존한다.
- `RestaurantStore`(`src/store/restaurant-json-store.ts`)는 식당 전용 파일이라 자유롭게 확장한다 — "카페 영향 0" 제약이 적용되지 않는다.

---

### Task 1: RestaurantStore에 visits/reviews 읽기 추가 + SiteRestaurant 스키마 확장

**Files:**
- Modify: `src/store/restaurant-json-store.ts` (readRestaurantVisits/readRestaurantReviews 추가)
- Modify: `src/restaurant-schema.ts` (SiteRestaurantSchema 확장, SiteRestaurantVisitedSchema/RestaurantSitePayloadSchema 신설)
- Test: `tests/store/restaurant-json-store.test.ts` (기존 파일에 케이스 추가)
- Test: `tests/restaurant-schema.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `src/schema.ts`의 `VisitSchema`/`ReviewSchema`/`Visit`/`Review`/`SiteReviewSchema`(이미 존재, 식당 kakaoPlaceId 필드와 그대로 호환)
- Produces:
  - `RestaurantStore.readRestaurantVisits(): Promise<Visit[]>`
  - `RestaurantStore.readRestaurantReviews(): Promise<Review[]>`
  - `SiteRestaurantSchema`(확장판, Task 2가 씀): 필드는 아래 Step 3 참고
  - `SiteRestaurantVisitedSchema`, `RestaurantSitePayloadSchema`, `type RestaurantSitePayload`(Task 2가 씀)

- [ ] **Step 1: RestaurantStore에 실패하는 테스트 추가**

`tests/store/restaurant-json-store.test.ts` 파일 끝에 추가(기존 `describe` 블록 안, 기존 `readBlacklist` 테스트 옆):

```typescript
it('readRestaurantVisits: 파일이 없으면 빈 배열', async () => {
  const store = createRestaurantJsonStore(dir)
  expect(await store.readRestaurantVisits()).toEqual([])
})

it('readRestaurantReviews: 파일이 없으면 빈 배열', async () => {
  const store = createRestaurantJsonStore(dir)
  expect(await store.readRestaurantReviews()).toEqual([])
})
```

(파일 상단에 이미 `dir`/`createRestaurantJsonStore` 셋업이 있으므로 그대로 재사용 — 기존 테스트 파일 구조를 따른다.)

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run tests/store/restaurant-json-store.test.ts`
Expected: FAIL — `store.readRestaurantVisits is not a function`

- [ ] **Step 3: RestaurantStore 구현 확장**

`src/store/restaurant-json-store.ts` 수정. 상단 import에 `VisitSchema`, `ReviewSchema`, `Visit`, `Review` 추가:

```typescript
import { BuzzSnapshotSchema, SuggestionSchema, VisitSchema, ReviewSchema } from '../schema.js'
import type { BuzzSnapshot, Suggestion, Visit, Review } from '../schema.js'
```

`RestaurantStore` 인터페이스에 2줄 추가:

```typescript
export interface RestaurantStore {
  readRestaurants(): Promise<Restaurant[]>
  writeRestaurants(rows: Restaurant[]): Promise<void>
  readRestaurantBuzz(): Promise<BuzzSnapshot[]>
  writeRestaurantBuzz(rows: BuzzSnapshot[]): Promise<void>
  readRestaurantSuggestions(): Promise<Suggestion[]>
  writeRestaurantSuggestions(rows: Suggestion[]): Promise<void>
  readRestaurantVisits(): Promise<Visit[]>
  readRestaurantReviews(): Promise<Review[]>
  readBlacklist(): Promise<BlacklistEntry[]>
  readHealth(): Promise<Health[]>
  writeHealth(rows: Health[]): Promise<void>
  appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
}
```

`createRestaurantJsonStore`의 반환 객체에 2개 메서드 추가(`readBlacklist` 줄 바로 위):

```typescript
    // 웹앱(github-store)이 쓰는 것과 같은 파일 이름 규칙 — data/restaurant-visits.json,
    // data/restaurant-reviews.json. 카페의 data/visits.json·data/reviews.json 은
    // 절대 안 건드린다.
    readRestaurantVisits: () => readArray(dataDir, 'restaurant-visits.json', VisitSchema),
    readRestaurantReviews: () => readArray(dataDir, 'restaurant-reviews.json', ReviewSchema),

    readBlacklist: () => readArray(dataDir, 'restaurant-blacklist.json', BlacklistEntrySchema),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/store/restaurant-json-store.test.ts`
Expected: PASS (모든 케이스)

- [ ] **Step 5: SiteRestaurantSchema 확장 — 실패하는 테스트 먼저**

`tests/restaurant-schema.test.ts` 파일 끝에 추가:

```typescript
describe('SiteRestaurantSchema (2단계 웹 표시용)', () => {
  it('카페 SiteCafe와 동등한 필드를 검증한다', () => {
    const row = {
      id: '1', name: '식당', sigungu: '부평구', zone: 'near', area: '인천',
      driveMinutes: 20, cuisineType: '한식', hasRoom: true, reservable: false,
      parkingGrade: 'A', tags: ['한식', '룸있음'],
      evidence: '룸이 넓다', parkingEvidence: '주차장 넓음',
      viewTypes: [], outdoorSeating: null, teenAppeal: null,
      naverMapUrl: 'https://map.naver.com/p/search/x', kakaoPlaceUrl: null, imageUrl: null,
      hotScore: 5, finalScore: 3, postsPer30: 5, posts30: 3, posts90: 8,
      acceleration: 1, trend: 'steady', ratingAvg: 0, ratingCount: 0,
      familyReviews: [], visitedOn: null, firstSeenAt: '2026-08-01T00:00:00.000Z',
      isNew: true, lastSeenAt: null,
    }
    expect(() => SiteRestaurantSchema.parse(row)).not.toThrow()
  })

  it('RestaurantSitePayloadSchema가 week/stats 구조를 검증한다', () => {
    const payload = {
      generatedAt: '2026-09-01T00:00:00.000Z', weekOf: '2026-08-31',
      week: [{ rank: 1, id: '1', finalScore: 3 }],
      restaurants: [], visited: [],
      stats: {
        discovered: 0, passed: 0, regions: 0, scannedRegions: 0,
        driveMeasured: 0, revisitDays: 180, cityOnly: 0, staleDays: 21,
      },
    }
    expect(() => RestaurantSitePayloadSchema.parse(payload)).not.toThrow()
  })
})
```

파일 상단 import에 `SiteRestaurantSchema`, `RestaurantSitePayloadSchema` 추가.

- [ ] **Step 6: 테스트 실행해서 실패 확인**

Run: `npx vitest run tests/restaurant-schema.test.ts`
Expected: FAIL — 필드 부족 또는 `RestaurantSitePayloadSchema is not defined`

- [ ] **Step 7: 스키마 구현**

`src/restaurant-schema.ts`에서 기존 `SiteRestaurantSchema`(placeholder)를 아래로 **교체**:

```typescript
/** 2단계 웹 표시용 스키마. SiteCafeSchema(src/schema.ts)와 동등한 필드를 갖는다 —
 * scale/menuLevel/mealTypes/stayDuration 자리에 cuisineType/hasRoom/reservable을 쓴다. */
export const SiteRestaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  sigungu: z.string(),
  zone: z.enum(['near', 'seoul', 'north', 'east', 'south', 'west']),
  area: z.string(),
  driveMinutes: z.number().int().nullable(),

  cuisineType: z.enum(CUISINE_TYPES).nullable(),
  hasRoom: z.boolean().nullable(),
  reservable: z.boolean().nullable(),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),

  tags: z.array(z.string()),
  evidence: z.string(),
  parkingEvidence: z.string(),
  viewTypes: z.array(z.string()),
  outdoorSeating: z.boolean().nullable(),
  teenAppeal: z.number().nullable(),

  naverMapUrl: z.string(),
  kakaoPlaceUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),

  hotScore: z.number(),
  finalScore: z.number(),
  postsPer30: z.number(),
  posts30: z.number().int(),
  posts90: z.number().int(),
  acceleration: z.number(),
  trend: z.enum(['rising', 'steady', 'unknown']),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  familyReviews: z.array(SiteReviewSchema),

  cityOnly: z.boolean(),
  visitedOn: z.string().nullable(),
  firstSeenAt: z.string(),
  isNew: z.boolean(),
  lastSeenAt: z.string().nullable(),
})
export type SiteRestaurant = z.infer<typeof SiteRestaurantSchema>

export const SiteRestaurantVisitedSchema = z.object({
  id: z.string(),
  name: z.string(),
  sigungu: z.string(),
  area: z.string(),
  visitedOn: z.string(),
  note: z.string(),
  tags: z.array(z.string()),
  naverMapUrl: z.string(),
  imageUrl: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
})
export type SiteRestaurantVisited = z.infer<typeof SiteRestaurantVisitedSchema>

export const RestaurantSitePayloadSchema = z.object({
  generatedAt: z.string(),
  weekOf: z.string(),
  week: z.array(z.object({
    rank: z.number().int(),
    id: z.string(),
    finalScore: z.number(),
  })),
  restaurants: z.array(SiteRestaurantSchema),
  visited: z.array(SiteRestaurantVisitedSchema),
  stats: z.object({
    discovered: z.number().int(),
    passed: z.number().int(),
    regions: z.number().int(),
    scannedRegions: z.number().int(),
    driveMeasured: z.number().int(),
    revisitDays: z.number().int(),
    cityOnly: z.number().int(),
    staleDays: z.number().int(),
  }),
})
export type RestaurantSitePayload = z.infer<typeof RestaurantSitePayloadSchema>
```

`SiteReviewSchema`를 `../schema.js`에서 import하도록 파일 상단에 추가:

```typescript
import { HealthSchema, BlacklistEntrySchema, SiteReviewSchema } from './schema.js'
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npx vitest run tests/restaurant-schema.test.ts`
Expected: PASS

- [ ] **Step 9: 전체 스위트 + 타입체크로 회귀 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 전부 통과, 에러 0개. (기존 `tests/pipeline/restaurant-tag.test.ts` 등 `RestaurantAttributes` 관련 테스트는 이번 변경과 무관하므로 그대로 통과해야 한다.)

- [ ] **Step 10: 커밋**

```bash
git add src/store/restaurant-json-store.ts src/restaurant-schema.ts tests/store/restaurant-json-store.test.ts tests/restaurant-schema.test.ts
git commit -m "feat(restaurant): 웹 표시용 스키마 확장 + visits/reviews 읽기"
```

---

### Task 2: buildRestaurantSitePayload

**Files:**
- Create: `src/site/restaurant-payload.ts`
- Test: `tests/site/restaurant-payload.test.ts`

**Interfaces:**
- Consumes: `RestaurantStore`(Task 1), `SiteRestaurantSchema`/`RestaurantSitePayloadSchema`(Task 1), `dedupeListings`/`trendOf`(직접 재구현 — 아래 참고), `pickWeek`/`REVISIT_DAYS`/`isRevisitReady`(`../pipeline/revisit.js`, 카페와 공유하는 순수 함수), `zoneOf`(`../config/zones.js`), `areaOf`(`../config/area.js`), `isNewCafe`(`../config/newness.js` — 이름은 카페용이지만 `firstSeenAt`/`now`만 받는 순수 함수라 그대로 재사용), `naverMapLink`(`../pipeline/place-query.js`), `restaurantFamilyFit`/`finalScore`/`hotScore`(Phase 1에서 이미 존재), `passesGate`(`../pipeline/gate.js`), `restaurantDriveMinutesOf`(`../jobs/restaurant-drive-times.js`)
- Produces: `buildRestaurantSitePayload(input: RestaurantPayloadInput): RestaurantSitePayload`, `restaurantTrendOf`, `dedupeRestaurantListings` (Task 3이 씀)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/site/restaurant-payload.test.ts` 새로 작성 — `tests/site/payload.test.ts`(카페 쪽, 이미 읽어서 구조를 확인함)와 같은 스타일:

```typescript
import { describe, it, expect } from 'vitest'
import { buildRestaurantSitePayload, restaurantTrendOf, dedupeRestaurantListings } from '../../src/site/restaurant-payload.js'
import {
  RestaurantSitePayloadSchema,
  type RestaurantAttributes, type Restaurant, type SiteRestaurant,
} from '../../src/restaurant-schema.js'
import type { BuzzSnapshot, Visit, Review } from '../../src/schema.js'

const NOW = new Date('2026-08-20T00:00:00Z')

const attrs = (over: Partial<RestaurantAttributes> = {}): RestaurantAttributes => ({
  cuisineType: '한식', evidence: '룸이 넓다', parkingGrade: 'A', parkingEvidence: '주차장 넓음',
  hasRoom: true, reservable: true, viewStrength: 0, viewTypes: [], outdoorSeating: null,
  teenAppeal: 3, confidence: 0.9, extractedAt: NOW.toISOString(), modelVersion: 'v1',
  ...over,
})

const restaurant = (id: string, over: Partial<Restaurant> = {}): Restaurant => ({
  kakaoPlaceId: id, name: `식당${id}`, sigungu: '부평구', lat: 37.5, lng: 126.7,
  naverMapUrl: 'https://map.naver.com/p/search/x', kakaoPlaceUrl: 'http://place.map.kakao.com/1',
  firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active', ambiguousName: false,
  attributes: attrs(), tags: ['한식', '룸있음'],
  ...over,
})

const buzz = (id: string, over: Partial<BuzzSnapshot> = {}): BuzzSnapshot => ({
  kakaoPlaceId: id, capturedAt: '2026-08-19',
  receivedCount: 50, relevantCount: 40, precision: 0.8,
  spanDays: 20, postsPer30: 60, posts30d: 30, postsPrev: 15,
  firstPostDate: '2026-07-01', latestPostDate: '2026-08-19',
  acceleration: 1.6, suspectAmbiguous: false,
  ...over,
})

const build = (
  restaurants: Restaurant[], buzzRows: BuzzSnapshot[],
  over: Partial<Parameters<typeof buildRestaurantSitePayload>[0]> = {},
) => buildRestaurantSitePayload({
  restaurants, buzz: buzzRows, visits: [], suggestions: [], reviews: [],
  weekOf: '2026-08-17', now: NOW, ...over,
})

describe('buildRestaurantSitePayload', () => {
  it('스키마를 만족하는 페이로드를 만든다', () => {
    const p = build([restaurant('1')], [buzz('1')])
    expect(() => RestaurantSitePayloadSchema.parse(p)).not.toThrow()
    expect(p.restaurants).toHaveLength(1)
  })

  it('판정 전·숨김·태그 0개(음식종류 미분류)는 싣지 않는다', () => {
    const p = build(
      [
        restaurant('1'),
        restaurant('2', { status: 'pending_extraction', attributes: null }),
        restaurant('3', { status: 'hidden' }),
        restaurant('4', { attributes: attrs({ cuisineType: null }), tags: [] }),
      ],
      ['1', '2', '3', '4'].map((id) => buzz(id)),
    )
    expect(p.restaurants.map((r) => r.id)).toEqual(['1'])
  })

  it('같은 이름+시군구는 하나로 합친다 (도로명 주소 있는 쪽을 남긴다)', () => {
    const dupe = restaurant('2', { name: '식당1', roadAddress: '인천 부평구 1' })
    const p = build([restaurant('1'), dupe], [buzz('1'), buzz('2')])
    expect(p.restaurants).toHaveLength(1)
    expect(p.restaurants[0]!.id).toBe('2')
  })
})

describe('restaurantTrendOf', () => {
  it('90일 창을 못 채우면 unknown', () => {
    expect(restaurantTrendOf({ posts30d: 10, postsPrev: 5, spanDays: 40 })).toBe('unknown')
  })
})

describe('dedupeRestaurantListings', () => {
  it('빈 목록은 빈 목록', () => {
    expect(dedupeRestaurantListings([], new Map())).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run tests/site/restaurant-payload.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 구현**

`src/site/restaurant-payload.ts` 새로 작성. `src/site/payload.ts`(카페 쪽, 이미 읽었음)의 구조를 그대로 따르되 카페 전용 필드(`menuLevel`/`scale`/`mealTypes`/`stayDuration`) 대신 `cuisineType`/`hasRoom`/`reservable`을 쓴다:

```typescript
import { restaurantDriveMinutesOf } from '../jobs/restaurant-drive-times.js'
import { STALE_DAYS } from '../jobs/restaurant-liveness.js'
import { zoneOf } from '../config/zones.js'
import { areaOf } from '../config/area.js'
import { isNewCafe } from '../config/newness.js'
import { isRevisitReady, REVISIT_DAYS } from '../pipeline/revisit.js'
import { REGIONS } from '../config/regions.js'
import { naverMapLink } from '../pipeline/place-query.js'
import { restaurantFamilyFit } from '../pipeline/restaurant-score.js'
import { finalScore, hotScore } from '../pipeline/score.js'
import { passesGate } from '../pipeline/gate.js'
import {
  RestaurantSitePayloadSchema,
  type Restaurant, type SiteRestaurant, type SiteRestaurantVisited, type RestaurantSitePayload,
} from '../restaurant-schema.js'
import type { BuzzSnapshot, Suggestion, Visit, Review } from '../schema.js'

export interface RestaurantPayloadInput {
  restaurants: Restaurant[]
  buzz: BuzzSnapshot[]
  visits: Visit[]
  reviews?: Review[]
  suggestions: Suggestion[]
  weekOf: string
  now: Date
}

const COMPARABLE_SPAN_DAYS = 90
const REVIEWS_IN_PAYLOAD = 10
const WEEK_SIZE = 10

/** 카페의 trendOf와 동일한 로직 — 50건 창 포화 문제(발견 E)가 식당에도 그대로 적용된다 */
export function restaurantTrendOf(
  b: { posts30d: number; postsPrev: number; spanDays: number },
): 'rising' | 'steady' | 'unknown' {
  if (b.spanDays < COMPARABLE_SPAN_DAYS || b.postsPrev === 0) return 'unknown'
  const baseline = b.postsPrev / 2
  return b.posts30d >= baseline * 1.5 ? 'rising' : 'steady'
}

/** 카페의 dedupeListings와 동일한 로직(이름+시군구 키, 도로명 주소 있는 쪽 우선) */
export function dedupeRestaurantListings(
  rows: SiteRestaurant[],
  byId: Map<string, Restaurant>,
): SiteRestaurant[] {
  const best = new Map<string, SiteRestaurant>()
  for (const r of rows) {
    const key = `${r.name}|${r.sigungu}`
    const prev = best.get(key)
    if (!prev) {
      best.set(key, r)
      continue
    }
    if (betterListing(r, prev, byId)) best.set(key, r)
  }
  const keep = new Set([...best.values()].map((r) => r.id))
  return rows.filter((r) => keep.has(r.id))
}

function betterListing(a: SiteRestaurant, b: SiteRestaurant, byId: Map<string, Restaurant>): boolean {
  const addr = (r: SiteRestaurant) => Boolean(byId.get(r.id)?.roadAddress)
  if (addr(a) !== addr(b)) return addr(a)
  if (a.finalScore !== b.finalScore) return a.finalScore > b.finalScore
  return a.id.localeCompare(b.id) < 0
}

/** 카페의 pickWeek와 동일한 로직 (weekOf 정확 일치 실패 시 최신으로 대체) */
function pickRestaurantWeek(
  suggestions: Suggestion[],
  weekOf: string,
  ids: Set<string>,
  opts: { lastVisit?: Map<string, string>; now?: Date; size?: number } = {},
): { rank: number; id: string; finalScore: number }[] {
  const usable = suggestions.filter((s) => s.weekOf <= weekOf && ids.has(s.kakaoPlaceId))
  if (usable.length === 0) return []
  const latest = usable.reduce((m, s) => (s.weekOf > m ? s.weekOf : m), '')
  const { lastVisit, now = new Date(), size = WEEK_SIZE } = opts
  return usable
    .filter((s) => s.weekOf === latest)
    .filter((s) => isRevisitReady(lastVisit?.get(s.kakaoPlaceId) ?? null, now))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, size)
    .map((s, i) => ({ rank: i + 1, id: s.kakaoPlaceId, finalScore: s.finalScore }))
}

export function buildRestaurantSitePayload(input: RestaurantPayloadInput): RestaurantSitePayload {
  const { restaurants, buzz, visits, suggestions, weekOf, now, reviews = [] } = input

  const rated = new Map<string, { sum: number; n: number }>()
  for (const r of reviews) {
    const cur = rated.get(r.kakaoPlaceId) ?? { sum: 0, n: 0 }
    rated.set(r.kakaoPlaceId, { sum: cur.sum + r.rating, n: cur.n + 1 })
  }
  const byRestaurantReviews = new Map<string, SiteRestaurant['familyReviews']>()
  for (const r of [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const list = byRestaurantReviews.get(r.kakaoPlaceId) ?? []
    if (list.length >= REVIEWS_IN_PAYLOAD) continue
    list.push({ nickname: r.nickname, rating: r.rating, comment: r.comment, createdAt: r.createdAt })
    byRestaurantReviews.set(r.kakaoPlaceId, list)
  }

  const latestBuzz = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latestBuzz.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latestBuzz.set(b.kakaoPlaceId, b)
  }
  const lastVisit = new Map<string, string>()
  for (const v of visits) {
    const prev = lastVisit.get(v.kakaoPlaceId)
    if (!prev || v.visitedOn > prev) lastVisit.set(v.kakaoPlaceId, v.visitedOn)
  }

  const rows: SiteRestaurant[] = []
  for (const r of restaurants) {
    if (r.status !== 'active') continue
    const a = r.attributes
    if (!a) continue
    if (!passesGate({ tags: r.tags, parkingGrade: a.parkingGrade }, { cityMode: true }).pass) continue
    const b = latestBuzz.get(r.kakaoPlaceId)
    if (!b) continue

    const hot = hotScore(b, now)
    const fit = restaurantFamilyFit(
      {
        driveMinutes: restaurantDriveMinutesOf(r) ?? 90,
        parkingGrade: a.parkingGrade,
        hasRoom: a.hasRoom,
        reservable: a.reservable,
        lastVisitedOn: lastVisit.get(r.kakaoPlaceId) ?? null,
        outdoorOnly: false,
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    rows.push({
      id: r.kakaoPlaceId,
      name: r.name,
      sigungu: r.sigungu,
      zone: zoneOf(r),
      area: areaOf({ ...r, zone: zoneOf(r) }),
      driveMinutes: restaurantDriveMinutesOf(r),
      cuisineType: a.cuisineType,
      hasRoom: a.hasRoom,
      reservable: a.reservable,
      parkingGrade: a.parkingGrade,
      tags: r.tags,
      evidence: a.evidence,
      parkingEvidence: a.parkingEvidence,
      viewTypes: a.viewTypes ?? [],
      outdoorSeating: a.outdoorSeating ?? null,
      teenAppeal: a.teenAppeal ?? null,
      naverMapUrl: naverMapLink(r),
      kakaoPlaceUrl: r.kakaoPlaceUrl ?? null,
      imageUrl: r.imageUrl ?? null,
      hotScore: Number(hot.toFixed(1)),
      finalScore: Number(finalScore(hot, fit).toFixed(3)),
      postsPer30: b.postsPer30,
      posts30: b.posts30d,
      posts90: b.posts30d + b.postsPrev,
      acceleration: b.acceleration,
      trend: restaurantTrendOf(b),
      ratingAvg: Number(((rated.get(r.kakaoPlaceId)?.sum ?? 0)
        / (rated.get(r.kakaoPlaceId)?.n || 1)).toFixed(1)),
      ratingCount: rated.get(r.kakaoPlaceId)?.n ?? 0,
      familyReviews: byRestaurantReviews.get(r.kakaoPlaceId) ?? [],
      cityOnly: a.parkingGrade === 'C',
      visitedOn: lastVisit.get(r.kakaoPlaceId) ?? null,
      firstSeenAt: r.firstSeenAt,
      isNew: isNewCafe(r.firstSeenAt, now),
      lastSeenAt: r.lastSeenAt ?? null,
    })
  }

  rows.sort((x, y) => y.finalScore - x.finalScore || x.id.localeCompare(y.id))

  const byId = new Map(restaurants.map((r) => [r.kakaoPlaceId, r]))
  const deduped = dedupeRestaurantListings(rows, byId)

  const visited: SiteRestaurantVisited[] = [...lastVisit.entries()]
    .flatMap(([id, on]) => {
      const r = byId.get(id)
      if (!r) return []
      const note = visits.find((v) => v.kakaoPlaceId === id && v.visitedOn === on)?.note ?? ''
      const rt = rated.get(id)
      return [{
        id, name: r.name, sigungu: r.sigungu, area: areaOf({ ...r, zone: zoneOf(r) }),
        visitedOn: on, note, tags: r.tags,
        naverMapUrl: naverMapLink(r), imageUrl: r.imageUrl ?? null,
        ratingAvg: Number(((rt?.sum ?? 0) / (rt?.n || 1)).toFixed(1)),
        ratingCount: rt?.n ?? 0,
      }]
    })
    .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))

  const ids = new Set(deduped.map((r) => r.id))
  const week = pickRestaurantWeek(suggestions, weekOf, ids, { lastVisit, now })

  return RestaurantSitePayloadSchema.parse({
    generatedAt: now.toISOString(),
    weekOf,
    week,
    restaurants: deduped,
    visited,
    stats: {
      discovered: restaurants.length,
      passed: deduped.filter((r) => !r.cityOnly).length,
      regions: new Set(deduped.map((r) => r.sigungu)).size,
      scannedRegions: REGIONS.filter((r) => !r.excluded).length,
      driveMeasured: deduped.filter((r) => byId.get(r.id)?.driveMinutes != null).length,
      revisitDays: REVISIT_DAYS,
      cityOnly: deduped.filter((r) => r.cityOnly).length,
      staleDays: STALE_DAYS,
    },
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/site/restaurant-payload.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 스위트 + 타입체크**

Run: `npm test && npx tsc --noEmit`
Expected: 전부 통과, 에러 0개

- [ ] **Step 6: 커밋**

```bash
git add src/site/restaurant-payload.ts tests/site/restaurant-payload.test.ts
git commit -m "feat(restaurant): buildRestaurantSitePayload — 웹 표시용 페이로드 생성기"
```

---

### Task 3: CLI `site` 케이스에 식당 페이로드 생성 연결 (공유 파일 순수 추가)

**Files:**
- Modify: `src/cli/run.ts:395-413`(`case 'site':` 블록)

**Interfaces:**
- Consumes: `buildRestaurantSitePayload`(Task 2), `createRestaurantJsonStore`(이미 import되어 있음, `src/cli/run.ts:44`)
- Produces: `web/src/generated/site-restaurant.json` (실행 시 생성되는 산출물, 커밋 대상 아님 — `.gitignore` 확인 필요 없음, 카페의 `site.json`과 같은 취급)

- [ ] **Step 1: run.ts 상단에 import 추가**

`src/cli/run.ts`의 기존 import 블록(44행 부근, `createRestaurantJsonStore` 바로 아래)에 추가:

```typescript
import { buildRestaurantSitePayload } from '../site/restaurant-payload.js'
```

- [ ] **Step 2: `case 'site':` 블록에 식당 페이로드 생성 추가**

기존 코드(이미 읽어서 확인함):

```typescript
    case 'site': {
      // API 키를 요구하지 않는다 — 배포(Vercel) 빌드에서 키 없이 돌아야 한다
      const store = createJsonStore(process.env.DATA_DIR ?? 'data')
      const out = flag(rest, 'out') || 'web/src/generated/site.json'
      const now = new Date()
      const [cafes, buzz, visits, suggestions, reviews] = await Promise.all([
        store.readCafes(), store.readBuzz(),
        store.readVisits(), store.readSuggestions(), store.readReviews(),
      ])
      const payload = buildSitePayload({
        cafes, buzz, visits, suggestions, reviews, weekOf: mondayOf(now), now,
      })
      await mkdir(dirname(out), { recursive: true })
      // 2칸 들여쓰기 + 끝 개행 — git diff 를 깨끗하게 (스펙 9절)
      await writeFile(out, JSON.stringify(payload, null, 2) + '\n', 'utf8')
      console.log(
        `${out}\n  카페 ${payload.cafes.length}곳`
        + ` (일반 ${payload.stats.passed} / 도심전용 ${payload.stats.cityOnly})`
```

이 블록의 카페 쓰기가 끝난 뒤(`console.log(...)` 다음 줄, `break` 전) **순수 추가**로 식당 페이로드 생성을 붙인다. 정확한 삽입 위치는 실제 파일을 열어 `case 'site':` 블록 전체(그 다음 `break`까지)를 확인한 뒤, `break` 바로 앞에 아래를 추가한다:

```typescript
      // 식당 페이로드도 같은 case 에서 만든다 — 카페 쓰기 로직은 위에서 이미
      // 끝났고 이 아래는 순수 추가다. 실패해도 카페 site.json 은 이미 써졌다.
      const restStore = createRestaurantJsonStore(process.env.DATA_DIR ?? 'data')
      const restOut = flag(rest, 'restaurant-out') || 'web/src/generated/site-restaurant.json'
      const [restaurants, restBuzz, restVisits, restSuggestions, restReviews] = await Promise.all([
        restStore.readRestaurants(), restStore.readRestaurantBuzz(),
        restStore.readRestaurantVisits(), restStore.readRestaurantSuggestions(),
        restStore.readRestaurantReviews(),
      ])
      const restPayload = buildRestaurantSitePayload({
        restaurants, buzz: restBuzz, visits: restVisits, suggestions: restSuggestions,
        reviews: restReviews, weekOf: mondayOf(now), now,
      })
      await mkdir(dirname(restOut), { recursive: true })
      await writeFile(restOut, JSON.stringify(restPayload, null, 2) + '\n', 'utf8')
      console.log(
        `${restOut}\n  식당 ${restPayload.restaurants.length}곳`
        + ` (일반 ${restPayload.stats.passed} / 도심전용 ${restPayload.stats.cityOnly})`,
      )
```

(원래 카페 블록의 `console.log(...)`가 여러 줄 이어지는 템플릿 문자열이면 정확한 줄바꿈은 실제 파일을 보고 맞춘다 — 여기 지침의 핵심은 "카페 로직 마지막 줄과 `break` 사이에 식당 생성 코드를 통째로 끼워 넣는다"는 것이다.)

- [ ] **Step 3: 실행해서 확인**

```bash
DATA_DIR=data npx tsx src/cli/run.ts site
```

Expected: `web/src/generated/site.json`과 `web/src/generated/site-restaurant.json` 둘 다 생성됨. 콘솔에 카페 줄과 식당 줄이 모두 출력됨. (로컬에 `data/restaurants.json`이 비어 있으면 "식당 0곳"이 나오는 것이 정상 — 에러 없이 파일이 생성되는지가 이 스텝의 목적이다.)

- [ ] **Step 4: 전체 스위트 + 타입체크**

Run: `npm test && npx tsc --noEmit`
Expected: 전부 통과, 에러 0개. 카페 쪽 CLI 테스트(있다면)도 그대로 통과해야 한다 — 이 변경은 `case 'site':` 안에서 카페 로직 **다음**에만 코드를 추가했다.

- [ ] **Step 5: 커밋**

```bash
git add src/cli/run.ts
git commit -m "feat(restaurant): CLI site 명령에서 site-restaurant.json 도 생성"
```

---

### Task 4: web/src/lib/restaurant-site-types.ts + restaurant-site.ts

**Files:**
- Create: `web/src/lib/restaurant-site-types.ts`
- Create: `web/src/lib/restaurant-site.ts`
- Test: `tests/site/restaurant-types-conformance.test.ts` (파이프라인 쪽 — Task 1/2의 zod 스키마와 이 인터페이스가 대입 가능한지)

**Interfaces:**
- Consumes: `web/src/generated/site-restaurant.json`(Task 3이 만듦, 이 태스크 실행 전에 로컬에서 `npx tsx src/cli/run.ts site`로 한 번 생성해 둬야 import가 가능하다 — 파일이 없으면 Step 3에서 `mkdir -p web/src/generated && echo '{"generatedAt":"","weekOf":"","week":[],"restaurants":[],"visited":[],"stats":{"discovered":0,"passed":0,"regions":0,"scannedRegions":0,"driveMeasured":0,"revisitDays":180,"cityOnly":0,"staleDays":21}}' > web/src/generated/site-restaurant.json`로 최소 파일을 만들어 둔다)
- Produces: `SiteRestaurant`, `SiteRestaurantVisited`, `RestaurantSitePayload`(타입), `restaurantPayload`, `RestaurantListRow`, `toRestaurantListRow`, `restaurantById`, `restaurantHomeFeed`, `CUISINE_LABEL`, `RESTAURANT_REVISIT_DAYS`, `restaurantRecentlyVisited`, `RESTAURANT_STALE_DAYS`, `restaurantIsStale`, `restaurantHiddenByVisit` (Task 10~16이 씀)

- [ ] **Step 1: restaurant-site-types.ts 작성**

`web/src/lib/site-types.ts`(이미 읽었음)와 1:1 대응하는 순수 인터페이스 파일. **zod에 의존하지 않는다** (site-types.ts 자체 주석의 이유와 동일 — Vercel이 `web/`에서만 설치해 zod를 못 찾는다):

```typescript
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
```

- [ ] **Step 2: restaurant-site.ts 작성**

`web/src/lib/site.ts`(이미 읽었음)와 대응. `driveLabel`/`addedLabel`은 도메인 무관한 순수 함수라 그대로 import해서 재사용하고, `REVISIT_DAYS`/`recentlyVisited`/`STALE_DAYS`/`isStale`/`hiddenByVisit`는 식당 payload의 `stats`에 고유하게 묶이므로 새로 만든다(값은 파이프라인이 같은 상수를 쓰므로 카페와 같지만, 식당 화면이 카페 payload 상태에 결합되면 안 된다):

```typescript
import raw from '../generated/site-restaurant.json'
import { driveLabel, addedLabel } from './site'
import type { RestaurantSitePayload, SiteRestaurant, SiteRestaurantVisited } from './restaurant-site-types'

export type { SiteRestaurant, RestaurantSitePayload, SiteRestaurantVisited }
export { driveLabel, addedLabel }

export const restaurantPayload = raw as unknown as RestaurantSitePayload

export type RestaurantListRow = Pick<
  SiteRestaurant,
  'id' | 'name' | 'sigungu' | 'area' | 'driveMinutes' | 'cuisineType' | 'parkingGrade'
  | 'hasRoom' | 'reservable' | 'tags' | 'evidence' | 'naverMapUrl' | 'imageUrl' | 'hotScore'
  | 'finalScore' | 'ratingAvg' | 'ratingCount' | 'cityOnly' | 'visitedOn' | 'isNew'
  | 'firstSeenAt' | 'lastSeenAt'
>

const CARD_EVIDENCE_CHARS = 90

export function toRestaurantListRow(r: SiteRestaurant): RestaurantListRow {
  return {
    id: r.id, name: r.name, sigungu: r.sigungu, area: r.area, driveMinutes: r.driveMinutes,
    cuisineType: r.cuisineType, parkingGrade: r.parkingGrade, hasRoom: r.hasRoom, reservable: r.reservable,
    tags: r.tags,
    evidence: r.evidence.length > CARD_EVIDENCE_CHARS
      ? r.evidence.slice(0, CARD_EVIDENCE_CHARS) + '…'
      : r.evidence,
    naverMapUrl: r.naverMapUrl, imageUrl: r.imageUrl, hotScore: r.hotScore, finalScore: r.finalScore,
    ratingAvg: r.ratingAvg, ratingCount: r.ratingCount, cityOnly: r.cityOnly, visitedOn: r.visitedOn,
    isNew: r.isNew, firstSeenAt: r.firstSeenAt, lastSeenAt: r.lastSeenAt,
  }
}

export const restaurantById = (id: string): SiteRestaurant | undefined =>
  restaurantPayload.restaurants.find((r) => r.id === id)

export const RESTAURANT_REVISIT_DAYS = restaurantPayload.stats.revisitDays

export function restaurantRecentlyVisited(visitedOn: string | null, now = new Date()): boolean {
  if (!visitedOn) return false
  const days = (now.getTime() - new Date(visitedOn).getTime()) / 86_400_000
  return days >= 0 && days <= RESTAURANT_REVISIT_DAYS
}

export const RESTAURANT_STALE_DAYS = restaurantPayload.stats.staleDays

export function restaurantIsStale(lastSeenAt: string | null, now = new Date()): boolean {
  if (!lastSeenAt) return false
  const days = (now.getTime() - new Date(lastSeenAt).getTime()) / 86_400_000
  return days > RESTAURANT_STALE_DAYS
}

export function restaurantHiddenByVisit(
  visits: { kakaoPlaceId: string; visitedOn: string }[],
  now = new Date(),
): Set<string> {
  return new Set(
    visits.filter((v) => restaurantRecentlyVisited(v.visitedOn, now)).map((v) => v.kakaoPlaceId),
  )
}

/** 이번 주 추천. 카페의 homeFeed와 동일한 로직 */
export function restaurantHomeFeed(now = new Date()): SiteRestaurant[] {
  const fresh = (r: SiteRestaurant) => !r.cityOnly && !restaurantRecentlyVisited(r.visitedOn, now)
  const ranked = restaurantPayload.week
    .map((w) => restaurantById(w.id))
    .filter((r): r is SiteRestaurant => r !== undefined && fresh(r))
  const seen = new Set(ranked.map((r) => r.id))
  const rest = restaurantPayload.restaurants.filter((r) => fresh(r) && !seen.has(r.id))
  return [...ranked, ...rest]
}

export const CUISINE_LABEL: Record<string, string> = {
  한식: '한식', 일식: '일식', 중식: '중식', 양식: '양식', 분식: '분식', 고기구이: '고기구이',
}

export const PARKING_LABEL: Record<string, string> = {
  A: '주차 넉넉', B: '주차 보통', C: '주차 어려움', D: '주차 불가', '?': '주차 미확인',
}
```

- [ ] **Step 2b: web/src/generated/site-restaurant.json 최소 파일 준비 (import 오류 방지)**

```bash
mkdir -p web/src/generated
cat > web/src/generated/site-restaurant.json <<'JSON'
{"generatedAt":"","weekOf":"","week":[],"restaurants":[],"visited":[],"stats":{"discovered":0,"passed":0,"regions":0,"scannedRegions":0,"driveMeasured":0,"revisitDays":180,"cityOnly":0,"staleDays":21}}
JSON
```

(이 파일은 배포 빌드 때 `npm run site`가 다시 만든다 — 로컬 개발/타입체크가 되도록 최소 스텁만 커밋한다. 카페의 `site.json`도 저장소에 커밋되어 있는지 `git ls-files web/src/generated/`로 확인하고, 커밋되어 있다면 이 파일도 같이 커밋한다.)

- [ ] **Step 3: 타입체크로 확인**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개

- [ ] **Step 4: 타입 정합성 테스트 (파이프라인 쪽)**

`tests/site/restaurant-types-conformance.test.ts` 새로 작성 — `tests/site/types-conformance.test.ts`(이미 읽었음)와 같은 패턴:

```typescript
import { describe, it, expect } from 'vitest'
import type {
  RestaurantSitePayload as FromSchema, SiteRestaurant as RestaurantFromSchema,
} from '../../src/restaurant-schema.js'
import type {
  RestaurantSitePayload as FromWeb, SiteRestaurant as RestaurantFromWeb,
} from '../../web/src/lib/restaurant-site-types.js'

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

describe('식당 표시용 페이로드 타입', () => {
  it('zod 스키마와 웹 인터페이스가 서로 대입된다', () => {
    const bothWays: Exact<FromSchema, FromWeb> = true
    expect(bothWays).toBe(true)
  })

  it('식당 한 건도 서로 대입된다', () => {
    const bothWays: Exact<RestaurantFromSchema, RestaurantFromWeb> = true
    expect(bothWays).toBe(true)
  })
})
```

Run: `npx vitest run tests/site/restaurant-types-conformance.test.ts`
Expected: PASS (두 타입이 정확히 같은 필드를 가지므로 — Step 1의 인터페이스를 Task 1의 zod 스키마와 필드 하나하나 대조해서 작성했다)

- [ ] **Step 5: 전체 스위트 + 타입체크**

Run: `npm test && npx tsc --noEmit && cd web && npx tsc --noEmit && cd ..`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add web/src/lib/restaurant-site-types.ts web/src/lib/restaurant-site.ts web/src/generated/site-restaurant.json tests/site/restaurant-types-conformance.test.ts
git commit -m "feat(restaurant): 식당판 site.ts/site-types.ts + 타입 정합성 테스트"
```

---

### Task 5: reviews.ts 경로 상수 추가 (공유 파일 순수 추가) + 식당 API 라우트 4종

**Files:**
- Modify: `web/src/lib/reviews.ts` (경로 상수 4개 추가 — 그 외 아무것도 안 바꾼다)
- Create: `web/src/app/api/restaurant/reviews/route.ts`
- Create: `web/src/app/api/restaurant/visited/route.ts`
- Create: `web/src/app/api/restaurant/wishlist/route.ts`
- Create: `web/src/app/api/restaurant/dismissed/route.ts`

**Interfaces:**
- Consumes: `restaurantById`(Task 4), `Review`/`VisitRow`/`WishRow`/`DismissRow`/`parseReviewInput`/`applyReviewPatch`/`removeReview`/`addVisit`/`removeVisit`/`addWish`/`removeWish`/`addDismiss`/`removeDismiss`/`summarize`/`sortByNewest`/`todayInSeoul`(전부 `reviews.ts`에 이미 존재, 도메인 무관 — 그대로 재사용), `writeStore`(`store.ts`, 그대로 재사용), `hostCanWrite`(`view-only.ts`, 그대로 재사용)
- Produces: `RESTAURANT_REVIEWS_PATH`, `RESTAURANT_VISITS_PATH`, `RESTAURANT_WISHLIST_PATH`, `RESTAURANT_DISMISSED_PATH` (export from reviews.ts, Task 15가 씀). `/api/restaurant/reviews`, `/api/restaurant/visited`, `/api/restaurant/wishlist`, `/api/restaurant/dismissed` (Task 11~15의 클라이언트 컴포넌트가 씀)

- [ ] **Step 1: reviews.ts에 경로 상수 4개 추가**

`web/src/lib/reviews.ts`의 기존 경로 상수 4줄(`export const REVIEWS_PATH = ...` 등) 바로 아래에 추가 (그 외 파일 내용은 전혀 바꾸지 않는다):

```typescript
export const REVIEWS_PATH = 'data/reviews.json'
export const VISITS_PATH = 'data/visits.json'
export const WISHLIST_PATH = 'data/wishlist.json'
export const DISMISSED_PATH = 'data/dismissed.json'

// 식당판. 카페 파일은 절대 안 건드린다 — 1단계 파이프라인이 data/restaurants.json
// 등을 data/cafes.json 과 분리한 것과 같은 원칙이다.
export const RESTAURANT_REVIEWS_PATH = 'data/restaurant-reviews.json'
export const RESTAURANT_VISITS_PATH = 'data/restaurant-visits.json'
export const RESTAURANT_WISHLIST_PATH = 'data/restaurant-wishlist.json'
export const RESTAURANT_DISMISSED_PATH = 'data/restaurant-dismissed.json'
```

- [ ] **Step 2: 4개 API 라우트를 기존 라우트 그대로 복사 + byId·경로만 교체**

각 라우트는 카페 쪽(이미 읽었음)의 **완전한 사본**이며, 바뀌는 것은 두 가지뿐이다 — import하는 `byId`를 `restaurantById`로, `*_PATH` 상수를 `RESTAURANT_*_PATH`로.

`web/src/app/api/restaurant/visited/route.ts` (카페 `api/visited/route.ts` 그대로 복사, 두 곳만 교체):

```typescript
import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { restaurantById } from '@/lib/restaurant-site'
import { addVisit, removeVisit, todayInSeoul, RESTAURANT_VISITS_PATH, type VisitRow } from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ visits: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<VisitRow>(RESTAURANT_VISITS_PATH)
    return NextResponse.json({ visits: rows, enabled: true, writable: writeOk, ok: true })
  } catch (e) {
    return NextResponse.json({
      visits: [], enabled: true, writable: writeOk, ok: false, error: (e as Error).message,
    })
  }
}

export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 기록 저장이 설정되지 않았어요' }, { status: 503 })
  }
  if (!store.writable || !hostCanWrite(req.headers.get('host'))) {
    return NextResponse.json({ error: '열람 전용 페이지예요' }, { status: 403 })
  }

  let restaurant = ''
  let remove = false
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown; action?: unknown }
    restaurant = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
    remove = body.action === 'remove'
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!restaurant) return NextResponse.json({ error: '식당을 알 수 없습니다' }, { status: 400 })
  if (!remove && !restaurantById(restaurant)) {
    return NextResponse.json({ error: '목록에 없는 식당입니다' }, { status: 400 })
  }

  const visitedOn = todayInSeoul()
  try {
    const rows = await store.update<VisitRow>(
      RESTAURANT_VISITS_PATH,
      remove ? 'data: 다녀왔어요 취소' : `data: 다녀왔어요 ${visitedOn}`,
      (prev) => (remove ? removeVisit(prev, restaurant) : addVisit(prev, restaurant, visitedOn)),
    )
    const visited = rows.some((v) => v.kakaoPlaceId === restaurant)
    return NextResponse.json({ visited, visitedOn: remove ? null : visitedOn })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
```

`web/src/app/api/restaurant/wishlist/route.ts` (카페 `api/wishlist/route.ts` 그대로 복사, `byId`→`restaurantById`, `WISHLIST_PATH`→`RESTAURANT_WISHLIST_PATH`, 에러 메시지의 "카페"→"식당"):

```typescript
import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { restaurantById } from '@/lib/restaurant-site'
import { addWish, removeWish, todayInSeoul, RESTAURANT_WISHLIST_PATH, type WishRow } from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ wishes: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<WishRow>(RESTAURANT_WISHLIST_PATH)
    return NextResponse.json({ wishes: rows, enabled: true, writable: writeOk, ok: true })
  } catch (e) {
    return NextResponse.json({
      wishes: [], enabled: true, writable: writeOk, ok: false, error: (e as Error).message,
    })
  }
}

export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 위시리스트 저장이 설정되지 않았어요' }, { status: 503 })
  }
  if (!store.writable || !hostCanWrite(req.headers.get('host'))) {
    return NextResponse.json({ error: '열람 전용 페이지예요' }, { status: 403 })
  }

  let restaurant = ''
  let remove = false
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown; action?: unknown }
    restaurant = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
    remove = body.action === 'remove'
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!restaurant) return NextResponse.json({ error: '식당을 알 수 없습니다' }, { status: 400 })
  if (!remove && !restaurantById(restaurant)) {
    return NextResponse.json({ error: '목록에 없는 식당입니다' }, { status: 400 })
  }

  try {
    const rows = await store.update<WishRow>(
      RESTAURANT_WISHLIST_PATH,
      remove ? 'data: 위시리스트에서 빼기' : 'data: 위시리스트에 담기',
      (prev) => (remove ? removeWish(prev, restaurant) : addWish(prev, restaurant, todayInSeoul())),
    )
    const wished = rows.some((w) => w.kakaoPlaceId === restaurant)
    return NextResponse.json({ wished })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
```

`web/src/app/api/restaurant/dismissed/route.ts` (카페 `api/dismissed/route.ts` 그대로 복사, `DISMISSED_PATH`→`RESTAURANT_DISMISSED_PATH`. `byId` 확인이 원래 없는 라우트이므로 import 변경 없음):

```typescript
import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import {
  addDismiss, RESTAURANT_DISMISSED_PATH, removeDismiss, todayInSeoul, type DismissRow,
} from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ dismissed: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<DismissRow>(RESTAURANT_DISMISSED_PATH)
    return NextResponse.json({ dismissed: rows, enabled: true, writable: writeOk, ok: true })
  } catch (e) {
    return NextResponse.json({
      dismissed: [], enabled: true, writable: writeOk, ok: false, error: (e as Error).message,
    })
  }
}

export async function POST(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return NextResponse.json({ error: '아직 숨김 저장이 설정되지 않았어요' }, { status: 503 })
  }
  if (!store.writable || !hostCanWrite(req.headers.get('host'))) {
    return NextResponse.json({ error: '열람 전용 페이지예요' }, { status: 403 })
  }

  let restaurant = ''
  let remove = false
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown; action?: unknown }
    restaurant = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
    remove = body.action === 'remove'
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!restaurant) return NextResponse.json({ error: '식당을 알 수 없습니다' }, { status: 400 })

  try {
    const rows = await store.update<DismissRow>(
      RESTAURANT_DISMISSED_PATH,
      remove ? 'data: 폐업 의심 숨김 취소' : 'data: 폐업 의심 숨기기',
      (prev) => (remove ? removeDismiss(prev, restaurant) : addDismiss(prev, restaurant, todayInSeoul())),
    )
    const dismissed = rows.some((d) => d.kakaoPlaceId === restaurant)
    return NextResponse.json({ dismissed })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
```

`web/src/app/api/restaurant/reviews/route.ts` (카페 `api/reviews/route.ts` 전체를 그대로 복사한다 — GET/POST/PATCH/DELETE 네 핸들러 모두. `byId`→`restaurantById`, `REVIEWS_PATH`→`RESTAURANT_REVIEWS_PATH`, `VISITS_PATH`→`RESTAURANT_VISITS_PATH`, 에러 메시지의 "카페"→"식당", 커밋 메시지의 "카페"→"식당"로만 바꾼다. 원본 파일 전체가 이미 이 문서 앞부분에 인용되어 있으므로, 그 내용을 그대로 옮기고 이 다섯 곳만 치환한다):

```typescript
import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { restaurantById } from '@/lib/restaurant-site'
import {
  addVisit, applyReviewPatch, parseReviewInput, removeReview, sortByNewest, summarize,
  todayInSeoul, RESTAURANT_REVIEWS_PATH, RESTAURANT_VISITS_PATH, type Review, type VisitRow,
} from '@/lib/reviews'

async function writable(req: Request) {
  const store = await writeStore()
  if (!store.enabled) {
    return { store, deny: NextResponse.json({ error: '아직 후기 저장이 설정되지 않았어요' }, { status: 503 }) }
  }
  if (!store.writable || !hostCanWrite(req.headers.get('host'))) {
    return { store, deny: NextResponse.json({ error: '열람 전용 페이지예요' }, { status: 403 }) }
  }
  return { store, deny: null as null }
}

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  const restaurant = new URL(req.url).searchParams.get('restaurant')
  if (!store.enabled) {
    return NextResponse.json({
      reviews: [], summary: { count: 0, average: 0 }, enabled: false, writable: false, ok: false,
    })
  }
  try {
    const rows = await store.read<Review>(RESTAURANT_REVIEWS_PATH)
    const mine = restaurant ? rows.filter((r) => r.kakaoPlaceId === restaurant) : rows
    return NextResponse.json({
      reviews: sortByNewest(mine), summary: summarize(mine),
      enabled: store.enabled, writable: writeOk, ok: true,
    })
  } catch (e) {
    return NextResponse.json(
      {
        reviews: [], summary: { count: 0, average: 0 }, enabled: true,
        writable: writeOk, ok: false, error: (e as Error).message,
      },
      { status: 200 },
    )
  }
}

export async function POST(req: Request) {
  const { store, deny } = await writable(req)
  if (deny) return deny

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }

  const parsed = parseReviewInput(body as never, new Date())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (!restaurantById(parsed.review.kakaoPlaceId)) {
    return NextResponse.json({ error: '목록에 없는 식당입니다' }, { status: 400 })
  }

  try {
    const rows = await store.update<Review>(
      RESTAURANT_REVIEWS_PATH,
      `data: 후기 (${parsed.review.nickname || '가족'})`,
      (prev) => [...prev, parsed.review],
    )
    const mine = rows.filter((r) => r.kakaoPlaceId === parsed.review.kakaoPlaceId)

    let visitedOn: string | null = null
    try {
      const visits = await store.read<VisitRow>(RESTAURANT_VISITS_PATH)
      if (!visits.some((v) => v.kakaoPlaceId === parsed.review.kakaoPlaceId)) {
        visitedOn = todayInSeoul()
        await store.update<VisitRow>(
          RESTAURANT_VISITS_PATH,
          `data: 별점과 함께 다녀왔어요 ${visitedOn}`,
          (prev) => addVisit(prev, parsed.review.kakaoPlaceId, visitedOn!),
        )
      } else {
        visitedOn = visits.find((v) => v.kakaoPlaceId === parsed.review.kakaoPlaceId)!.visitedOn
      }
    } catch {
      // 별점은 이미 저장됐다
    }

    return NextResponse.json({ review: parsed.review, summary: summarize(mine), visitedOn })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}

export async function PATCH(req: Request) {
  const { store, deny } = await writable(req)
  if (deny) return deny

  let body: { id?: unknown } & Record<string, unknown>
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) return NextResponse.json({ error: '어떤 후기인지 알 수 없습니다' }, { status: 400 })

  const now = new Date()
  let updated: Review | null = null
  let failure = ''
  try {
    const rows = await store.update<Review>(
      RESTAURANT_REVIEWS_PATH,
      'data: 후기 수정',
      (prev) => {
        const out = applyReviewPatch(prev, id, body as never, now)
        if (!out.ok) {
          failure = out.error
          return prev
        }
        updated = out.review
        return out.rows
      },
    )
    if (failure) return NextResponse.json({ error: failure }, { status: 400 })
    const mine = rows.filter((r) => r.kakaoPlaceId === updated!.kakaoPlaceId)
    return NextResponse.json({ review: updated, summary: summarize(mine) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}

export async function DELETE(req: Request) {
  const { store, deny } = await writable(req)
  if (deny) return deny

  let id = ''
  let restaurant = ''
  try {
    const body = (await req.json()) as { id?: unknown; kakaoPlaceId?: unknown }
    id = typeof body.id === 'string' ? body.id.trim() : ''
    restaurant = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: '어떤 후기인지 알 수 없습니다' }, { status: 400 })

  try {
    const rows = await store.update<Review>(
      RESTAURANT_REVIEWS_PATH,
      'data: 후기 삭제',
      (prev) => removeReview(prev, id),
    )
    const mine = restaurant ? rows.filter((r) => r.kakaoPlaceId === restaurant) : []
    return NextResponse.json({ deleted: id, summary: summarize(mine) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
```

- [ ] **Step 3: 타입체크**

Run: `cd web && npx tsc --noEmit && cd ..`
Expected: 에러 0개

- [ ] **Step 4: 로컬 수동 확인 (선택, 개발 서버 필요)**

`cd web && npm run dev` 로 띄운 뒤 `curl -s localhost:3000/api/restaurant/visited`로 `{"visits":[],...}` 형태 응답이 오는지 확인. `GITHUB_TOKEN`이 없는 로컬 환경이면 `store-local.ts` 폴백이 동작한다.

- [ ] **Step 5: 전체 스위트 + 타입체크**

Run: `npm test && npx tsc --noEmit && cd web && npx tsc --noEmit && cd ..`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add web/src/lib/reviews.ts web/src/app/api/restaurant
git commit -m "feat(restaurant): 후기·방문·위시리스트·숨김 API 라우트 4종"
```

---

### Task 6: useRestaurantWishlist / useRestaurantDismissed 훅

**Files:**
- Create: `web/src/lib/use-restaurant-wishlist.ts`
- Create: `web/src/lib/use-restaurant-dismissed.ts`

**Interfaces:**
- Consumes: `useRemoteSet`(`use-remote-set.ts`, 이미 apiPath를 파라미터로 받는 범용 훅 — 그대로 재사용, 수정 없음), `WishRow`/`DismissRow`(`reviews.ts`)
- Produces: `useRestaurantWishlist(): WishlistState`, `useRestaurantDismissed(): DismissedState` (Task 10~15가 씀)

- [ ] **Step 1: 구현 (테스트 없음 — use-wishlist.ts/use-dismissed.ts 원본도 순수 로직이 useRemoteSet에 있어 자체 테스트가 없다)**

`web/src/lib/use-restaurant-wishlist.ts`:

```typescript
'use client'

import { useRemoteSet } from './use-remote-set'
import type { WishRow } from './reviews'

export interface WishlistState {
  wished: Set<string>
  ready: boolean
  toggle: (restaurantId: string) => void
}

export function useRestaurantWishlist(): WishlistState {
  const { ids, ready, toggle } = useRemoteSet(
    '/api/restaurant/wishlist',
    (body) => {
      const b = body as { wishes?: WishRow[]; ok?: boolean }
      return { ok: b.ok === true, ids: (b.wishes ?? []).map((w) => w.kakaoPlaceId) }
    },
  )
  return { wished: ids, ready, toggle }
}
```

`web/src/lib/use-restaurant-dismissed.ts`:

```typescript
'use client'

import { useRemoteSet } from './use-remote-set'
import type { DismissRow } from './reviews'

export interface DismissedState {
  dismissed: Set<string>
  ready: boolean
  dismiss: (restaurantId: string) => void
}

export function useRestaurantDismissed(): DismissedState {
  const { ids, ready, toggle } = useRemoteSet(
    '/api/restaurant/dismissed',
    (body) => {
      const b = body as { dismissed?: DismissRow[]; ok?: boolean }
      return { ok: b.ok === true, ids: (b.dismissed ?? []).map((d) => d.kakaoPlaceId) }
    },
  )
  return { dismissed: ids, ready, dismiss: toggle }
}
```

- [ ] **Step 2: 타입체크**

Run: `cd web && npx tsc --noEmit && cd ..`
Expected: 에러 0개

- [ ] **Step 3: 커밋**

```bash
git add web/src/lib/use-restaurant-wishlist.ts web/src/lib/use-restaurant-dismissed.ts
git commit -m "feat(restaurant): 위시리스트·숨김 훅"
```

---

### Task 7: domain-switch.ts (순수 함수) + 테스트

**Files:**
- Create: `web/src/lib/domain-switch.ts`
- Test: `web/src/lib/domain-switch.test.ts`

**Interfaces:**
- Produces: `type Domain = 'cafe' | 'restaurant'`, `domainOf(pathname: string): Domain`, `switchDomainPath(pathname: string, to: Domain): string` (Task 8이 씀)

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
import { describe, it, expect } from 'vitest'
import { domainOf, switchDomainPath } from './domain-switch'

describe('domainOf', () => {
  it('/restaurant 로 시작하면 restaurant', () => {
    expect(domainOf('/restaurant')).toBe('restaurant')
    expect(domainOf('/restaurant/list')).toBe('restaurant')
  })
  it('그 외는 cafe', () => {
    expect(domainOf('/')).toBe('cafe')
    expect(domainOf('/list')).toBe('cafe')
    expect(domainOf('/cafe/123')).toBe('cafe')
  })
})

describe('switchDomainPath', () => {
  it('홈: / <-> /restaurant', () => {
    expect(switchDomainPath('/', 'restaurant')).toBe('/restaurant')
    expect(switchDomainPath('/restaurant', 'cafe')).toBe('/')
  })
  it('전체 목록: /list <-> /restaurant/list', () => {
    expect(switchDomainPath('/list', 'restaurant')).toBe('/restaurant/list')
    expect(switchDomainPath('/restaurant/list', 'cafe')).toBe('/list')
  })
  it('다녀온 곳: /visited <-> /restaurant/visited', () => {
    expect(switchDomainPath('/visited', 'restaurant')).toBe('/restaurant/visited')
  })
  it('정보: /info <-> /restaurant/info', () => {
    expect(switchDomainPath('/info', 'restaurant')).toBe('/restaurant/info')
  })
  it('상세 페이지는 대응하는 곳이 없으므로 홈으로 보낸다', () => {
    expect(switchDomainPath('/cafe/123', 'restaurant')).toBe('/restaurant')
    expect(switchDomainPath('/restaurant/456', 'cafe')).toBe('/')
  })
  it('이미 그 도메인이면 그대로', () => {
    expect(switchDomainPath('/list', 'cafe')).toBe('/list')
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd web && npx vitest run src/lib/domain-switch.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
export type Domain = 'cafe' | 'restaurant'

export function domainOf(pathname: string): Domain {
  return pathname === '/restaurant' || pathname.startsWith('/restaurant/') ? 'restaurant' : 'cafe'
}

/**
 * 지금 보던 화면과 같은 종류로 도메인을 바꾼다.
 *
 * 목록·다녀온 곳·정보는 대응 경로가 있어 그대로 옮긴다. 상세 페이지
 * (`/cafe/[id]`, `/restaurant/[id]`)는 대응하는 상대 항목이 없으므로
 * 그 도메인의 홈으로 보낸다.
 */
export function switchDomainPath(pathname: string, to: Domain): string {
  const from = domainOf(pathname)
  if (from === to) return pathname

  const rest = from === 'restaurant' ? pathname.slice('/restaurant'.length) : pathname
  // rest 는 '', '/list', '/visited', '/info', 혹은 '/<id>' (상세)
  const known = ['', '/list', '/visited', '/info']
  const tail = known.includes(rest) ? rest : ''

  return to === 'restaurant' ? `/restaurant${tail}` : (tail || '/')
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npx vitest run src/lib/domain-switch.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/domain-switch.ts web/src/lib/domain-switch.test.ts
git commit -m "feat(restaurant): 카페/식당 경로 전환 순수 함수"
```

---

### Task 8: DomainSwitch 컴포넌트 + layout.tsx 연결 (공유 파일 순수 추가) + tab-bar.tsx 도메인 인식

**Files:**
- Create: `web/src/app/domain-switch.tsx`
- Modify: `web/src/app/layout.tsx` (헤더에 `<DomainSwitch />` 한 줄 추가)
- Modify: `web/src/app/tab-bar.tsx` (href를 도메인에 따라 계산하도록 확장)

**Interfaces:**
- Consumes: `domainOf`/`switchDomainPath`(Task 7)
- Produces: `<DomainSwitch />`, `<TabBar />`(확장판, 시그니처는 그대로 `TabBar()` — props 없음)

- [ ] **Step 1: DomainSwitch 컴포넌트 작성**

`web/src/app/domain-switch.tsx`:

```typescript
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { domainOf, switchDomainPath, type Domain } from '@/lib/domain-switch'

/**
 * 헤더 안에 들어가는 카페/식당 전환 세그먼트 버튼.
 *
 * 56px 헤더 높이를 유지해야 해서(전체 목록의 지역 헤더가 그 값에 붙는다),
 * 새 줄을 추가하지 않고 버튼 자체 높이를 36px 로 좁게 잡는다 — filters.tsx
 * 의 칩(40px) 판단과 같은 이유로, 헤더 안에서는 그보다도 더 좁혀야 한다.
 */
const OPTIONS: [Domain, string][] = [['cafe', '☕ 카페'], ['restaurant', '🍚 식당']]

export function DomainSwitch() {
  const pathname = usePathname()
  const router = useRouter()
  const current = domainOf(pathname)

  return (
    <div className="flex shrink-0 overflow-hidden rounded-full border border-line text-[12px]">
      {OPTIONS.map(([d, label]) => (
        <button
          key={d}
          type="button"
          aria-pressed={current === d}
          onClick={() => {
            if (current !== d) router.push(switchDomainPath(pathname, d))
          }}
          className={`flex min-h-[36px] items-center px-2.5 font-semibold ${
            current === d ? 'bg-bean text-white' : 'bg-card text-ink-soft'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: layout.tsx에 순수 추가**

`web/src/app/layout.tsx`의 기존 헤더 블록(이미 읽어서 확인함):

```tsx
            <div className="flex h-14 items-center px-5">
              <Link
                href="/"
                className="flex min-h-[44px] items-center text-[17px] font-bold tracking-tight"
              >
                심김 빵지순례
              </Link>
              {VIEW_ONLY && (
                <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[11px] text-ink-soft">
                  열람 전용
                </span>
              )}
            </div>
```

이 블록을 아래로 **교체**(제목·VIEW_ONLY 배지는 그대로 두고, 오른쪽 끝에 `<DomainSwitch />`를 넣기 위해 `justify-between` 추가하고 마지막에 한 줄만 추가):

```tsx
            <div className="flex h-14 items-center justify-between px-5">
              <div className="flex items-center">
                <Link
                  href="/"
                  className="flex min-h-[44px] items-center text-[17px] font-bold tracking-tight"
                >
                  심김 빵지순례
                </Link>
                {VIEW_ONLY && (
                  <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[11px] text-ink-soft">
                    열람 전용
                  </span>
                )}
              </div>
              <DomainSwitch />
            </div>
```

파일 상단 import에 추가:

```typescript
import { DomainSwitch } from './domain-switch'
```

- [ ] **Step 3: tab-bar.tsx 도메인 인식 확장**

`web/src/app/tab-bar.tsx`의 기존 내용(이미 읽어서 확인함) 전체를 아래로 **교체** — `Tab` 컴포넌트와 44px/56px 규칙은 그대로 두고, `href`만 현재 도메인에 따라 계산한다:

```tsx
'use client'

import Link, { type LinkProps } from 'next/link'
import { usePathname } from 'next/navigation'
import { domainOf } from '@/lib/domain-switch'

function Tab({
  href, label, icon, active,
}: { href: LinkProps<string>['href']; label: string; icon: string; active: boolean }) {
  return (
    <span className="flex-1">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[12px] ${
          active ? 'text-bean font-semibold' : 'text-ink-soft'
        }`}
      >
        <span className="text-[17px] leading-none">{icon}</span>
        {label}
      </Link>
    </span>
  )
}

export function TabBar() {
  const path = usePathname()
  const domain = domainOf(path)
  // 카페는 기존 경로 그대로, 식당은 /restaurant 접두어. Next 의 타입 라우트가
  // href 를 리터럴로 요구해서(원본 주석과 동일 이유) 두 갈래를 그대로 적는다.
  const home = domain === 'restaurant' ? '/restaurant' : '/'
  const list = domain === 'restaurant' ? '/restaurant/list' : '/list'
  const visited = domain === 'restaurant' ? '/restaurant/visited' : '/visited'
  const info = domain === 'restaurant' ? '/restaurant/info' : '/info'

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-[480px]">
        <Tab href={home} label="이번 주" icon="☕" active={path === home} />
        <Tab href={list} label="전체" icon="📋" active={path.startsWith(list)} />
        <Tab href={visited} label="다녀온 곳" icon="★" active={path.startsWith(visited)} />
        <Tab href={info} label="정보" icon="ⓘ" active={path.startsWith(info)} />
      </div>
    </nav>
  )
}
```

(주의: `path.startsWith(list)`처럼 `list = '/list'`이고 실제 경로가 `/restaurant/list`인 상태에서 카페 탭 활성 판정에 잘못 걸리지 않는지 확인 — `list` 변수 자체가 이미 도메인에 따라 `/restaurant/list`로 계산되므로 문제없다. 다만 `home === '/'`일 때 `path.startsWith('/')`는 항상 true이므로 홈 탭만 `path === home`(정확히 일치)로 판정해야 한다 — 위 코드가 이미 그렇게 되어 있다.)

- [ ] **Step 4: 타입체크**

Run: `cd web && npx tsc --noEmit && cd ..`
Expected: 에러 0개. (Next.js 타입 라우트가 `/restaurant`, `/restaurant/list` 등을 아직 모르면 에러가 날 수 있다 — 이 경우 Task 12~16에서 해당 페이지 파일이 생기면 자동으로 해소된다. 지금 단계에서 에러가 나면 원인이 "타입 라우트에 아직 없는 경로"인지 확인하고, 맞다면 이 스텝은 경고로 남겨두고 계속 진행한다.)

- [ ] **Step 5: 커밋**

```bash
git add web/src/app/domain-switch.tsx web/src/app/layout.tsx web/src/app/tab-bar.tsx
git commit -m "feat(restaurant): 카페/식당 전환 스위치 + 탭바 도메인 인식"
```

---

### Task 9: Thumb에 아이콘 prop 추가 (공유 파일 순수 추가, 하위호환) + restaurant-card.tsx

**Files:**
- Modify: `web/src/app/thumb.tsx` (아이콘 prop 추가, 기본값 `'☕'`이라 기존 호출부는 그대로 동작)
- Create: `web/src/app/restaurant-card.tsx`

**Interfaces:**
- Consumes: `RestaurantListRow`(Task 4), `driveLabel`/`addedLabel`(재사용, Task 4에서 re-export), `restaurantRecentlyVisited`(Task 4), `CUISINE_LABEL`/`PARKING_LABEL`(Task 4)
- Produces: `<RestaurantCard>`, `RestaurantBadge`(export, Task 13이 씀)

- [ ] **Step 1: Thumb에 아이콘 prop 추가**

`web/src/app/thumb.tsx`의 함수 시그니처와 placeholder 부분만 수정(그 외 동일):

```typescript
export function Thumb(
  { src, alt, size = 60, icon = '☕' }: { src: string | null; alt: string; size?: number; icon?: string },
) {
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-xl bg-bean-soft"
      style={{ width: size, height: size }}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[18px] text-bean/50">
          {icon}
        </span>
      )}
    </span>
  )
}
```

(기존 호출부 — `cafe-card.tsx`, `visited-list.tsx` — 는 `icon`을 안 넘기므로 기본값 `'☕'`로 동작이 그대로 유지된다. 이것이 "공유 파일 순수 추가"다.)

- [ ] **Step 2: restaurant-card.tsx 작성**

`web/src/app/cafe-card.tsx`(이미 읽었음)와 대응. 카드 상단 3종 고정 정보를 "음식종류 · 주차 · 룸/예약"으로 바꾼다:

```typescript
import Link from 'next/link'
import {
  addedLabel, driveLabel, CUISINE_LABEL, PARKING_LABEL, restaurantRecentlyVisited,
  type RestaurantListRow,
} from '@/lib/restaurant-site'
import { Thumb } from './thumb'
import { NaverMapLink } from './naver-map-link'
import { Badge } from './cafe-card'

const PARKING_TONE: Record<string, string> = {
  A: 'text-emerald-700 dark:text-emerald-400',
  B: 'text-amber-700 dark:text-amber-400',
  C: 'text-orange-700 dark:text-orange-400',
  D: 'text-red-700 dark:text-red-400',
  '?': 'text-ink-soft',
}

/** 카드 상단 고정: 음식종류 · 주차 · 룸/예약. 갈지 말지를 3초에 결정하게 하는 정보 */
export function RestaurantTopThree({ restaurant }: { restaurant: RestaurantListRow }) {
  const amenities = [
    restaurant.hasRoom ? '룸 있음' : null,
    restaurant.reservable ? '예약 가능' : null,
  ].filter((x): x is string => x !== null)
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
      <span className="font-semibold">
        {restaurant.cuisineType ? CUISINE_LABEL[restaurant.cuisineType] : '음식종류 미확인'}
      </span>
      <span className="text-line">·</span>
      <span className={`font-semibold ${PARKING_TONE[restaurant.parkingGrade]}`}>
        {PARKING_LABEL[restaurant.parkingGrade]}
      </span>
      {amenities.length > 0 && (
        <>
          <span className="text-line">·</span>
          <span>{amenities.join(' · ')}</span>
        </>
      )}
    </div>
  )
}

export function RestaurantCard({
  restaurant, rank, wished, onToggleWish, stale, onDismiss,
}: {
  restaurant: RestaurantListRow
  rank?: number
  wished?: boolean
  onToggleWish?: () => void
  stale?: boolean
  onDismiss?: () => void
}) {
  const visited = restaurantRecentlyVisited(restaurant.visitedOn)
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card">
      <Link
        href={`/restaurant/${restaurant.id}`}
        aria-label={`${restaurant.name} 자세히 보기`}
        className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
      >
        <div className="flex gap-3">
          <Thumb src={restaurant.imageUrl} alt={restaurant.name} size={60} icon="🍚" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[17px] font-bold leading-snug">
                {rank !== undefined && (
                  <span className="mr-1.5 text-bean">
                    {rank}
                    <span className="sr-only">위 </span>
                  </span>
                )}
                {restaurant.isNew && (
                  <span className="mr-1.5 align-[1px] rounded bg-bean px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                    NEW
                  </span>
                )}
                {restaurant.name}
              </h3>
              <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
                {onToggleWish && (
                  <button
                    type="button"
                    aria-pressed={wished}
                    aria-label={wished ? '위시리스트에서 빼기' : '위시리스트에 담기'}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWish() }}
                    className={`flex min-h-[40px] min-w-[40px] items-center justify-center text-[19px] ${
                      wished ? 'text-bean' : 'text-ink-soft'
                    }`}
                  >
                    {wished ? '♥' : '♡'}
                  </button>
                )}
                {restaurant.ratingCount > 0 && (
                  <span className="text-[13px] font-bold text-bean">
                    ★ {restaurant.ratingAvg.toFixed(1)}
                  </span>
                )}
                {visited && (
                  <span className="rounded-full bg-line px-2 py-0.5 text-[11px] text-ink-soft">
                    다녀옴
                  </span>
                )}
              </span>
            </div>

            <p className="mt-0.5 text-[13px] text-ink-soft">
              {restaurant.sigungu} · {driveLabel(restaurant.driveMinutes)} · {addedLabel(restaurant.firstSeenAt)}
            </p>

            <div className="mt-1.5">
              <RestaurantTopThree restaurant={restaurant} />
            </div>
          </div>
        </div>

        {stale && (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-amber-50 pl-2.5 pr-1 text-[12px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span>폐업 의심 · 카카오지도에서 최근 안 보여요</span>
            {onDismiss && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss() }}
                className="flex min-h-[40px] shrink-0 items-center px-2 underline"
              >
                숨기기
              </button>
            )}
          </div>
        )}

        {restaurant.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {restaurant.tags.slice(0, 4).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        )}

        {restaurant.evidence && (
          <p className="mt-3 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed text-ink-soft">
            {restaurant.evidence}
          </p>
        )}
      </Link>

      <NaverMapLink
        href={restaurant.naverMapUrl}
        className="flex min-h-[48px] items-center justify-center gap-1.5 border-t border-line text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        네이버지도로 열기 ↗
      </NaverMapLink>
    </article>
  )
}
```

(`Badge`는 `cafe-card.tsx`에서 export되어 있고 순수 스타일 컴포넌트라 그대로 import해서 재사용 — 새로 만들지 않는다.)

- [ ] **Step 3: 타입체크**

Run: `cd web && npx tsc --noEmit && cd ..`
Expected: 에러 0개

- [ ] **Step 4: 전체 스위트**

Run: `npm test && cd web && npm test && cd ..`
Expected: 전부 통과. (`Thumb`은 기존 카페 쪽 스냅샷/테스트가 있다면 아이콘 기본값이 그대로라 깨지지 않아야 한다 — 만약 실패하면 기본값이 정확히 `'☕'`인지 재확인.)

- [ ] **Step 5: 커밋**

```bash
git add web/src/app/thumb.tsx web/src/app/restaurant-card.tsx
git commit -m "feat(restaurant): 식당 카드 + Thumb 아이콘 prop"
```

---

### Task 10: restaurant-feed-cards.tsx + restaurant-home-feed.tsx

**Files:**
- Create: `web/src/app/restaurant-feed-cards.tsx`
- Create: `web/src/app/restaurant-home-feed.tsx`

**Interfaces:**
- Consumes: `RestaurantCard`(Task 9), `RestaurantListRow`(Task 4), `restaurantIsStale`(Task 4), `useRestaurantWishlist`/`useRestaurantDismissed`(Task 6), `PAGE_SIZE`/`pageOf`/`pageCount`/`pageFromParam`(`paging.ts`, 그대로 재사용), `restaurantHiddenByVisit`(Task 4)
- Produces: `RestaurantFeedRow`, `<RestaurantFeedCards>`, `<RestaurantHomeFeed>` (Task 11이 씀)

- [ ] **Step 1: restaurant-feed-cards.tsx**

`web/src/app/feed-cards.tsx`(이미 읽었음)와 대응:

```typescript
import { RestaurantCard } from './restaurant-card'
import { restaurantIsStale, type RestaurantListRow } from '@/lib/restaurant-site'

export interface RestaurantFeedRow extends RestaurantListRow {
  reason: string
}

export function RestaurantFeedCards({
  rows, offset = 0, showRank = true, wished, onToggleWish, onDismiss,
}: {
  rows: RestaurantFeedRow[]
  offset?: number
  showRank?: boolean
  wished?: Set<string>
  onToggleWish?: (id: string) => void
  onDismiss?: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {rows.map((r, i) => (
        <div key={r.id}>
          <RestaurantCard
            restaurant={r}
            rank={showRank ? offset + i + 1 : undefined}
            wished={wished?.has(r.id)}
            onToggleWish={onToggleWish ? () => onToggleWish(r.id) : undefined}
            stale={!r.visitedOn && restaurantIsStale(r.lastSeenAt)}
            onDismiss={onDismiss ? () => onDismiss(r.id) : undefined}
          />
          <p className="mt-1.5 px-1 text-[12px] text-ink-soft">{r.reason}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: restaurant-home-feed.tsx**

`web/src/app/home-feed.tsx`(이미 읽었음)와 대응. `/api/visited` → `/api/restaurant/visited`, `useWishlist`/`useDismissed` → 식당판, `FeedCards`→`RestaurantFeedCards`:

```typescript
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PAGE_SIZE, pageCount, pageFromParam, pageOf } from '@/lib/paging'
import { restaurantHiddenByVisit } from '@/lib/restaurant-site'
import type { VisitRow } from '@/lib/reviews'
import { useRestaurantWishlist } from '@/lib/use-restaurant-wishlist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { RestaurantFeedCards, type RestaurantFeedRow } from './restaurant-feed-cards'

export type { RestaurantFeedRow }

export type HomeSort = 'default' | 'near' | 'new'

const HOME_SORT_LABEL: [HomeSort, string][] = [
  ['default', '우선순위'], ['near', '가까운순'], ['new', '최신순'],
]

function sortFeed(rows: RestaurantFeedRow[], sort: HomeSort): RestaurantFeedRow[] {
  if (sort === 'default') return rows
  if (sort === 'near') {
    return [...rows].sort((a, b) => {
      const da = a.driveMinutes ?? Number.POSITIVE_INFINITY
      const db = b.driveMinutes ?? Number.POSITIVE_INFINITY
      return da !== db ? da - db : b.hotScore - a.hotScore
    })
  }
  return [...rows].sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt) || a.id.localeCompare(b.id))
}

export function RestaurantHomeFeed({ rows }: { rows: RestaurantFeedRow[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [visited, setVisited] = useState<Set<string> | null>(null)
  const { wished, toggle: toggleWish } = useRestaurantWishlist()
  const { dismissed, dismiss } = useRestaurantDismissed()
  const sortParam = params.get('s')
  const sort: HomeSort = sortParam === 'near' || sortParam === 'new' ? sortParam : 'default'

  useEffect(() => {
    fetch('/api/restaurant/visited')
      .then((r) => r.json())
      .then((body: { visits?: VisitRow[]; ok?: boolean }) => {
        if (body.ok !== true) return
        setVisited(restaurantHiddenByVisit(body.visits ?? []))
      })
      .catch(() => {})
  }, [])

  const feed = useMemo(() => {
    const live = visited ? rows.filter((r) => !visited.has(r.id)) : rows
    const shown = live.filter((r) => !dismissed.has(r.id))
    return sortFeed(shown, sort)
  }, [rows, visited, dismissed, sort])

  const total = pageCount(feed.length)
  const page = pageFromParam(params.get('p'), total)
  const shown = pageOf(feed, page)
  const offset = (page - 1) * PAGE_SIZE

  const buildQuery = (nextPage: number, nextSort: HomeSort) => {
    const sp = new URLSearchParams()
    if (nextPage > 1) sp.set('p', String(nextPage))
    if (nextSort !== 'default') sp.set('s', nextSort)
    const s = sp.toString()
    return s ? `${pathname}?${s}` : pathname
  }

  const go = useCallback((next: number) => {
    router.push(buildQuery(next, sort), { scroll: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router, sort])

  const changeSort = useCallback((next: HomeSort) => {
    router.push(buildQuery(1, next), { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router])

  return (
    <>
      <div className="mb-4 flex overflow-hidden rounded-full border border-line">
        {HOME_SORT_LABEL.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => changeSort(k)}
            className={`min-h-[40px] flex-1 px-3 text-[13px] ${
              sort === k ? 'bg-bean text-white font-semibold' : 'bg-card text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <RestaurantFeedCards
        rows={shown}
        offset={offset}
        showRank={sort === 'default'}
        wished={wished}
        onToggleWish={toggleWish}
        onDismiss={dismiss}
      />

      {total > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={() => go(page - 1)}
            disabled={page === 1}
            className="min-h-[48px] flex-1 rounded-2xl border border-line bg-card text-[14px] font-semibold disabled:opacity-35"
          >
            ← 이전
          </button>
          <span className="shrink-0 text-[13px] text-ink-soft">
            {page} / {total}
          </span>
          <button
            onClick={() => go(page + 1)}
            disabled={page >= total}
            className="min-h-[48px] flex-1 rounded-2xl bg-bean text-[14px] font-bold text-white disabled:opacity-35"
          >
            다음 {PAGE_SIZE}곳 →
          </button>
        </nav>
      )}
    </>
  )
}
```

- [ ] **Step 3: 타입체크**

Run: `cd web && npx tsc --noEmit && cd ..`
Expected: 에러 0개

- [ ] **Step 4: 커밋**

```bash
git add web/src/app/restaurant-feed-cards.tsx web/src/app/restaurant-home-feed.tsx
git commit -m "feat(restaurant): 홈 피드 카드 목록 + 페이지네이션"
```

---

### Task 11: `/restaurant` 홈 페이지

**Files:**
- Create: `web/src/app/restaurant/page.tsx`

**Interfaces:**
- Consumes: `restaurantHomeFeed`/`restaurantPayload`/`toRestaurantListRow`(Task 4), `PAGE_SIZE`(`paging.ts`), `RestaurantHomeFeed`/`RestaurantFeedCards`(Task 10)

- [ ] **Step 1: 작성**

`web/src/app/page.tsx`(이미 읽었음)와 대응. 화제 이유 문구는 그대로(글 수 실측 로직은 도메인 무관), 하단 문구만 식당에 맞게 조정:

```tsx
import { Suspense } from 'react'
import { restaurantHomeFeed, restaurantPayload, toRestaurantListRow, type SiteRestaurant } from '@/lib/restaurant-site'
import { PAGE_SIZE } from '@/lib/paging'
import { RestaurantHomeFeed } from '../restaurant-home-feed'
import { RestaurantFeedCards, type RestaurantFeedRow } from '../restaurant-feed-cards'

function reasonLine(posts30: number, posts90: number, trend: SiteRestaurant['trend']): string {
  const posts = posts30 === posts90
    ? `블로그 30일 ${posts30}건`
    : `블로그 30일 ${posts30}건 · 90일 ${posts90}건`
  return trend === 'rising' ? `${posts} · 지금 뜨는 중` : posts
}

export default function RestaurantHome() {
  const feed: RestaurantFeedRow[] = restaurantHomeFeed().map((r) => ({
    ...toRestaurantListRow(r),
    reason: reasonLine(r.posts30, r.posts90, r.trend),
  }))

  const week = new Date(restaurantPayload.weekOf)
  const label = `${week.getMonth() + 1}월 ${week.getDate()}일 주`

  return (
    <div className="py-5">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold tracking-tight">이번 주 추천 (식당)</h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          {label} · 블로그 화제량과 우리집(인천 부평) 거리로 골랐어요
        </p>
      </div>

      {feed.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-5 text-[14px] text-ink-soft">
          아직 추천할 식당이 없어요. 수집이 끝나면 채워집니다.
        </p>
      ) : (
        <Suspense fallback={<RestaurantFeedCards rows={feed.slice(0, PAGE_SIZE)} />}>
          <RestaurantHomeFeed rows={feed} />
        </Suspense>
      )}

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        {restaurantPayload.stats.regions}개 시군구에서 고른 {restaurantPayload.stats.passed}곳 중에서
        <br />
        주차·음식종류·거리를 함께 보고 {Math.min(PAGE_SIZE, feed.length)}곳씩 추렸어요
      </p>
    </div>
  )
}
```

- [ ] **Step 2: 타입체크 + 빌드 시도**

Run: `cd web && npx tsc --noEmit && cd ..`
Expected: 에러 0개

- [ ] **Step 3: 커밋**

```bash
git add web/src/app/restaurant/page.tsx
git commit -m "feat(restaurant): 식당 이번 주 추천 홈 페이지"
```

---

### Task 12: `/restaurant/list` 전체 목록

**Files:**
- Create: `web/src/app/restaurant/list/page.tsx`
- Create: `web/src/app/restaurant/list/restaurant-list-client.tsx`

**Interfaces:**
- Consumes: `restaurantPayload`/`toRestaurantListRow`/`restaurantIsStale`/`restaurantRecentlyVisited`(Task 4), `readListParams`/`listParamsToQuery`(`url-state.ts`, 그대로 재사용), `useUrlSync`(그대로 재사용), `areaCounts`/`countMatching`/`filterAndSort`/`groupBySigungu`/`PAGE_CHUNK`/`SPLIT_AREAS`(`filter.ts`, 그대로 재사용 — `RestaurantListRow`가 `ListRow`와 구조적으로 호환), `useRestaurantWishlist`/`useRestaurantDismissed`(Task 6), `AreaChips`/`Chip`/`SearchBox`(`filters.tsx`, 그대로 재사용), `RestaurantCard`(Task 9)

- [ ] **Step 1: page.tsx (서버 컴포넌트)**

`web/src/app/list/page.tsx`(이미 읽었음)와 대응:

```tsx
import { restaurantPayload, toRestaurantListRow } from '@/lib/restaurant-site'
import { readListParams } from '@/lib/url-state'
import { RestaurantListClient } from './restaurant-list-client'

export const metadata = { title: '식당 전체 리스트 — 심김 빵지순례' }

export default async function RestaurantListPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  return (
    <RestaurantListClient
      restaurants={restaurantPayload.restaurants.map(toRestaurantListRow)}
      initial={initial}
    />
  )
}
```

- [ ] **Step 2: restaurant-list-client.tsx**

`web/src/app/list/list-client.tsx`(이미 읽었음)와 대응. **`ALL_TAGS`는 카페 전용 성격 태그(대형베이커리 등)라 재사용하지 않는다** — 식당은 태그 칩 대신 음식종류(`CUISINE_TYPES`) 칩을 놓는다:

```tsx
'use client'

import { useMemo, useState } from 'react'
import {
  CUISINE_LABEL, restaurantIsStale, restaurantRecentlyVisited, type RestaurantListRow,
} from '@/lib/restaurant-site'
import {
  areaCounts, countMatching, filterAndSort, groupBySigungu, PAGE_CHUNK, SPLIT_AREAS, type Sort,
} from '@/lib/filter'
import { listParamsToQuery, type ListParams } from '@/lib/url-state'
import { useUrlSync } from '@/lib/use-url-sync'
import { useRestaurantWishlist } from '@/lib/use-restaurant-wishlist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { AreaChips, Chip, SearchBox } from '../../filters'
import { RestaurantCard } from '../../restaurant-card'

/** 식당은 카페의 ALL_TAGS(성격 태그) 대신 음식종류를 칩으로 쓴다 */
const CUISINE_CHIPS = Object.keys(CUISINE_LABEL)

export function RestaurantListClient(
  { restaurants, initial }: { restaurants: RestaurantListRow[]; initial: ListParams },
) {
  const [q, setQ] = useState(initial.q)
  const [area, setArea] = useState<string | null>(initial.area)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [sort, setSort] = useState<Sort>(initial.sort)
  const [city, setCity] = useState(initial.city)
  const [newOnly, setNewOnly] = useState(initial.newOnly)
  const [wishOnly, setWishOnly] = useState(initial.wishOnly)
  const [shownCount, setShownCount] = useState(initial.shown)
  const [expanded, setExpanded] = useState(false)
  const { wished, toggle: toggleWish } = useRestaurantWishlist()
  const { dismissed, dismiss } = useRestaurantDismissed()

  useUrlSync(listParamsToQuery({
    ...initial, q, area, tags, sort, city, newOnly, wishOnly, shown: shownCount,
  }))

  const visible = useMemo(
    () => restaurants.filter((r) => !dismissed.has(r.id)),
    [restaurants, dismissed],
  )
  const wishFiltered = useMemo(
    () => (wishOnly ? visible.filter((r) => wished.has(r.id)) : visible),
    [visible, wishOnly, wished],
  )

  const matched = useMemo(
    () => filterAndSort(wishFiltered, { tags, sort, city, area, query: q, newOnly }),
    [wishFiltered, tags, sort, city, area, q, newOnly],
  )
  const shown = useMemo(() => matched.slice(0, shownCount), [matched, shownCount])
  const rest = matched.length - shown.length
  const areas = useMemo(
    () => areaCounts(wishFiltered, { city, tags, query: q }),
    [wishFiltered, city, tags, q],
  )
  const newCount = useMemo(
    () => countMatching(wishFiltered, { tags, sort, city, area, query: q, newOnly: true }),
    [wishFiltered, tags, sort, city, area, q],
  )
  const groups = useMemo(
    () => (area && SPLIT_AREAS.has(area) ? groupBySigungu(shown) : null),
    [area, shown],
  )

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setShownCount(PAGE_CHUNK)
  }
  const toggle = reset<string>((t) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])))
  const dirty = tags.length > 0 || area !== null || q !== '' || newOnly || wishOnly

  return (
    <div className="py-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">식당 전체 리스트</h1>
        <span className="text-[13px] text-ink-soft">{matched.length}곳</span>
      </div>

      <div className="mt-3">
        <SearchBox value={q} onChange={reset(setQ)} placeholder="식당명 검색" />
      </div>

      <div className="mt-3">
        <AreaChips
          counts={areas}
          value={area}
          onChange={reset(setArea)}
          expanded={expanded}
          onExpand={setExpanded}
          leading={newCount > 0 ? (
            <Chip
              on={newOnly}
              count={newCount}
              tone="new"
              onClick={() => { setNewOnly((v) => !v); setShownCount(PAGE_CHUNK) }}
            >
              NEW
            </Chip>
          ) : null}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip
          on={wishOnly}
          onClick={() => { setWishOnly((v) => !v); setShownCount(PAGE_CHUNK) }}
        >
          ♥ 위시리스트
        </Chip>
        {CUISINE_CHIPS.map((t) => (
          <Chip key={t} on={tags.includes(t)} onClick={() => toggle(t)}>{CUISINE_LABEL[t]}</Chip>
        ))}
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setTags([]); setArea(null); setQ(''); setNewOnly(false); setWishOnly(false)
              setShownCount(PAGE_CHUNK)
            }}
            className="min-h-[40px] rounded-full px-3 text-[13px] text-ink-soft underline"
          >
            초기화
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-line">
          {([['hot', '화제순'], ['near', '가까운순'], ['new', '최신순']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => { setSort(k); setShownCount(PAGE_CHUNK) }}
              className={`min-h-[40px] px-3.5 text-[13px] ${
                sort === k ? 'bg-bean text-white font-semibold' : 'bg-card text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setCity((v) => !v); setShownCount(PAGE_CHUNK) }}
          aria-pressed={city}
          className={`min-h-[40px] rounded-full border px-3.5 text-[13px] ${
            city ? 'border-bean bg-bean text-white font-semibold' : 'border-line bg-card text-ink-soft'
          }`}
        >
          도심 포함
        </button>
      </div>

      {city && (
        <p className="mt-2 text-[12px] text-ink-soft">
          주차가 어려운 도심 식당도 함께 보여줍니다.
        </p>
      )}

      {groups ? (
        <div className="mt-4 flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.sigungu}>
              <div className="sticky top-[57px] z-[5] -mx-5 mb-2 border-b border-line bg-paper/95 px-5 py-2 backdrop-blur">
                <h2 className="text-[15px] font-bold">
                  {g.sigungu}
                  <span className="ml-1.5 text-[13px] font-normal text-ink-soft">
                    {g.rows.length}곳
                    {Number.isFinite(g.nearest) && ` · 가장 가까운 곳 ${g.nearest}분`}
                  </span>
                </h2>
              </div>
              <div className="flex flex-col gap-4">
                {g.rows.map((r) => (
                  <RestaurantCard
                    key={r.id}
                    restaurant={r}
                    wished={wished.has(r.id)}
                    onToggleWish={() => toggleWish(r.id)}
                    stale={!restaurantRecentlyVisited(r.visitedOn) && restaurantIsStale(r.lastSeenAt)}
                    onDismiss={() => dismiss(r.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {shown.map((r) => (
            <RestaurantCard
              key={r.id}
              restaurant={r}
              wished={wished.has(r.id)}
              onToggleWish={() => toggleWish(r.id)}
              stale={!restaurantRecentlyVisited(r.visitedOn) && restaurantIsStale(r.lastSeenAt)}
              onDismiss={() => dismiss(r.id)}
            />
          ))}
        </div>
      )}

      {rest > 0 && (
        <button
          type="button"
          onClick={() => setShownCount((n) => n + PAGE_CHUNK)}
          className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-line bg-card text-[15px] font-semibold text-bean active:bg-bean-soft"
        >
          {Math.min(PAGE_CHUNK, rest)}곳 더 보기
          <span className="ml-1.5 font-normal text-ink-soft">남은 {rest}곳</span>
        </button>
      )}

      {shown.length === 0 && (
        <p className="mt-8 text-center text-[14px] leading-relaxed text-ink-soft">
          {wishOnly
            ? <>아직 담은 곳이 없어요.<br />카드의 하트를 눌러 담아보세요.</>
            : q
              ? <>“{q}” 로 찾은 식당이 없어요.<br />이름 일부만 넣어보세요.</>
              : '조건에 맞는 식당이 없어요. 칩을 줄여보세요.'}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 타입체크**

Run: `cd web && npx tsc --noEmit && cd ..`
Expected: 에러 0개. (`filterAndSort` 등이 `<T extends ListRow>`로 선언돼 있어 `RestaurantListRow`가 구조적으로 `ListRow`를 만족하는지가 관건 — 만족하지 않는다는 에러가 나면 `RestaurantListRow`(Task 4)에 빠진 필드를 `ListRow`와 대조해서 채운다.)

- [ ] **Step 4: 커밋**

```bash
git add web/src/app/restaurant/list
git commit -m "feat(restaurant): 식당 전체 목록 (칩·검색·정렬)"
```

---

### Task 13: `/restaurant/[id]` 상세 페이지 + review-panel + wish-heart

**Files:**
- Create: `web/src/app/restaurant/[id]/page.tsx`
- Create: `web/src/app/restaurant/[id]/review-panel.tsx`
- Create: `web/src/app/restaurant/[id]/wish-heart.tsx`

**Interfaces:**
- Consumes: `restaurantById`/`driveLabel`/`CUISINE_LABEL`/`PARKING_LABEL`/`restaurantPayload`/`restaurantRecentlyVisited`(Task 4), `Badge`(`cafe-card.tsx`, 재사용), `NaverMapLink`(재사용), `BackLink`(`cafe/[id]/back-link.tsx`, **그대로 import해서 재사용** — 카페 전용 로직이 전혀 없다), `Stars`(`cafe/[id]/review-panel.tsx`에서 export된 것을 **그대로 import** — 별점 표시는 도메인 무관), `useRestaurantWishlist`(Task 6)

- [ ] **Step 1: cafe/[id]/review-panel.tsx에서 StarPicker를 export (공유 파일 순수 추가)**

`web/src/app/cafe/[id]/review-panel.tsx`에서 `function StarPicker(...)` 선언 한 줄만
`export function StarPicker(...)`로 바꾼다. 그 외 아무것도 바꾸지 않는다 — 기존
동작·시그니처·호출부는 그대로다. 식당 쪽 review-panel(Step 3)이 이 컴포넌트를
import해서 재사용하기 위한 순수 추가다.

Run: `cd web && npx tsc --noEmit && npm test && cd ..`
Expected: 에러 0개, 전부 통과 — 카페 쪽 review-panel.tsx의 기존 사용처(`<StarPicker .../>`
내부 호출)는 export 여부와 무관하게 그대로 컴파일된다.

- [ ] **Step 2: wish-heart.tsx**

`web/src/app/cafe/[id]/wish-heart.tsx`(이미 읽었음)와 대응:

```tsx
'use client'

import { useRestaurantWishlist } from '@/lib/use-restaurant-wishlist'

export function WishHeart({ restaurantId }: { restaurantId: string }) {
  const { wished, toggle } = useRestaurantWishlist()
  const on = wished.has(restaurantId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? '위시리스트에서 빼기' : '위시리스트에 담기'}
      onClick={() => toggle(restaurantId)}
      className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border text-[20px] ${
        on ? 'border-bean bg-bean-soft text-bean' : 'border-line text-ink-soft'
      }`}
    >
      {on ? '♥' : '♡'}
    </button>
  )
}
```

- [ ] **Step 3: review-panel.tsx**

`web/src/app/cafe/[id]/review-panel.tsx`(이미 읽었음, `Stars`/`Star`/`StarPicker` 포함)와 대응. **`Stars`/`Star`/`StarPicker`는 새로 만들지 않고 카페 파일에서 import** — 별점 표시·입력은 완전히 도메인 무관하다. `/api/reviews`→`/api/restaurant/reviews`, `/api/visited`→`/api/restaurant/visited`, localStorage 키를 식당 전용으로 분리(카페 후기와 "내가 남김" 표시가 섞이지 않게):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { MAX_COMMENT, MAX_NICKNAME, type RatingSummary, type Review } from '@/lib/reviews'
import type { SiteRestaurant } from '@/lib/restaurant-site'
import { VIEW_ONLY, VIEW_ONLY_NOTE } from '@/lib/view-only'
import { Stars, StarPicker } from '../../cafe/[id]/review-panel'

const NICK_KEY = 'cafe-nickname'
const MINE_KEY = 'restaurant-my-reviews'

function readMine(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rememberMine(id: string) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([id, ...readMine()].slice(0, 200)))
  } catch {
    // 사파리 프라이빗 모드 등
  }
}

interface Loaded {
  reviews: Review[]
  summary: RatingSummary
  enabled: boolean
  ok: boolean
  live?: boolean
  writable?: boolean
}

function fromPayload(rows: SiteRestaurant['familyReviews']): Loaded {
  return {
    reviews: rows.map((r, i) => ({ ...r, id: `built-${i}`, kakaoPlaceId: '' })),
    summary: rows.length === 0
      ? { count: 0, average: 0 }
      : {
        count: rows.length,
        average: Number((rows.reduce((a, r) => a + r.rating, 0) / rows.length).toFixed(1)),
      },
    enabled: true,
    ok: true,
    live: false,
  }
}

export function ReviewPanel({ restaurantId, initialVisited, built }: {
  restaurantId: string
  initialVisited: boolean
  built: SiteRestaurant['familyReviews']
}) {
  const [data, setData] = useState<Loaded>(() => fromPayload(built))
  const [rating, setRating] = useState(0)
  const [nickname, setNickname] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [visited, setVisited] = useState(initialVisited)
  const [done, setDone] = useState(false)
  const [mine, setMine] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ rating: 0, nickname: '', comment: '' })

  useEffect(() => {
    setNickname(localStorage.getItem(NICK_KEY) ?? '')
    setMine(readMine())

    fetch(`/api/restaurant/reviews?restaurant=${encodeURIComponent(restaurantId)}`)
      .then((r) => r.json())
      .then((body: Loaded) => {
        if (body.ok === false) {
          setData((prev) => ({ ...prev, enabled: body.enabled, writable: body.writable }))
          return
        }
        setData({ ...body, live: true })
      })
      .catch(() => {})

    fetch('/api/restaurant/visited')
      .then((r) => r.json())
      .then((body: { visits?: { kakaoPlaceId: string }[] }) => {
        if (body.visits?.some((v) => v.kakaoPlaceId === restaurantId)) setVisited(true)
      })
      .catch(() => {})
  }, [restaurantId])

  const submit = async () => {
    if (rating === 0) {
      setError('별점을 눌러주세요')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/restaurant/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: restaurantId, rating, nickname, comment }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '저장에 실패했어요')
      localStorage.setItem(NICK_KEY, nickname)
      rememberMine(body.review.id)
      setMine((prev) => [body.review.id, ...prev])
      if (body.visitedOn) setVisited(true)
      setData((prev) => ({
        enabled: true, ok: true, summary: body.summary,
        reviews: [body.review, ...(prev?.reviews ?? [])],
      }))
      setRating(0)
      setComment('')
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (r: Review) => {
    setEditing(r.id)
    setDraft({ rating: r.rating, nickname: r.nickname, comment: r.comment })
    setError('')
  }

  const saveEdit = async (id: string) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/restaurant/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '수정에 실패했어요')
      setData((prev) => prev && ({
        ...prev, summary: body.summary,
        reviews: prev.reviews.map((r) => (r.id === id ? body.review : r)),
      }))
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r: Review) => {
    const who = r.nickname || '가족'
    if (!window.confirm(`${who} 님이 남긴 별점 ${r.rating.toFixed(1)}점을 지울까요?`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/restaurant/reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, kakaoPlaceId: restaurantId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '삭제에 실패했어요')
      setData((prev) => prev && ({
        ...prev, summary: body.summary,
        reviews: prev.reviews.filter((x) => x.id !== r.id),
      }))
      if (editing === r.id) setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggleVisited = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/restaurant/visited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: restaurantId, action: visited ? 'remove' : 'add' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '기록에 실패했어요')
      setVisited(body.visited)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const enabled = data.enabled
  const viewOnly = VIEW_ONLY || data.writable === false

  return (
    <section className="mt-6">
      <h2 className="text-[15px] font-bold">
        가족 별점
        {data.summary.count > 0 && (
          <span className="ml-2 font-normal text-ink-soft">
            {data.summary.average.toFixed(1)} · {data.summary.count}명
          </span>
        )}
      </h2>

      {viewOnly ? (
        <p className="mt-2 rounded-2xl border border-line bg-card px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
          {VIEW_ONLY_NOTE}
        </p>
      ) : !enabled ? (
        <p className="mt-2 text-[13px] text-ink-soft">아직 별점 저장이 설정되지 않았어요.</p>
      ) : (
        <>
          <div className="mt-2 rounded-2xl border border-line bg-card p-4">
            <StarPicker value={rating} onChange={setRating} />
            <div className="mt-3 flex gap-2">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, MAX_NICKNAME))}
                placeholder="별명 (선택)"
                aria-label="별명"
                className="min-h-[44px] w-24 shrink-0 rounded-xl border border-line bg-paper px-3 text-[15px] outline-none focus:border-bean"
              />
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
                placeholder="한 줄 (선택)"
                aria-label="한 줄 후기"
                className="min-h-[44px] flex-1 rounded-xl border border-line bg-paper px-3 text-[15px] outline-none focus:border-bean"
              />
            </div>
            <button
              onClick={submit}
              disabled={busy}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-bean text-[16px] font-bold text-white disabled:opacity-50"
            >
              {busy ? '저장 중…' : '남기기'}
            </button>
            {!visited && (
              <p className="mt-2 text-center text-[12px] text-ink-soft">
                별점을 남기면 <b className="text-ink">다녀온 곳</b>에 자동으로 들어가요
              </p>
            )}
            {error && <p className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
            {done && !error && (
              <p className="mt-2 text-[13px] text-ink-soft">남겼어요. 다른 가족 화면에도 바로 보여요.</p>
            )}
          </div>

          <button
            onClick={toggleVisited}
            disabled={busy}
            aria-pressed={visited}
            className={`mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl border text-[14px] disabled:opacity-50 ${
              visited
                ? 'border-line bg-bean-soft font-semibold text-bean'
                : 'border-line bg-card text-ink-soft active:bg-bean-soft'
            }`}
          >
            {visited ? '✓ 다녀왔어요 — 누르면 취소' : '별점 없이 다녀왔어요만 체크'}
          </button>
        </>
      )}

      {data.ok === false && enabled && (
        <p className="mt-3 text-[13px] text-ink-soft">
          지금은 남긴 후기를 불러올 수 없어요. 잠시 뒤 새로 고쳐보세요.
        </p>
      )}

      {data.reviews.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {data.reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-card px-4 py-3">
              {editing === r.id ? (
                <>
                  <StarPicker
                    value={draft.rating}
                    onChange={(v) => setDraft((d) => ({ ...d, rating: v }))}
                  />
                  <div className="mt-3 flex gap-2">
                    <input
                      value={draft.nickname}
                      onChange={(e) => setDraft((d) => ({
                        ...d, nickname: e.target.value.slice(0, MAX_NICKNAME),
                      }))}
                      placeholder="별명 (선택)"
                      aria-label="별명 수정"
                      className="min-h-[44px] w-24 shrink-0 rounded-xl border border-line bg-paper px-3 text-[15px] outline-none focus:border-bean"
                    />
                    <input
                      value={draft.comment}
                      onChange={(e) => setDraft((d) => ({
                        ...d, comment: e.target.value.slice(0, MAX_COMMENT),
                      }))}
                      placeholder="한 줄 (선택)"
                      aria-label="한 줄 후기 수정"
                      className="min-h-[44px] flex-1 rounded-xl border border-line bg-paper px-3 text-[15px] outline-none focus:border-bean"
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => saveEdit(r.id)}
                      disabled={busy}
                      className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-bean text-[15px] font-bold text-white disabled:opacity-50"
                    >
                      {busy ? '저장 중…' : '고치기'}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      disabled={busy}
                      className="flex min-h-[44px] w-20 items-center justify-center rounded-xl border border-line text-[15px] text-ink-soft disabled:opacity-50"
                    >
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="text-[13px] font-semibold">{r.nickname || '가족'}</span>
                    {mine.includes(r.id) && (
                      <span className="rounded-full bg-bean-soft px-1.5 py-0.5 text-[11px] text-bean">
                        내가 남김
                      </span>
                    )}
                    <span className="ml-auto text-[12px] text-ink-soft">
                      {r.createdAt.slice(5, 10).replace('-', '. ')}
                      {r.updatedAt && ' (수정됨)'}
                    </span>
                  </div>
                  {r.comment && <p className="mt-1.5 text-[14px] leading-relaxed">{r.comment}</p>}
                  {!viewOnly && enabled && data.live && (
                    <div className="mt-2 flex gap-1">
                      <button
                        onClick={() => startEdit(r)}
                        disabled={busy}
                        className="min-h-[44px] px-3 text-[13px] text-ink-soft underline disabled:opacity-50"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => remove(r)}
                        disabled={busy}
                        className="min-h-[44px] px-3 text-[13px] text-ink-soft underline disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: page.tsx**

`web/src/app/cafe/[id]/page.tsx`(이미 읽었음)와 대응. `MENU_LABEL`/`mealTypes`/`stayDuration`/`scale` 자리를 `cuisineType`/`hasRoom`/`reservable`로 바꾸고, 영업시간 관련 주석·버튼은 그대로 유지(같은 이유가 식당에도 그대로 적용된다):

```tsx
import { notFound } from 'next/navigation'
import {
  restaurantById, CUISINE_LABEL, driveLabel, PARKING_LABEL, restaurantPayload,
  restaurantRecentlyVisited,
} from '@/lib/restaurant-site'
import { Badge } from '../../cafe-card'
import { NaverMapLink } from '../../naver-map-link'
import { ReviewPanel } from './review-panel'
import { BackLink } from '../../cafe/[id]/back-link'
import { WishHeart } from './wish-heart'

export function generateStaticParams() {
  return restaurantPayload.restaurants.map((r) => ({ id: r.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const restaurant = restaurantById((await params).id)
  return { title: restaurant ? `${restaurant.name} — 심김 빵지순례` : '심김 빵지순례' }
}

const PARKING_NOTE: Record<string, string> = {
  A: '전용 주차장이 넉넉해요.',
  B: '주차는 되지만 넉넉하지는 않아요. 건물·상가 주차장이거나 조건부 무료일 수 있어요.',
  C: '주차가 어려워요. 인근 유료·공영 주차장을 알아보고 가세요.',
  D: '주차가 안 돼요.',
  '?': '후기에 주차 얘기가 없었어요. 출발 전에 확인하세요.',
}

export default async function RestaurantDetail({ params }: { params: Promise<{ id: string }> }) {
  const restaurant = restaurantById((await params).id)
  if (!restaurant) notFound()

  const rows: [string, string][] = [
    ['음식종류', restaurant.cuisineType ? CUISINE_LABEL[restaurant.cuisineType] : '미확인'],
    ['주차', `${restaurant.parkingGrade} — ${PARKING_LABEL[restaurant.parkingGrade]}`],
    ['이동', driveLabel(restaurant.driveMinutes)],
  ]
  if (restaurant.hasRoom !== null) rows.push(['룸/개별공간', restaurant.hasRoom ? '있음' : '없음'])
  if (restaurant.reservable !== null) rows.push(['예약', restaurant.reservable ? '가능' : '어려움'])
  if (restaurant.viewTypes.length) rows.push(['뷰', restaurant.viewTypes.join(', ')])
  if (restaurant.outdoorSeating !== null) rows.push(['야외석', restaurant.outdoorSeating ? '있음' : '없음'])
  if (restaurant.teenAppeal !== null) rows.push(['10대 취향', `${restaurant.teenAppeal} / 5`])

  return (
    <div className="py-5">
      <BackLink />

      <div className="mt-1 flex items-start justify-between gap-2">
        <h1 className="text-[24px] font-bold leading-tight tracking-tight">
          {restaurant.isNew && (
            <span className="mr-2 align-middle rounded bg-bean px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white">
              NEW
            </span>
          )}
          {restaurant.name}
        </h1>
        <WishHeart restaurantId={restaurant.id} />
      </div>
      <p className="mt-1 text-[14px] text-ink-soft">
        {restaurant.sigungu} · {driveLabel(restaurant.driveMinutes)}
      </p>

      {restaurantRecentlyVisited(restaurant.visitedOn) && (
        <p className="mt-2 inline-block rounded-full bg-line px-2.5 py-1 text-[12px] text-ink-soft">
          {restaurant.visitedOn} 에 다녀왔어요
        </p>
      )}

      {restaurant.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {restaurant.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      )}

      <NaverMapLink
        href={restaurant.naverMapUrl}
        className="mt-5 flex min-h-[56px] items-center justify-center rounded-2xl bg-bean text-[16px] font-bold text-white active:opacity-90"
      >
        네이버지도로 열기 ↗
      </NaverMapLink>

      <NaverMapLink
        href={restaurant.naverMapUrl}
        className="mt-2 flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-line bg-card text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        영업시간·휴무일 확인 ↗
      </NaverMapLink>
      <p className="mt-1.5 text-center text-[12px] text-ink-soft">
        영업시간은 자주 바뀌어서 지도에서 바로 확인하는 게 정확해요
      </p>

      <ReviewPanel
        restaurantId={restaurant.id}
        initialVisited={restaurant.visitedOn !== null}
        built={restaurant.familyReviews}
      />

      <dl className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-line px-4 py-3 last:border-0">
            <dt className="shrink-0 text-[13px] text-ink-soft">{k}</dt>
            <dd className="text-right text-[13px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-5">
        <h2 className="text-[15px] font-bold">주차</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          {PARKING_NOTE[restaurant.parkingGrade]}
        </p>
        {restaurant.parkingEvidence && (
          <blockquote className="mt-2 rounded-xl bg-bean-soft/50 px-3.5 py-3 text-[13px] leading-relaxed">
            “{restaurant.parkingEvidence}”
          </blockquote>
        )}
      </section>

      {restaurant.evidence && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">후기에서</h2>
          <blockquote className="mt-2 rounded-xl bg-bean-soft/50 px-3.5 py-3 text-[13px] leading-relaxed">
            “{restaurant.evidence}”
          </blockquote>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-[15px] font-bold">얼마나 화제인가</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          블로그 후기가 최근 30일에 <b className="text-ink">{restaurant.posts30}건</b>
          {restaurant.posts90 !== restaurant.posts30 && (
            <>, 90일에 <b className="text-ink">{restaurant.posts90}건</b></>
          )}{' '}올라왔어요.
          {restaurant.trend === 'rising' && ' 최근 한 달이 그 전보다 눈에 띄게 늘었어요.'}
          {restaurant.trend === 'unknown' && ' 최근 글이 몰려 있어서 이전과 비교하기는 어려워요.'}
        </p>
      </section>

      {restaurant.kakaoPlaceUrl && (
        <a
          href={restaurant.kakaoPlaceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex min-h-[44px] items-center justify-center text-[13px] text-ink-soft underline"
        >
          카카오맵에서 보기 ↗
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 타입체크 + 전체 스위트**

Run: `cd web && npx tsc --noEmit && npm test && cd ..`
Expected: 에러 0개, 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add web/src/app/cafe/\[id\]/review-panel.tsx web/src/app/restaurant/\[id\]
git commit -m "feat(restaurant): 식당 상세 페이지 + 후기·위시하트 (StarPicker export 추가)"
```

---

### Task 14: `/restaurant/visited` 다녀온 곳

**Files:**
- Modify: `web/src/lib/visited-sort.ts` (`sortVisited`를 제네릭으로 — 하위호환, 순수 추가)
- Create: `web/src/app/restaurant/visited/page.tsx`
- Create: `web/src/app/restaurant/visited/restaurant-visited-list.tsx`

**Interfaces:**
- Consumes: `nextSort`/`SORT_LABEL`/`sortVisited`(제네릭화 후 그대로 재사용), `matchesQuery`/`areaLabel`(`filter.ts`, 재사용), `Stars`(`cafe/[id]/review-panel.tsx`에서 재사용), `restaurantPayload`/`RESTAURANT_REVISIT_DAYS`(Task 4), `SiteRestaurantVisited`(Task 4)

- [ ] **Step 1: visited-sort.ts의 sortVisited를 제네릭으로 (순수 추가, 하위호환)**

`web/src/lib/visited-sort.ts`의 `sortVisited` 함수만 아래로 교체(다른 것은 전혀 안 바꾼다):

```typescript
/**
 * 별점이 없는 곳은 어느 방향에서도 뒤로 보낸다.
 *
 * 제네릭으로 둔 이유: 이 함수가 실제로 쓰는 필드(`ratingCount`/`ratingAvg`/
 * `visitedOn`/`id`)는 SiteVisited 전용이 아니다. 식당의 SiteRestaurantVisited는
 * `scale` 필드가 없어 SiteVisited 그대로는 대입되지 않는다 — 제네릭 제약을
 * 실제로 쓰는 필드만으로 좁혀서, 카페 호출부(`sortVisited(rows: SiteVisited[], ...)`)는
 * 그대로 동작하면서 식당도 같은 함수를 쓸 수 있게 한다.
 */
export function sortVisited<
  T extends { id: string; ratingCount: number; ratingAvg: number; visitedOn: string },
>(rows: T[], s: VisitedSort): T[] {
  const dir = s.desc ? 1 : -1
  return [...rows].sort((a, b) => {
    if (s.by === 'rating') {
      const ra = a.ratingCount > 0, rb = b.ratingCount > 0
      if (ra !== rb) return ra ? -1 : 1
      if (a.ratingAvg !== b.ratingAvg) return (b.ratingAvg - a.ratingAvg) * dir
      return b.visitedOn.localeCompare(a.visitedOn) || a.id.localeCompare(b.id)
    }
    return b.visitedOn.localeCompare(a.visitedOn) * dir || a.id.localeCompare(b.id)
  })
}
```

파일 상단의 `import type { SiteVisited } from './site-types'`는 더 이상 `sortVisited`에는 필요 없지만 파일에 다른 용도가 없다면 삭제한다(사용처가 없는데 남기면 린트 에러) — `nextSort`/`SORT_LABEL`은 애초에 `SiteVisited`를 참조하지 않았으므로, import를 지워도 그 두 함수는 영향 없다.

- [ ] **Step 2: 카페 쪽 회귀 확인**

Run: `cd web && npx tsc --noEmit && npm test && cd ..`
Expected: 에러 0개, 전부 통과 — `visited-list.tsx`(카페)가 `sortVisited(rows, order)`를 `SiteVisited[]`로 호출하는 기존 코드 그대로 컴파일되어야 한다.

- [ ] **Step 3: restaurant-visited-list.tsx 작성**

`web/src/app/visited/visited-list.tsx`(이미 읽었음)와 대응. `mergeVisits`→`mergeRestaurantVisits`, `KnownCafe`→`KnownRestaurant`, `/cafe/${v.id}`→`/restaurant/${v.id}`, `/api/visited`→`/api/restaurant/visited`, `/api/reviews`→`/api/restaurant/reviews`. **`scale` 필드는 없으므로 관련 표시(카드의 "· {v.scale}")는 뺀다**:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { SiteRestaurantVisited } from '@/lib/restaurant-site'
import type { Review } from '@/lib/reviews'
import { areaLabel, matchesQuery, type AreaCount } from '@/lib/filter'
import { listParamsToQuery, type ListParams } from '@/lib/url-state'
import { useUrlSync } from '@/lib/use-url-sync'
import { nextSort, SORT_LABEL, sortVisited, type VisitedSort } from '@/lib/visited-sort'
import { VIEW_ONLY } from '@/lib/view-only'
import { AreaChips, Chip, SearchBox } from '../../filters'
import { Thumb } from '../../thumb'
import { NaverMapLink } from '../../naver-map-link'
import { Stars } from '../../cafe/[id]/review-panel'

function dateLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function monthLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

export interface KnownRestaurant {
  id: string
  name: string
  sigungu: string
  area: string
  tags: string[]
  naverMapUrl: string
  imageUrl: string | null
}

export interface VisitLite {
  kakaoPlaceId: string
  visitedOn: string
  note?: string
}

export function mergeRestaurantVisits(
  built: SiteRestaurantVisited[],
  live: VisitLite[],
  known: Map<string, KnownRestaurant>,
  hasLive = true,
): SiteRestaurantVisited[] {
  const byId = new Map(built.map((v) => [v.id, v]))
  if (!hasLive) {
    return [...built].sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))
  }

  const out = new Map<string, SiteRestaurantVisited>()
  for (const v of live) {
    const prev = out.get(v.kakaoPlaceId)
    if (prev && prev.visitedOn >= v.visitedOn) continue
    const r = known.get(v.kakaoPlaceId) ?? byId.get(v.kakaoPlaceId)
    if (!r) continue
    const b = byId.get(v.kakaoPlaceId)
    out.set(v.kakaoPlaceId, {
      id: v.kakaoPlaceId, name: r.name, sigungu: r.sigungu, area: r.area,
      visitedOn: v.visitedOn, note: v.note ?? '', tags: r.tags,
      naverMapUrl: r.naverMapUrl, imageUrl: r.imageUrl ?? null,
      ratingAvg: b?.ratingAvg ?? 0, ratingCount: b?.ratingCount ?? 0,
    })
  }

  return [...out.values()].sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))
}

export const MIN_ROWS_FOR_FILTERS = 6

export interface VisitedFilter {
  q: string
  area: string | null
  tags: string[]
}

export function filterRestaurantVisited(
  rows: SiteRestaurantVisited[], f: VisitedFilter,
): SiteRestaurantVisited[] {
  return rows.filter((v) => {
    if (f.area && v.area !== f.area) return false
    if (f.q && !matchesQuery(v.name, f.q)) return false
    return f.tags.every((t) => v.tags.includes(t))
  })
}

export function restaurantVisitedAreas(rows: SiteRestaurantVisited[]): AreaCount[] {
  const map = new Map<string, number>()
  for (const v of rows) map.set(v.area, (map.get(v.area) ?? 0) + 1)
  return [...map.entries()]
    .map(([area, count]) => ({ area, label: areaLabel(area), count, nearest: 0 }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
}

export function restaurantVisitedTags(rows: SiteRestaurantVisited[]): { tag: string; count: number }[] {
  const map = new Map<string, number>()
  for (const v of rows) for (const t of v.tags) map.set(t, (map.get(t) ?? 0) + 1)
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function RestaurantVisitedList({
  built, known, initial,
}: { built: SiteRestaurantVisited[]; known: KnownRestaurant[]; initial: ListParams }) {
  const [rows, setRows] = useState<SiteRestaurantVisited[]>(
    [...built].sort((a, b) => b.visitedOn.localeCompare(a.visitedOn)),
  )
  const [reviews, setReviews] = useState<Map<string, Review[]>>(new Map())
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [q, setQ] = useState(initial.q)
  const [area, setArea] = useState<string | null>(initial.area)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [order, setOrder] = useState<VisitedSort>(initial.visitedSort)
  const [viewOnly, setViewOnly] = useState(VIEW_ONLY)
  const [expanded, setExpanded] = useState(false)

  useUrlSync(listParamsToQuery({ ...initial, q, area, tags, visitedSort: order }))

  const load = useCallback(() => {
    const map = new Map(known.map((r) => [r.id, r]))
    fetch('/api/restaurant/visited')
      .then((r) => r.json())
      .then((body: { visits?: VisitLite[]; ok?: boolean; writable?: boolean }) => {
        if (body.writable === false) setViewOnly(true)
        setRows(mergeRestaurantVisits(built, body.visits ?? [], map, body.ok === true))
      })
      .catch(() => {})

    fetch('/api/restaurant/reviews')
      .then((r) => r.json())
      .then((body: { reviews?: Review[]; ok?: boolean }) => {
        if (body.ok === false) return
        const m = new Map<string, Review[]>()
        for (const r of body.reviews ?? []) {
          m.set(r.kakaoPlaceId, [...(m.get(r.kakaoPlaceId) ?? []), r])
        }
        setReviews(m)
      })
      .catch(() => {})
  }, [built, known])

  useEffect(load, [load])

  const cancel = async (id: string, name: string) => {
    if (!window.confirm(`${name} 을(를) 다녀온 곳에서 뺄까요?\n이번 주 추천에 다시 올라옵니다.`)) {
      return
    }
    setBusy(id)
    setError('')
    try {
      const res = await fetch('/api/restaurant/visited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: id, action: 'remove' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '취소에 실패했어요')
      setRows((prev) => prev.filter((v) => v.id !== id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const areas = useMemo(() => restaurantVisitedAreas(rows), [rows])
  const tagList = useMemo(() => restaurantVisitedTags(rows), [rows])
  const shown = useMemo(
    () => sortVisited(filterRestaurantVisited(rows, { q, area, tags }), order),
    [rows, q, area, tags, order],
  )
  const toggle = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  const dirty = q !== '' || area !== null || tags.length > 0

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-card p-5">
        <p className="text-[14px] leading-relaxed text-ink-soft">
          아직 기록이 없어요. 다녀온 식당을 열어 <b className="text-ink">다녀왔어요</b> 를
          누르면 여기 모입니다.
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
          {viewOnly
            ? '열람 전용 페이지라 여기서는 기록을 남길 수 없어요.'
            : '가족 누구나 누를 수 있어요. 별점을 남기면 자동으로 여기 들어옵니다.'}
        </p>
      </div>
    )
  }

  let lastMonth = ''

  return (
    <>
      <p className="mt-1 text-[13px] text-ink-soft">
        {shown.length}곳{shown.length !== rows.length && ` / ${rows.length}곳`}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-soft">
        기록은 계속 남아요. &ldquo;빼기&rdquo; 를 눌러도 가장 최근 방문 한 건만 지워집니다.
      </p>
      {error && <p className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>}

      {rows.length >= MIN_ROWS_FOR_FILTERS && (
        <>
          <div className="mt-3">
            <SearchBox value={q} onChange={setQ} placeholder="식당명 검색" />
          </div>

          {areas.length > 1 && (
            <div className="mt-3">
              <AreaChips
                counts={areas} value={area} onChange={setArea}
                expanded={expanded} onExpand={setExpanded}
              />
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-line">
              {(['date', 'rating'] as const).map((by) => {
                const on = order.by === by
                return (
                  <button
                    key={by}
                    type="button"
                    onClick={() => setOrder((cur) => nextSort(cur, by))}
                    aria-label={`${SORT_LABEL[by]}순 정렬${
                      on ? (order.desc ? ' (내림차순)' : ' (오름차순)') : ''
                    }`}
                    className={`min-h-[40px] px-3.5 text-[13px] ${
                      on ? 'bg-bean text-white font-semibold' : 'bg-card text-ink-soft'
                    }`}
                  >
                    {SORT_LABEL[by]}순
                    {on && <span aria-hidden="true" className="ml-1">{order.desc ? '↓' : '↑'}</span>}
                  </button>
                )
              })}
            </div>
            <span className="text-[12px] text-ink-soft">
              {order.by === 'rating'
                ? (order.desc ? '높은 별점부터' : '낮은 별점부터')
                : (order.desc ? '최근에 간 곳부터' : '오래전에 간 곳부터')}
            </span>
          </div>

          {tagList.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tagList.map((t) => (
                <Chip key={t.tag} on={tags.includes(t.tag)} count={t.count} onClick={() => toggle(t.tag)}>
                  {t.tag}
                </Chip>
              ))}
              {dirty && (
                <button
                  type="button"
                  onClick={() => { setQ(''); setArea(null); setTags([]) }}
                  className="min-h-[40px] rounded-full px-3 text-[13px] text-ink-soft underline"
                >
                  초기화
                </button>
              )}
            </div>
          )}
        </>
      )}

      {shown.length === 0 && (
        <p className="mt-8 text-center text-[14px] leading-relaxed text-ink-soft">
          {q ? <>“{q}” 로 찾은 기록이 없어요.</> : '조건에 맞는 기록이 없어요.'}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-4">
        {shown.map((v) => {
          const month = monthLabel(v.visitedOn)
          const showMonth = order.by === 'date' && month !== lastMonth
          lastMonth = month
          const mine = reviews.get(v.id) ?? []
          const count = mine.length || v.ratingCount
          const avg = mine.length
            ? mine.reduce((s, r) => s + r.rating, 0) / mine.length
            : v.ratingAvg

          return (
            <div key={v.id}>
              {showMonth && (
                <p className="mb-2 mt-2 text-[13px] font-semibold text-ink-soft">{month}</p>
              )}
              <article className="overflow-hidden rounded-2xl border border-line bg-card">
                <Link
                  href={`/restaurant/${v.id}`}
                  aria-label={`${v.name} 자세히 보기`}
                  className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
                >
                  <div className="flex gap-3">
                    <Thumb src={v.imageUrl} alt={v.name} size={60} icon="🍚" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-[17px] font-bold leading-snug">{v.name}</h2>
                        <span className="mt-0.5 shrink-0 text-[12px] font-medium text-ink-soft">
                          {dateLabel(v.visitedOn)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] text-ink-soft">{v.sigungu}</p>
                      {count > 0 ? (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Stars value={avg} />
                          <span className="text-[13px] font-bold text-bean">{avg.toFixed(1)}</span>
                          <span className="text-[12px] text-ink-soft">· {count}명</span>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-[12px] text-ink-soft">아직 별점이 없어요</p>
                      )}
                    </div>
                  </div>

                  {mine.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {mine.slice(0, 3).filter((r) => r.comment).map((r) => (
                        <li key={r.id} className="border-l-2 border-line pl-2.5 text-[13px] leading-relaxed">
                          {r.comment}
                          <span className="ml-1.5 text-[12px] text-ink-soft">— {r.nickname || '가족'}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {v.note && (
                    <p className="mt-2 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed text-ink-soft">
                      {v.note}
                    </p>
                  )}
                </Link>

                <div className="flex border-t border-line">
                  <NaverMapLink
                    href={v.naverMapUrl}
                    className="flex min-h-[44px] flex-1 items-center justify-center text-[13px] font-semibold text-bean active:bg-bean-soft"
                  >
                    지도 ↗
                  </NaverMapLink>
                  {!viewOnly && (
                    <button
                      onClick={() => cancel(v.id, v.name)}
                      disabled={busy === v.id}
                      className="flex min-h-[44px] flex-1 items-center justify-center border-l border-line text-[13px] text-ink-soft active:bg-bean-soft disabled:opacity-50"
                    >
                      {busy === v.id ? '취소 중…' : '다녀온 곳에서 빼기'}
                    </button>
                  )}
                </div>
              </article>
            </div>
          )
        })}
      </div>
    </>
  )
}
```

- [ ] **Step 4: page.tsx**

`web/src/app/visited/page.tsx`(이미 읽었음)와 대응:

```tsx
import { restaurantPayload, RESTAURANT_REVISIT_DAYS } from '@/lib/restaurant-site'
import { readListParams } from '@/lib/url-state'
import { RestaurantVisitedList, type KnownRestaurant } from './restaurant-visited-list'

export const metadata = { title: '다녀온 식당 — 심김 빵지순례' }

export default async function RestaurantVisitedPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  const known: KnownRestaurant[] = restaurantPayload.restaurants.map((r) => ({
    id: r.id, name: r.name, sigungu: r.sigungu, area: r.area, tags: r.tags,
    naverMapUrl: r.naverMapUrl, imageUrl: r.imageUrl,
  }))

  return (
    <div className="py-5">
      <h1 className="text-[22px] font-bold tracking-tight">다녀온 식당</h1>
      <RestaurantVisitedList built={restaurantPayload.visited} known={known} initial={initial} />

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        다녀온 곳은 {Math.round(RESTAURANT_REVISIT_DAYS / 30)}개월간 추천에서 내려갑니다.
        <br />
        또 가고 싶으면 전체 리스트에서 찾을 수 있어요.
      </p>
    </div>
  )
}
```

- [ ] **Step 5: 타입체크 + 전체 스위트**

Run: `cd web && npx tsc --noEmit && npm test && cd ..`
Expected: 에러 0개, 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add web/src/lib/visited-sort.ts web/src/app/restaurant/visited
git commit -m "feat(restaurant): 다녀온 식당 페이지 (sortVisited 제네릭화)"
```

---

### Task 15: `/restaurant/info` 정보 페이지

**Files:**
- Create: `web/src/app/restaurant/info/page.tsx`

**Interfaces:**
- Consumes: `restaurantPayload`/`RESTAURANT_REVISIT_DAYS`(Task 4), `VIEW_ONLY`(재사용)

- [ ] **Step 1: 작성**

`web/src/app/info/page.tsx`(이미 읽었음)와 같은 구조, 식당 파이프라인(1단계 스펙 문서 기준)에 맞게 단계 설명을 새로 쓴다. `CHANGELOG`는 카페 전용 히스토리라 가져오지 않는다 — 업데이트 기록 섹션 자체를 뺀다:

```tsx
import { restaurantPayload, RESTAURANT_REVISIT_DAYS } from '@/lib/restaurant-site'
import { VIEW_ONLY } from '@/lib/view-only'

export const metadata = { title: '식당 정보 — 심김 빵지순례' }

export default function RestaurantInfo() {
  const at = new Date(restaurantPayload.generatedAt)
  const stamp = `${at.getFullYear()}. ${at.getMonth() + 1}. ${at.getDate()}.`
  const { stats } = restaurantPayload
  const shown = stats.passed + stats.cityOnly

  const steps: [string, React.ReactNode][] = [
    ['식당을 찾는다',
      `수도권 ${stats.scannedRegions}개 시군구를 카카오 장소 검색으로 훑어요.`],
    ['화제량을 센다', (
      <>
        블로그 후기가 얼마나 빠르게 늘고 있는지 봐요. 카페와 같은 방식이에요 —{' '}
        <b className="text-ink">집에서 가까운 곳은 기준을 낮춰서</b> 봐요.
      </>
    )],
    ['후기를 읽는다', '음식종류·룸·예약·주차를 후기 원문에서 뽑아요. 근거 인용이 없으면 버려요.'],
    ['걸러낸다', '프랜차이즈·패스트푸드, 배달·포장 전용, 술집·호프, 주차 안 되는 곳은 빼요.'],
    ['거리를 잰다', '집(인천 부평)에서 카카오 길찾기로 실제 운전 시간을 재요.'],
    ['순위를 매긴다', (
      <>
        화제량 × (거리·주차·룸/예약)로 점수를 내고 높은 순으로 줄을 세워요.{' '}
        부모님 모시고 가거나 웨이팅 없이 가고 싶을 때를 위해{' '}
        <b className="text-ink">룸이 있거나 예약이 되는 곳</b>에 가산점을 줘요.
      </>
    )],
    ['다녀온 곳은 내린다',
      `별점을 남기면 다녀온 곳으로 자동 기록되고, ${Math.round(RESTAURANT_REVISIT_DAYS / 30)}개월간 추천에서 빠져요.`],
  ]

  const stats2: [string, string][] = [
    ['찾은 식당', `${stats.discovered.toLocaleString()}곳`],
    ['전체 탭에 보이는 식당', `${stats.passed.toLocaleString()}곳`],
    ['「도심 포함」 을 켜면', `${shown.toLocaleString()}곳 (+${stats.cityOnly})`],
    ['운전 시간 실측', `${stats.driveMeasured.toLocaleString()} / ${shown.toLocaleString()}곳`],
    ['훑는 지역', `${stats.scannedRegions}개 시군구`],
    ['식당이 있는 지역', `${stats.regions}개 시군구`],
    ['갱신', stamp],
  ]

  const marks: [string, React.ReactNode][] = [
    ['NEW', '우리 목록에 새로 들어온 곳이에요 (30일 이내). 새로 문을 연 곳이라는 뜻은 아니에요.'],
    ['지역 칩', '시 단위로 묶었어요. 가까운 곳부터 놓고 서울은 맨 뒤예요.'],
    ['음식종류 칩', '한식·일식·중식·양식·분식·고기구이로 나눴어요. 여러 종류를 겸하는 식당은 후기에서 가장 자주 언급된 한 가지로 분류돼요.'],
    ['블로그 30일 / 90일', '우리가 직접 센 글 수예요. 상호가 실제로 언급된 글만 셉니다.'],
  ]

  return (
    <div className="py-5 text-[14px] leading-relaxed">
      <h1 className="text-[22px] font-bold tracking-tight">식당 목록은 어떻게 만들어지나</h1>

      {VIEW_ONLY && (
        <p className="mt-3 rounded-2xl border border-line bg-card p-4 text-[13px] leading-relaxed text-ink-soft">
          이 주소는 <b className="text-ink">열람 전용</b>이에요. 목록과 가족 별점은 다
          보이지만, 별점이나 다녀왔어요는 남길 수 없습니다.
        </p>
      )}

      <ol className="mt-4 flex flex-col gap-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">
              <span className="mr-1.5 text-bean">{i + 1}</span>
              {title}
            </p>
            <p className="mt-1 text-[13px] text-ink-soft">{body}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-7 text-[17px] font-bold">지금 상태</h2>
      <dl className="mt-2 overflow-hidden rounded-2xl border border-line bg-card">
        {stats2.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
            <dt className="text-[13px] text-ink-soft">{k}</dt>
            <dd className="shrink-0 text-[13px] font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-7 text-[17px] font-bold">화면의 표시</h2>
      <dl className="mt-2 flex flex-col gap-3">
        {marks.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-card p-4">
            <dt className="font-semibold">{k}</dt>
            <dd className="mt-1 text-[13px] text-ink-soft">{v}</dd>
          </div>
        ))}
      </dl>

      {!VIEW_ONLY && (
        <>
          <h2 className="mt-7 text-[17px] font-bold">별점과 후기</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            가족 누구나 남길 수 있어요. 별점을 남기면{' '}
            <b className="text-ink">다녀온 곳에 자동으로 들어갑니다.</b> 카페 별점과는
            별도로 저장돼요 — 같은 상호라도 카페 탭과 식당 탭의 별점은 섞이지 않습니다.
          </p>
        </>
      )}

      <h2 className="mt-7 text-[17px] font-bold">없는 정보</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        <b className="text-ink">영업시간과 리뷰 수는 싣지 않습니다.</b> 카페 화면과 같은
        이유예요 — 무료로 쓸 수 있는 공식 자료가 그 값을 주지 않고, 블로그에서 뽑아낸
        영업시간은 절반쯤 틀려서 없느니만 못해요. 대신 상세 화면에{' '}
        <b className="text-ink">영업시간·휴무일 확인</b> 버튼을 두었어요.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `cd web && npx tsc --noEmit && cd ..`
Expected: 에러 0개

- [ ] **Step 3: 커밋**

```bash
git add web/src/app/restaurant/info
git commit -m "feat(restaurant): 식당 정보 페이지"
```

---

### Task 16: 최종 통합 검증 — 실제 데이터로 빌드, 전체 스위트, 브라우저 확인

**Files:** 없음(검증 전용 태스크, 코드 변경 없음 — 단, 검증 중 발견되는 문제는 이 태스크 안에서 고친다)

**Interfaces:** 없음 (Task 1~15가 만든 전체 파이프라인을 처음부터 끝까지 실행)

- [ ] **Step 1: 실제 데이터로 site.json + site-restaurant.json 재생성**

```bash
DATA_DIR=data npx tsx src/cli/run.ts site
```

Expected: 에러 없이 두 파일 모두 생성. 콘솔에 카페 줄과 식당 줄 모두 출력.

- [ ] **Step 2: 웹 빌드 전체**

```bash
npm run build:web
```

Expected: `site` 생성 + `next build`(web/) 모두 성공. 타입 에러·린트 에러 0개. (Next.js가 `/restaurant`, `/restaurant/list`, `/restaurant/visited`, `/restaurant/info`, `/restaurant/[id]` 라우트를 전부 인식하고 정적/동적 페이지로 빌드하는지 로그에서 확인.)

- [ ] **Step 3: 전체 테스트 스위트 (파이프라인 + web)**

```bash
npm test
cd web && npm test && cd ..
```

Expected: 전부 통과. 회귀(카페 쪽 기존 테스트) 없음.

- [ ] **Step 4: 개발 서버로 브라우저 확인**

```bash
cd web && npm run dev
```

- 헤더의 "☕ 카페 / 🍚 식당" 스위치가 56px 헤더 안에 들어가는지, 누르면 `/restaurant`로 이동하는지 확인
- `/restaurant/list`에서 음식종류 칩·검색·정렬이 동작하는지 확인
- 식당 하나를 열어 상세 페이지에서 룸/예약/주차 표시, 별점 남기기(로컬 스토어 폴백)가 동작하는지 확인 — 별점을 남기면 "다녀온 식당"에 자동으로 들어가는지도 확인
- `/restaurant/visited`, `/restaurant/info` 렌더 확인
- 다시 헤더 스위치로 카페로 전환했을 때 카페 화면이 이전과 동일하게 동작하는지(회귀 없음) 확인

- [ ] **Step 5: 카페 화면 무변경 최종 확인**

```bash
git diff --stat $(git merge-base HEAD origin/master) -- \
  web/src/app/page.tsx web/src/app/list web/src/app/visited web/src/app/info \
  'web/src/app/cafe/[id]/page.tsx' 'web/src/app/cafe/[id]/wish-heart.tsx' \
  'web/src/app/cafe/[id]/back-link.tsx' web/src/lib/site.ts web/src/lib/site-types.ts \
  web/src/lib/filter.ts web/src/lib/use-wishlist.ts web/src/lib/use-dismissed.ts \
  web/src/app/api/reviews web/src/app/api/visited web/src/app/api/wishlist web/src/app/api/dismissed
```

Expected: **빈 출력.** 이 파일들은 이번 계획 전체에서 단 한 줄도 바뀌지 않아야 한다(순수 추가만 허용된 `layout.tsx`/`tab-bar.tsx`/`thumb.tsx`/`reviews.ts`/`visited-sort.ts`/`cafe/[id]/review-panel.tsx`는 이 목록에서 의도적으로 제외 — 그 파일들은 Diff가 있는 게 정상이다).

- [ ] **Step 6: 스텝 1~5에서 발견된 문제가 있다면 이 자리에서 수정하고 다시 1~5 반복**

- [ ] **Step 7: 최종 커밋 (필요한 경우만 — 발견된 수정 사항이 있을 때)**

```bash
git add -A
git commit -m "fix(restaurant): 최종 통합 검증에서 발견된 문제 수정"
```

(문제가 없었다면 이 스텝은 생략 — 커밋할 변경사항이 없다.)

