# 가볼 곳 추천 웹 화면 (2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가볼 곳 추천 데이터(1단계, master 병합 완료, 실데이터 존재)를 가족용
웹앱(`web/`)에 카페·식당과 동등한 기능(이번 주 추천·전체 목록·상세·다녀온
곳·후기·위시리스트)으로 노출한다.

**Architecture:** 카페·식당 화면과 나란한 `/spot/*` 경로를 새로 만든다.
헤더의 전환 스위치를 2-way(카페/식당)에서 3-way(카페/식당/가볼곳)로
확장한다. 도메인 무관한 lib(`filter.ts`, `reviews.ts`, `store.ts`,
`github-store.ts`, `use-remote-set.ts`, `paging.ts`, `url-state.ts`,
`view-only.ts`, `visited-sort.ts`)와 UI(`filters.tsx`, `thumb.tsx`,
`naver-map-link.tsx`, `Stars`/`StarPicker`)는 그대로 재사용한다. 카드·배지는
이미 추출된 leaf 모듈(`web/src/lib/labels.ts`, `web/src/app/badge.tsx`)에서
직접 import한다 — 식당 2단계가 겪은 페이로드 비대 버그를 재발 자체가
불가능한 구조로 시작한다. 필터 칩은 카페처럼 **다중 선택**(가볼 곳 태그
10개, AND 조합) — 식당의 단일선택 음식종류 칩과 다른 방식이다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, zod(파이프라인
쪽만), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-02-spot-web-ui-design.md`

## Global Constraints

- 지금 배포된 카페·식당 화면(`/`, `/list`, `/visited`, `/info`, `/cafe/[id]`,
  `/restaurant/*`)은 동작이 한 줄도 바뀌지 않는다. 공유 파일(`layout.tsx`,
  `reviews.ts`, `src/cli/run.ts`, `src/store/spot-json-store.ts`)은 **순수
  추가**만 한다. `domain-switch.ts`/`domain-switch.tsx`/`tab-bar.tsx`/
  `back-link.tsx`는 이미 카페/식당 2-way로 동작 중인 기존 파일이라 **3-way로
  확장**하되, 기존 두 도메인의 분기·경로·동작은 절대 안 바꾼다(항목만
  추가).
- 가볼 곳 표시용 데이터는 `data/spot-reviews.json`, `data/spot-visits.json`,
  `data/spot-wishlist.json`, `data/spot-dismissed.json` 4개 새 파일에 쓴다.
  기존 `data/reviews.json`, `data/restaurant-reviews.json` 등은 절대 안
  건드린다.
- `SiteSpot`/`SpotSitePayload` zod 스키마는 `src/spot-schema.ts`에 둔다
  (`src/schema.ts`에 얹지 않는다). web 쪽 타입 사본은
  `web/src/lib/spot-site-types.ts`에 둔다 — zod 의존성이 web 빌드에서
  해석되면 Vercel 빌드가 실패한다(카페·식당 때 실측, `site-types.ts` 자체
  주석 참고).
- **카드·배지는 처음부터 leaf 모듈에서 직접 import한다**: `driveLabel`/
  `addedLabel`은 `web/src/lib/labels.ts`에서, `Badge`는
  `web/src/app/badge.tsx`에서. `web/src/lib/site.ts`나 `web/src/app/cafe-card.tsx`를
  거치지 않는다 — 식당 2단계가 뒤늦게 이 두 파일을 추출해야 했던 페이로드
  비대 버그(카페 2.37MB `site.json`을 모듈 스코프에서 즉시 평가)를 이번엔
  처음부터 피한다.
- 헤더 높이는 56px 고정을 유지한다. 전환 스위치 높이는 36~40px.
- 터치 타겟은 주 조작 44px 이상, 칩·보조 조작 40px 이상.
- 새 API 라우트(`/api/spot/*`)는 기존 라우트와 응답 형태(`ok`/`enabled`/
  `writable` 필드)를 그대로 따른다.
- `SpotStore`(`src/store/spot-json-store.ts`)는 가볼 곳 전용 파일이라
  자유롭게 확장한다 — "카페·식당 영향 0" 제약이 적용되지 않는다.
- 필터 칩은 **다중 선택**이다. `web/src/lib/filter.ts`의 `s.tags.every(t =>
  c.tags.includes(t))`(AND 조합)를 그대로 재사용 — 식당의 단일선택
  라디오 UI를 새로 만들지 않는다.
- `StarPicker`/`Stars`(`web/src/app/cafe/[id]/review-panel.tsx`)는 이미
  export되어 있다(식당 2단계에서 끝남) — 다시 export할 필요 없이 바로
  import한다. `sortVisited`(`web/src/lib/visited-sort.ts`)도 이미
  제네릭이다 — 다시 고칠 필요 없다.

---

### Task 1: SpotStore에 visits/reviews 읽기 추가 + SiteSpotSchema 신설

**Files:**
- Modify: `src/store/spot-json-store.ts` (readSpotVisits/readSpotReviews 추가)
- Modify: `src/spot-schema.ts` (SiteSpotSchema/SiteSpotVisitedSchema/SpotSitePayloadSchema 신설)
- Test: `tests/store/spot-json-store.test.ts` (기존 파일에 케이스 추가)
- Test: `tests/spot-schema.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `src/schema.ts`의 `VisitSchema`/`ReviewSchema`/`Visit`/`Review`/`SiteReviewSchema`(이미 존재, `kakaoPlaceId` 필드로 그대로 호환)
- Produces:
  - `SpotStore.readSpotVisits(): Promise<Visit[]>`
  - `SpotStore.readSpotReviews(): Promise<Review[]>`
  - `SiteSpotSchema`, `SiteSpotVisitedSchema`, `SpotSitePayloadSchema`, `type SpotSitePayload`(Task 2가 씀)

- [ ] **Step 1: SpotStore에 실패하는 테스트 추가**

`tests/store/spot-json-store.test.ts` 파일 끝(기존 `describe` 블록 안)에 추가:

```typescript
it('readSpotVisits: 파일이 없으면 빈 배열', async () => {
  const store = createSpotJsonStore(dir)
  expect(await store.readSpotVisits()).toEqual([])
})

it('readSpotReviews: 파일이 없으면 빈 배열', async () => {
  const store = createSpotJsonStore(dir)
  expect(await store.readSpotReviews()).toEqual([])
})
```

(기존 테스트 파일에 이미 `dir`/`createSpotJsonStore` 셋업이 있으므로 그대로 재사용.)

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run tests/store/spot-json-store.test.ts`
Expected: FAIL — `store.readSpotVisits is not a function`

- [ ] **Step 3: SpotStore 구현 확장**

`src/store/spot-json-store.ts` 상단 import에 `VisitSchema`, `ReviewSchema`, `Visit`, `Review` 추가:

```typescript
import { BuzzSnapshotSchema, SuggestionSchema, VisitSchema, ReviewSchema } from '../schema.js'
import type { BuzzSnapshot, Suggestion, Visit, Review } from '../schema.js'
```

`SpotStore` 인터페이스에 2줄 추가:

```typescript
export interface SpotStore {
  readSpots(): Promise<Spot[]>
  writeSpots(rows: Spot[]): Promise<void>
  readSpotBuzz(): Promise<BuzzSnapshot[]>
  writeSpotBuzz(rows: BuzzSnapshot[]): Promise<void>
  readSpotSuggestions(): Promise<Suggestion[]>
  writeSpotSuggestions(rows: Suggestion[]): Promise<void>
  readSpotVisits(): Promise<Visit[]>
  readSpotReviews(): Promise<Review[]>
  readHealth(): Promise<Health[]>
  writeHealth(rows: Health[]): Promise<void>
  appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
}
```

`createSpotJsonStore`의 반환 객체에 2개 메서드 추가(`readHealth` 줄 바로 위):

```typescript
    // 웹앱(github-store)이 쓰는 것과 같은 파일 이름 규칙 — data/spot-visits.json,
    // data/spot-reviews.json. 카페·식당 파일은 절대 안 건드린다.
    readSpotVisits: () => readArray(dataDir, 'spot-visits.json', VisitSchema),
    readSpotReviews: () => readArray(dataDir, 'spot-reviews.json', ReviewSchema),

    readHealth: () => readArray(dataDir, 'health.json', HealthSchema),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/store/spot-json-store.test.ts`
Expected: PASS

- [ ] **Step 5: SiteSpotSchema 신설 — 실패하는 테스트 먼저**

`tests/spot-schema.test.ts` 파일 끝에 추가:

```typescript
describe('SiteSpotSchema (2단계 웹 표시용)', () => {
  it('가볼 곳 표시용 필드를 검증한다', () => {
    const row = {
      id: '1', name: '아무개공원', sigungu: '부평구', zone: 'near', area: '인천',
      driveMinutes: 20, tags: ['자연/공원', '아이와 가기 좋은 곳'],
      parkingGrade: 'A', evidence: '넓고 좋다', parkingEvidence: '주차장 넓음',
      stayDuration: '1~2시간', indoorOutdoor: 'outdoor', season: null, teenAppeal: null,
      naverMapUrl: 'https://map.naver.com/p/search/x', kakaoPlaceUrl: null, imageUrl: null,
      hotScore: 5, finalScore: 3, postsPer30: 5, posts30: 3, posts90: 8,
      acceleration: 1, trend: 'steady', ratingAvg: 0, ratingCount: 0,
      familyReviews: [], cityOnly: false, visitedOn: null,
      firstSeenAt: '2026-08-01T00:00:00.000Z', isNew: true, lastSeenAt: null,
    }
    expect(() => SiteSpotSchema.parse(row)).not.toThrow()
  })

  it('SpotSitePayloadSchema가 week/stats 구조를 검증한다', () => {
    const payload = {
      generatedAt: '2026-09-02T00:00:00.000Z', weekOf: '2026-08-31',
      week: [{ rank: 1, id: '1', finalScore: 3 }],
      spots: [], visited: [],
      stats: {
        discovered: 0, passed: 0, regions: 0, scannedRegions: 0,
        driveMeasured: 0, revisitDays: 180, cityOnly: 0, staleDays: 21,
      },
    }
    expect(() => SpotSitePayloadSchema.parse(payload)).not.toThrow()
  })
})
```

파일 상단 import에 `SiteSpotSchema`, `SpotSitePayloadSchema` 추가.

- [ ] **Step 6: 테스트 실행해서 실패 확인**

Run: `npx vitest run tests/spot-schema.test.ts`
Expected: FAIL — `SiteSpotSchema is not defined`

- [ ] **Step 7: 스키마 구현**

`src/spot-schema.ts` 파일 끝에 추가. `SiteReviewSchema`를 `./schema.js`에서
import하도록 상단 import에 추가:

```typescript
import { HealthSchema, SiteReviewSchema } from './schema.js'
```

파일 끝에 추가:

```typescript
/** 2단계 웹 표시용 스키마. SiteRestaurantSchema와 동등한 필드 —
 * cuisineType(단일값) 자리에 tags(다중값), hasRoom/reservable 자리에
 * stayDuration/indoorOutdoor/season을 쓴다. */
export const SiteSpotSchema = z.object({
  id: z.string(),
  name: z.string(),
  sigungu: z.string(),
  zone: z.enum(['near', 'seoul', 'north', 'east', 'south', 'west']),
  area: z.string(),
  driveMinutes: z.number().int().nullable(),

  tags: z.array(z.string()),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),
  evidence: z.string(),
  parkingEvidence: z.string(),
  stayDuration: z.string().nullable(),
  indoorOutdoor: z.enum(['indoor', 'outdoor', 'mixed']).nullable(),
  season: z.string().nullable(),
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
export type SiteSpot = z.infer<typeof SiteSpotSchema>

export const SiteSpotVisitedSchema = z.object({
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
export type SiteSpotVisited = z.infer<typeof SiteSpotVisitedSchema>

export const SpotSitePayloadSchema = z.object({
  generatedAt: z.string(),
  weekOf: z.string(),
  week: z.array(z.object({
    rank: z.number().int(),
    id: z.string(),
    finalScore: z.number(),
  })),
  spots: z.array(SiteSpotSchema),
  visited: z.array(SiteSpotVisitedSchema),
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
export type SpotSitePayload = z.infer<typeof SpotSitePayloadSchema>
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npx vitest run tests/spot-schema.test.ts`
Expected: PASS

- [ ] **Step 9: 전체 스위트 + 타입체크**

Run: `npm test && npx tsc --noEmit`
Expected: 전부 통과, 에러 0개

- [ ] **Step 10: 커밋**

```bash
git add src/store/spot-json-store.ts src/spot-schema.ts tests/store/spot-json-store.test.ts tests/spot-schema.test.ts
git commit -m "feat(spot): 웹 표시용 스키마 신설 + visits/reviews 읽기"
```

---

### Task 2: buildSpotSitePayload

**Files:**
- Create: `src/site/spot-payload.ts`
- Test: `tests/site/spot-payload.test.ts`

**Interfaces:**
- Consumes: `SpotStore`(Task 1), `SiteSpotSchema`/`SpotSitePayloadSchema`(Task 1),
  `pickWeek` 로직(직접 재구현, 카페·식당과 동일 패턴), `REVISIT_DAYS`/`isRevisitReady`
  (`../pipeline/revisit.js`), `zoneOf`(`../config/zones.js`), `areaOf`
  (`../config/area.js`), `isNewCafe`(`../config/newness.js`, 이름은 카페용이지만
  `firstSeenAt`/`now`만 받는 순수 함수라 재사용), `naverMapLink`
  (`../pipeline/place-query.js`), `spotFamilyFit`(`../pipeline/spot-score.js`,
  Phase 1), `finalScore`/`hotScore`(`../pipeline/score.js`), `passesGate`
  (`../pipeline/gate.js`), `spotDriveMinutesOf`(`../jobs/spot-drive-times.js`),
  `STALE_DAYS`(`../jobs/spot-liveness.js`)
- Produces: `buildSpotSitePayload(input: SpotPayloadInput): SpotSitePayload`,
  `spotTrendOf`, `dedupeSpotListings` (Task 3이 씀)

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/site/spot-payload.test.ts
import { describe, it, expect } from 'vitest'
import { buildSpotSitePayload, spotTrendOf, dedupeSpotListings } from '../../src/site/spot-payload.js'
import {
  SpotSitePayloadSchema, type SpotAttributes, type Spot, type SiteSpot,
} from '../../src/spot-schema.js'
import type { BuzzSnapshot, Visit, Review } from '../../src/schema.js'

const NOW = new Date('2026-09-02T00:00:00Z')

const attrs = (over: Partial<SpotAttributes> = {}): SpotAttributes => ({
  tags: ['자연/공원'], evidence: '넓고 좋다', parkingGrade: 'A', parkingEvidence: '주차장 넓음',
  stayDuration: '1~2시간', indoorOutdoor: 'outdoor', season: null,
  teenAppeal: 3, confidence: 0.9, extractedAt: NOW.toISOString(), modelVersion: 'v1',
  ...over,
})

const spot = (id: string, over: Partial<Spot> = {}): Spot => ({
  kakaoPlaceId: id, name: `공원${id}`, sigungu: '부평구', lat: 37.5, lng: 126.7,
  naverMapUrl: 'https://map.naver.com/p/search/x', kakaoPlaceUrl: 'http://place.map.kakao.com/1',
  firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active', ambiguousName: false,
  attributes: attrs(), tags: ['자연/공원'],
  ...over,
})

const buzz = (id: string, over: Partial<BuzzSnapshot> = {}): BuzzSnapshot => ({
  kakaoPlaceId: id, capturedAt: '2026-09-01',
  receivedCount: 50, relevantCount: 40, precision: 0.8,
  spanDays: 20, postsPer30: 60, posts30d: 30, postsPrev: 15,
  firstPostDate: '2026-08-01', latestPostDate: '2026-09-01',
  acceleration: 1.6, suspectAmbiguous: false,
  ...over,
})

const build = (
  spots: Spot[], buzzRows: BuzzSnapshot[],
  over: Partial<Parameters<typeof buildSpotSitePayload>[0]> = {},
) => buildSpotSitePayload({
  spots, buzz: buzzRows, visits: [], suggestions: [], reviews: [],
  weekOf: '2026-09-01', now: NOW, ...over,
})

describe('buildSpotSitePayload', () => {
  it('스키마를 만족하는 페이로드를 만든다', () => {
    const p = build([spot('1')], [buzz('1')])
    expect(() => SpotSitePayloadSchema.parse(p)).not.toThrow()
    expect(p.spots).toHaveLength(1)
  })

  it('판정 전·숨김·태그 0개는 싣지 않는다', () => {
    const p = build(
      [
        spot('1'),
        spot('2', { status: 'pending_extraction', attributes: null }),
        spot('3', { status: 'hidden' }),
        spot('4', { attributes: attrs({ tags: [] }), tags: [] }),
      ],
      ['1', '2', '3', '4'].map((id) => buzz(id)),
    )
    expect(p.spots.map((s) => s.id)).toEqual(['1'])
  })

  it('같은 이름+시군구는 하나로 합친다 (도로명 주소 있는 쪽을 남긴다)', () => {
    const dupe = spot('2', { name: '공원1', roadAddress: '인천 부평구 1' })
    const p = build([spot('1'), dupe], [buzz('1'), buzz('2')])
    expect(p.spots).toHaveLength(1)
    expect(p.spots[0]!.id).toBe('2')
  })
})

describe('spotTrendOf', () => {
  it('90일 창을 못 채우면 unknown', () => {
    expect(spotTrendOf({ posts30d: 10, postsPrev: 5, spanDays: 40 })).toBe('unknown')
  })
})

describe('dedupeSpotListings', () => {
  it('빈 목록은 빈 목록', () => {
    expect(dedupeSpotListings([], new Map())).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run tests/site/spot-payload.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 구현**

`src/site/restaurant-payload.ts`의 구조를 그대로 따르되 `cuisineType`/
`hasRoom`/`reservable` 자리에 `tags`(다중값)/`stayDuration`/`indoorOutdoor`/
`season`을 쓴다:

```typescript
// src/site/spot-payload.ts
import { spotDriveMinutesOf } from '../jobs/spot-drive-times.js'
import { STALE_DAYS } from '../jobs/spot-liveness.js'
import { zoneOf } from '../config/zones.js'
import { areaOf } from '../config/area.js'
import { isNewCafe } from '../config/newness.js'
import { isRevisitReady, REVISIT_DAYS } from '../pipeline/revisit.js'
import { REGIONS } from '../config/regions.js'
import { naverMapLink } from '../pipeline/place-query.js'
import { spotFamilyFit } from '../pipeline/spot-score.js'
import { finalScore, hotScore } from '../pipeline/score.js'
import { passesGate } from '../pipeline/gate.js'
import {
  SpotSitePayloadSchema,
  type Spot, type SiteSpot, type SiteSpotVisited, type SpotSitePayload,
} from '../spot-schema.js'
import type { BuzzSnapshot, Suggestion, Visit, Review } from '../schema.js'

export interface SpotPayloadInput {
  spots: Spot[]
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
const KIDS_TAG = '아이와 가기 좋은 곳'

export function spotTrendOf(
  b: { posts30d: number; postsPrev: number; spanDays: number },
): 'rising' | 'steady' | 'unknown' {
  if (b.spanDays < COMPARABLE_SPAN_DAYS || b.postsPrev === 0) return 'unknown'
  const baseline = b.postsPrev / 2
  return b.posts30d >= baseline * 1.5 ? 'rising' : 'steady'
}

export function dedupeSpotListings(
  rows: SiteSpot[],
  byId: Map<string, Spot>,
): SiteSpot[] {
  const best = new Map<string, SiteSpot>()
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

function betterListing(a: SiteSpot, b: SiteSpot, byId: Map<string, Spot>): boolean {
  const addr = (r: SiteSpot) => Boolean(byId.get(r.id)?.roadAddress)
  if (addr(a) !== addr(b)) return addr(a)
  if (a.finalScore !== b.finalScore) return a.finalScore > b.finalScore
  return a.id.localeCompare(b.id) < 0
}

function pickSpotWeek(
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

export function buildSpotSitePayload(input: SpotPayloadInput): SpotSitePayload {
  const { spots, buzz, visits, suggestions, weekOf, now, reviews = [] } = input

  const rated = new Map<string, { sum: number; n: number }>()
  for (const r of reviews) {
    const cur = rated.get(r.kakaoPlaceId) ?? { sum: 0, n: 0 }
    rated.set(r.kakaoPlaceId, { sum: cur.sum + r.rating, n: cur.n + 1 })
  }
  const bySpotReviews = new Map<string, SiteSpot['familyReviews']>()
  for (const r of [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const list = bySpotReviews.get(r.kakaoPlaceId) ?? []
    if (list.length >= REVIEWS_IN_PAYLOAD) continue
    list.push({ nickname: r.nickname, rating: r.rating, comment: r.comment, createdAt: r.createdAt })
    bySpotReviews.set(r.kakaoPlaceId, list)
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

  const rows: SiteSpot[] = []
  for (const s of spots) {
    if (s.status !== 'active') continue
    const a = s.attributes
    if (!a) continue
    if (!passesGate({ tags: s.tags, parkingGrade: a.parkingGrade }, { cityMode: true }).pass) continue
    const b = latestBuzz.get(s.kakaoPlaceId)
    if (!b) continue

    const hot = hotScore(b, now)
    const fit = spotFamilyFit(
      {
        driveMinutes: spotDriveMinutesOf(s) ?? 90,
        parkingGrade: a.parkingGrade,
        hasKidsTag: s.tags.includes(KIDS_TAG),
        lastVisitedOn: lastVisit.get(s.kakaoPlaceId) ?? null,
        outdoorOnly: a.indoorOutdoor === 'outdoor',
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    rows.push({
      id: s.kakaoPlaceId,
      name: s.name,
      sigungu: s.sigungu,
      zone: zoneOf(s),
      area: areaOf({ ...s, zone: zoneOf(s) }),
      driveMinutes: spotDriveMinutesOf(s),
      tags: s.tags,
      parkingGrade: a.parkingGrade,
      evidence: a.evidence,
      parkingEvidence: a.parkingEvidence,
      stayDuration: a.stayDuration,
      indoorOutdoor: a.indoorOutdoor,
      season: a.season,
      teenAppeal: a.teenAppeal ?? null,
      naverMapUrl: naverMapLink(s),
      kakaoPlaceUrl: s.kakaoPlaceUrl ?? null,
      imageUrl: s.imageUrl ?? null,
      hotScore: Number(hot.toFixed(1)),
      finalScore: Number(finalScore(hot, fit).toFixed(3)),
      postsPer30: b.postsPer30,
      posts30: b.posts30d,
      posts90: b.posts30d + b.postsPrev,
      acceleration: b.acceleration,
      trend: spotTrendOf(b),
      ratingAvg: Number(((rated.get(s.kakaoPlaceId)?.sum ?? 0)
        / (rated.get(s.kakaoPlaceId)?.n || 1)).toFixed(1)),
      ratingCount: rated.get(s.kakaoPlaceId)?.n ?? 0,
      familyReviews: bySpotReviews.get(s.kakaoPlaceId) ?? [],
      cityOnly: a.parkingGrade === 'C',
      visitedOn: lastVisit.get(s.kakaoPlaceId) ?? null,
      firstSeenAt: s.firstSeenAt,
      isNew: isNewCafe(s.firstSeenAt, now),
      lastSeenAt: s.lastSeenAt ?? null,
    })
  }

  rows.sort((x, y) => y.finalScore - x.finalScore || x.id.localeCompare(y.id))

  const byId = new Map(spots.map((s) => [s.kakaoPlaceId, s]))
  const deduped = dedupeSpotListings(rows, byId)

  const visited: SiteSpotVisited[] = [...lastVisit.entries()]
    .flatMap(([id, on]) => {
      const s = byId.get(id)
      if (!s) return []
      const note = visits.find((v) => v.kakaoPlaceId === id && v.visitedOn === on)?.note ?? ''
      const rt = rated.get(id)
      return [{
        id, name: s.name, sigungu: s.sigungu, area: areaOf({ ...s, zone: zoneOf(s) }),
        visitedOn: on, note, tags: s.tags,
        naverMapUrl: naverMapLink(s), imageUrl: s.imageUrl ?? null,
        ratingAvg: Number(((rt?.sum ?? 0) / (rt?.n || 1)).toFixed(1)),
        ratingCount: rt?.n ?? 0,
      }]
    })
    .sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))

  const ids = new Set(deduped.map((r) => r.id))
  const week = pickSpotWeek(suggestions, weekOf, ids, { lastVisit, now })

  return SpotSitePayloadSchema.parse({
    generatedAt: now.toISOString(),
    weekOf,
    week,
    spots: deduped,
    visited,
    stats: {
      discovered: spots.length,
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

Run: `npx vitest run tests/site/spot-payload.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 스위트 + 타입체크**

Run: `npm test && npx tsc --noEmit`
Expected: 전부 통과, 에러 0개

- [ ] **Step 6: 커밋**

```bash
git add src/site/spot-payload.ts tests/site/spot-payload.test.ts
git commit -m "feat(spot): buildSpotSitePayload — 웹 표시용 페이로드 생성기"
```

---

### Task 3: CLI `site` 케이스에 가볼 곳 페이로드 생성 연결 (공유 파일 순수 추가)

**Files:**
- Modify: `src/cli/run.ts`(`case 'site':` 블록, 식당 try/catch 블록 바로 다음)

**Interfaces:**
- Consumes: `buildSpotSitePayload`(Task 2), `createSpotJsonStore`(이미 import되어 있음)
- Produces: `web/src/generated/site-spot.json`(실행 시 생성, 커밋 대상 아님 — 카페·식당과 같은 취급)

- [ ] **Step 1: run.ts 상단에 import 추가**

기존 import 블록의 `buildRestaurantSitePayload` import 바로 아래에 추가:

```typescript
import { buildSpotSitePayload } from '../site/spot-payload.js'
```

- [ ] **Step 2: `case 'site':` 블록의 식당 try/catch 다음에 가볼 곳 블록 추가**

식당 블록(`try { ... createRestaurantJsonStore ... } catch (e) { console.error(...) }`)이
끝나는 `}` 바로 다음, `break`직전에 같은 모양으로 추가한다:

```typescript
      // 가볼 곳 페이로드도 같은 case 에서 만든다 — 독립된 try/catch로 감싼다.
      // 가볼 곳 데이터 문제가 카페·식당 빌드를 막으면 안 된다(식당과 같은 이유).
      try {
        const spotStore = createSpotJsonStore(process.env.DATA_DIR ?? 'data')
        const spotOut = flag(rest, 'spot-out') || 'web/src/generated/site-spot.json'
        const [spots, spotBuzz, spotVisits, spotSuggestions, spotReviews] = await Promise.all([
          spotStore.readSpots(), spotStore.readSpotBuzz(),
          spotStore.readSpotVisits(), spotStore.readSpotSuggestions(),
          spotStore.readSpotReviews(),
        ])
        const spotPayload = buildSpotSitePayload({
          spots, buzz: spotBuzz, visits: spotVisits, suggestions: spotSuggestions,
          reviews: spotReviews, weekOf: mondayOf(now), now,
        })
        await mkdir(dirname(spotOut), { recursive: true })
        await writeFile(spotOut, JSON.stringify(spotPayload, null, 2) + '\n', 'utf8')
        console.log(
          `${spotOut}\n  가볼 곳 ${spotPayload.spots.length}곳`
          + ` (일반 ${spotPayload.stats.passed} / 도심전용 ${spotPayload.stats.cityOnly})`,
        )
      } catch (e) {
        console.error(`[!] 가볼 곳 페이로드 생성 실패 — 카페·식당 빌드는 계속 진행한다: ${(e as Error).message}`)
      }
```

- [ ] **Step 3: 실행해서 확인**

```bash
DATA_DIR=data npx tsx src/cli/run.ts site
```

Expected: `web/src/generated/site.json`, `site-restaurant.json`,
`site-spot.json` 셋 다 생성. 콘솔에 세 줄 모두 출력.

- [ ] **Step 4: 전체 스위트 + 타입체크**

Run: `npm test && npx tsc --noEmit`
Expected: 전부 통과, 에러 0개

- [ ] **Step 5: 커밋**

```bash
git add src/cli/run.ts
git commit -m "feat(spot): CLI site 명령에서 site-spot.json 도 생성"
```

---

### Task 4: web/src/lib/spot-site-types.ts + spot-site.ts

**Files:**
- Create: `web/src/lib/spot-site-types.ts`
- Create: `web/src/lib/spot-site.ts`
- Test: `tests/site/spot-types-conformance.test.ts`

**Interfaces:**
- Consumes: `web/src/generated/site-spot.json`(Task 3이 만듦 — 이 태스크
  실행 전에 로컬에서 `npx tsx src/cli/run.ts site`로 한 번 생성해 둔다. 없으면
  Step 2b에서 최소 스텁 파일을 만든다)
- Produces: `SiteSpot`, `SiteSpotVisited`, `SpotSitePayload`(타입), `spotPayload`,
  `SpotListRow`, `toSpotListRow`, `spotById`, `spotHomeFeed`, `SPOT_TAG_LABEL`,
  `PARKING_LABEL`(이미 restaurant-site.ts에 있지만 spot-site.ts는 독립 파일이라
  같은 상수를 다시 정의한다 — 순환 없이 각자 완결), `SPOT_REVISIT_DAYS`,
  `spotRecentlyVisited`, `SPOT_STALE_DAYS`, `spotIsStale`, `spotHiddenByVisit`
  (Task 9~15가 씀)

- [ ] **Step 1: spot-site-types.ts 작성**

`web/src/lib/restaurant-site-types.ts`와 1:1 대응하는 순수 인터페이스 파일.
zod에 의존하지 않는다:

```typescript
// web/src/lib/spot-site-types.ts
/**
 * 가볼 곳 표시용 페이로드 타입. site-types.ts(카페)와 같은 이유로 zod
 * 의존성이 없는 순수 인터페이스 파일이다. 드리프트는
 * tests/site/spot-types-conformance.test.ts 가 잡는다.
 */
export interface SiteSpot {
  id: string
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

export interface SpotSitePayload {
  generatedAt: string
  weekOf: string
  week: { rank: number; id: string; finalScore: number }[]
  spots: SiteSpot[]
  visited: SiteSpotVisited[]
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

- [ ] **Step 2: spot-site.ts 작성**

```typescript
// web/src/lib/spot-site.ts
import raw from '../generated/site-spot.json'
import { driveLabel, addedLabel } from './labels'
import type { SpotSitePayload, SiteSpot, SiteSpotVisited } from './spot-site-types'

export type { SiteSpot, SpotSitePayload, SiteSpotVisited }
export { driveLabel, addedLabel }

export const spotPayload = raw as unknown as SpotSitePayload

export type SpotListRow = Pick<
  SiteSpot,
  'id' | 'name' | 'sigungu' | 'area' | 'driveMinutes' | 'tags' | 'parkingGrade'
  | 'stayDuration' | 'indoorOutdoor' | 'season' | 'evidence' | 'naverMapUrl' | 'imageUrl'
  | 'hotScore' | 'finalScore' | 'ratingAvg' | 'ratingCount' | 'cityOnly' | 'visitedOn'
  | 'isNew' | 'firstSeenAt' | 'lastSeenAt'
>

const CARD_EVIDENCE_CHARS = 90

export function toSpotListRow(s: SiteSpot): SpotListRow {
  return {
    id: s.id, name: s.name, sigungu: s.sigungu, area: s.area, driveMinutes: s.driveMinutes,
    tags: s.tags, parkingGrade: s.parkingGrade, stayDuration: s.stayDuration,
    indoorOutdoor: s.indoorOutdoor, season: s.season,
    evidence: s.evidence.length > CARD_EVIDENCE_CHARS
      ? s.evidence.slice(0, CARD_EVIDENCE_CHARS) + '…'
      : s.evidence,
    naverMapUrl: s.naverMapUrl, imageUrl: s.imageUrl, hotScore: s.hotScore, finalScore: s.finalScore,
    ratingAvg: s.ratingAvg, ratingCount: s.ratingCount, cityOnly: s.cityOnly, visitedOn: s.visitedOn,
    isNew: s.isNew, firstSeenAt: s.firstSeenAt, lastSeenAt: s.lastSeenAt,
  }
}

export const spotById = (id: string): SiteSpot | undefined =>
  spotPayload.spots.find((s) => s.id === id)

export const SPOT_REVISIT_DAYS = spotPayload.stats.revisitDays

export function spotRecentlyVisited(visitedOn: string | null, now = new Date()): boolean {
  if (!visitedOn) return false
  const days = (now.getTime() - new Date(visitedOn).getTime()) / 86_400_000
  return days >= 0 && days <= SPOT_REVISIT_DAYS
}

export const SPOT_STALE_DAYS = spotPayload.stats.staleDays

export function spotIsStale(lastSeenAt: string | null, now = new Date()): boolean {
  if (!lastSeenAt) return false
  const days = (now.getTime() - new Date(lastSeenAt).getTime()) / 86_400_000
  return days > SPOT_STALE_DAYS
}

export function spotHiddenByVisit(
  visits: { kakaoPlaceId: string; visitedOn: string }[],
  now = new Date(),
): Set<string> {
  return new Set(
    visits.filter((v) => spotRecentlyVisited(v.visitedOn, now)).map((v) => v.kakaoPlaceId),
  )
}

/** 이번 주 추천. 카페·식당의 homeFeed와 동일한 로직 */
export function spotHomeFeed(now = new Date()): SiteSpot[] {
  const fresh = (s: SiteSpot) => !s.cityOnly && !spotRecentlyVisited(s.visitedOn, now)
  const ranked = spotPayload.week
    .map((w) => spotById(w.id))
    .filter((s): s is SiteSpot => s !== undefined && fresh(s))
  const seen = new Set(ranked.map((s) => s.id))
  const rest = spotPayload.spots.filter((s) => fresh(s) && !seen.has(s.id))
  return [...ranked, ...rest]
}

/** 10개 태그 라벨. 표시 문구가 필요할 때만 거친다 — 지금은 원문과 동일 */
export const SPOT_TAG_LABEL: Record<string, string> = {
  '자연/공원': '자연/공원', '관광지/명소': '관광지/명소', '시장/전통거리': '시장/전통거리',
  '쇼핑/아울렛': '쇼핑/아울렛', '전시/박물관': '전시/박물관', '소품샵/편집숍': '소품샵/편집숍',
  '드라이브': '드라이브', '체험': '체험', '계절명소': '계절명소', '아이와 가기 좋은 곳': '아이와 가기 좋은 곳',
}

export const PARKING_LABEL: Record<string, string> = {
  A: '주차 넉넉', B: '주차 보통', C: '주차 어려움', D: '주차 불가', '?': '주차 미확인',
}

export const INDOOR_OUTDOOR_LABEL: Record<string, string> = {
  indoor: '실내', outdoor: '실외', mixed: '실내+실외',
}
```

- [ ] **Step 2b: web/src/generated/site-spot.json 최소 파일 준비**

```bash
mkdir -p web/src/generated
cat > web/src/generated/site-spot.json <<'JSON'
{"generatedAt":"","weekOf":"","week":[],"spots":[],"visited":[],"stats":{"discovered":0,"passed":0,"regions":0,"scannedRegions":0,"driveMeasured":0,"revisitDays":180,"cityOnly":0,"staleDays":21}}
JSON
```

(`git ls-files web/src/generated/`로 카페·식당 파일이 커밋되어 있는지 확인하고, 그렇다면 이 파일도 같이 커밋한다.)

- [ ] **Step 3: 타입체크로 확인**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개

- [ ] **Step 4: 타입 정합성 테스트**

```typescript
// tests/site/spot-types-conformance.test.ts
import { describe, it, expect } from 'vitest'
import type {
  SpotSitePayload as FromSchema, SiteSpot as SpotFromSchema,
} from '../../src/spot-schema.js'
import type {
  SpotSitePayload as FromWeb, SiteSpot as SpotFromWeb,
} from '../../web/src/lib/spot-site-types.js'

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

describe('가볼 곳 표시용 페이로드 타입', () => {
  it('zod 스키마와 웹 인터페이스가 서로 대입된다', () => {
    const bothWays: Exact<FromSchema, FromWeb> = true
    expect(bothWays).toBe(true)
  })

  it('가볼 곳 한 건도 서로 대입된다', () => {
    const bothWays: Exact<SpotFromSchema, SpotFromWeb> = true
    expect(bothWays).toBe(true)
  })
})
```

Run: `npx vitest run tests/site/spot-types-conformance.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 스위트 + 타입체크**

Run: `npm test && npx tsc --noEmit && cd web && npx tsc --noEmit && cd ..`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add web/src/lib/spot-site-types.ts web/src/lib/spot-site.ts web/src/generated/site-spot.json tests/site/spot-types-conformance.test.ts
git commit -m "feat(spot): 가볼 곳판 site.ts/site-types.ts + 타입 정합성 테스트"
```

---

### Task 5: reviews.ts 경로 상수 추가 (공유 파일 순수 추가) + 가볼 곳 API 라우트 4종

**Files:**
- Modify: `web/src/lib/reviews.ts` (경로 상수 4개 추가 — 그 외 아무것도 안 바꾼다)
- Create: `web/src/app/api/spot/reviews/route.ts`
- Create: `web/src/app/api/spot/visited/route.ts`
- Create: `web/src/app/api/spot/wishlist/route.ts`
- Create: `web/src/app/api/spot/dismissed/route.ts`

**Interfaces:**
- Consumes: `spotById`(Task 4), `Review`/`VisitRow`/`WishRow`/`DismissRow`/
  `parseReviewInput`/`applyReviewPatch`/`removeReview`/`addVisit`/`removeVisit`/
  `addWish`/`removeWish`/`addDismiss`/`removeDismiss`/`summarize`/`sortByNewest`/
  `todayInSeoul`(전부 `reviews.ts`에 이미 존재, 재사용), `writeStore`(재사용),
  `hostCanWrite`(재사용)
- Produces: `SPOT_REVIEWS_PATH`, `SPOT_VISITS_PATH`, `SPOT_WISHLIST_PATH`,
  `SPOT_DISMISSED_PATH`(export from reviews.ts, Task 14가 씀).
  `/api/spot/{reviews,visited,wishlist,dismissed}`(Task 11~14가 씀)

- [ ] **Step 1: reviews.ts에 경로 상수 4개 추가**

기존 `RESTAURANT_*_PATH` 4줄 바로 아래에 추가:

```typescript
// 가볼 곳판. 카페·식당 파일은 절대 안 건드린다.
export const SPOT_REVIEWS_PATH = 'data/spot-reviews.json'
export const SPOT_VISITS_PATH = 'data/spot-visits.json'
export const SPOT_WISHLIST_PATH = 'data/spot-wishlist.json'
export const SPOT_DISMISSED_PATH = 'data/spot-dismissed.json'
```

- [ ] **Step 2: 4개 API 라우트를 식당 쪽 그대로 복사 + byId·경로만 교체**

`web/src/app/api/spot/visited/route.ts`(식당 `api/restaurant/visited/route.ts` 그대로, `restaurantById`→`spotById`, `RESTAURANT_VISITS_PATH`→`SPOT_VISITS_PATH`, "식당"→"장소"):

```typescript
import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { spotById } from '@/lib/spot-site'
import { addVisit, removeVisit, todayInSeoul, SPOT_VISITS_PATH, type VisitRow } from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ visits: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<VisitRow>(SPOT_VISITS_PATH)
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

  let spot = ''
  let remove = false
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown; action?: unknown }
    spot = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
    remove = body.action === 'remove'
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!spot) return NextResponse.json({ error: '장소를 알 수 없습니다' }, { status: 400 })
  if (!remove && !spotById(spot)) {
    return NextResponse.json({ error: '목록에 없는 장소입니다' }, { status: 400 })
  }

  const visitedOn = todayInSeoul()
  try {
    const rows = await store.update<VisitRow>(
      SPOT_VISITS_PATH,
      remove ? 'data: 다녀왔어요 취소' : `data: 다녀왔어요 ${visitedOn}`,
      (prev) => (remove ? removeVisit(prev, spot) : addVisit(prev, spot, visitedOn)),
    )
    const visited = rows.some((v) => v.kakaoPlaceId === spot)
    return NextResponse.json({ visited, visitedOn: remove ? null : visitedOn })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
```

`web/src/app/api/spot/wishlist/route.ts`(식당 것 그대로, `spotById`/`SPOT_WISHLIST_PATH`로 교체):

```typescript
import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { spotById } from '@/lib/spot-site'
import { addWish, removeWish, todayInSeoul, SPOT_WISHLIST_PATH, type WishRow } from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ wishes: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<WishRow>(SPOT_WISHLIST_PATH)
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

  let spot = ''
  let remove = false
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown; action?: unknown }
    spot = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
    remove = body.action === 'remove'
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!spot) return NextResponse.json({ error: '장소를 알 수 없습니다' }, { status: 400 })
  if (!remove && !spotById(spot)) {
    return NextResponse.json({ error: '목록에 없는 장소입니다' }, { status: 400 })
  }

  try {
    const rows = await store.update<WishRow>(
      SPOT_WISHLIST_PATH,
      remove ? 'data: 위시리스트에서 빼기' : 'data: 위시리스트에 담기',
      (prev) => (remove ? removeWish(prev, spot) : addWish(prev, spot, todayInSeoul())),
    )
    const wished = rows.some((w) => w.kakaoPlaceId === spot)
    return NextResponse.json({ wished })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
```

`web/src/app/api/spot/dismissed/route.ts`(식당 것 그대로, `SPOT_DISMISSED_PATH`로 교체):

```typescript
import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import {
  addDismiss, SPOT_DISMISSED_PATH, removeDismiss, todayInSeoul, type DismissRow,
} from '@/lib/reviews'

export async function GET(req: Request) {
  const store = await writeStore()
  const writeOk = store.writable && hostCanWrite(req.headers.get('host'))
  if (!store.enabled) {
    return NextResponse.json({ dismissed: [], enabled: false, writable: false, ok: false })
  }
  try {
    const rows = await store.read<DismissRow>(SPOT_DISMISSED_PATH)
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

  let spot = ''
  let remove = false
  try {
    const body = (await req.json()) as { kakaoPlaceId?: unknown; action?: unknown }
    spot = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
    remove = body.action === 'remove'
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!spot) return NextResponse.json({ error: '장소를 알 수 없습니다' }, { status: 400 })

  try {
    const rows = await store.update<DismissRow>(
      SPOT_DISMISSED_PATH,
      remove ? 'data: 폐업 의심 숨김 취소' : 'data: 폐업 의심 숨기기',
      (prev) => (remove ? removeDismiss(prev, spot) : addDismiss(prev, spot, todayInSeoul())),
    )
    const dismissed = rows.some((d) => d.kakaoPlaceId === spot)
    return NextResponse.json({ dismissed })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
```

`web/src/app/api/spot/reviews/route.ts`(식당 `api/restaurant/reviews/route.ts` 전체를 그대로, `restaurantById`→`spotById`, `RESTAURANT_REVIEWS_PATH`→`SPOT_REVIEWS_PATH`, `RESTAURANT_VISITS_PATH`→`SPOT_VISITS_PATH`, "식당"→"장소"):

```typescript
import { NextResponse } from 'next/server'
import { writeStore } from '@/lib/store'
import { hostCanWrite } from '@/lib/view-only'
import { spotById } from '@/lib/spot-site'
import {
  addVisit, applyReviewPatch, parseReviewInput, removeReview, sortByNewest, summarize,
  todayInSeoul, SPOT_REVIEWS_PATH, SPOT_VISITS_PATH, type Review, type VisitRow,
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
  const spot = new URL(req.url).searchParams.get('spot')
  if (!store.enabled) {
    return NextResponse.json({
      reviews: [], summary: { count: 0, average: 0 }, enabled: false, writable: false, ok: false,
    })
  }
  try {
    const rows = await store.read<Review>(SPOT_REVIEWS_PATH)
    const mine = spot ? rows.filter((r) => r.kakaoPlaceId === spot) : rows
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
  if (!spotById(parsed.review.kakaoPlaceId)) {
    return NextResponse.json({ error: '목록에 없는 장소입니다' }, { status: 400 })
  }

  try {
    const rows = await store.update<Review>(
      SPOT_REVIEWS_PATH,
      `data: 후기 (${parsed.review.nickname || '가족'})`,
      (prev) => [...prev, parsed.review],
    )
    const mine = rows.filter((r) => r.kakaoPlaceId === parsed.review.kakaoPlaceId)

    let visitedOn: string | null = null
    try {
      const visits = await store.read<VisitRow>(SPOT_VISITS_PATH)
      if (!visits.some((v) => v.kakaoPlaceId === parsed.review.kakaoPlaceId)) {
        visitedOn = todayInSeoul()
        await store.update<VisitRow>(
          SPOT_VISITS_PATH,
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
      SPOT_REVIEWS_PATH,
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
  let spot = ''
  try {
    const body = (await req.json()) as { id?: unknown; kakaoPlaceId?: unknown }
    id = typeof body.id === 'string' ? body.id.trim() : ''
    spot = typeof body.kakaoPlaceId === 'string' ? body.kakaoPlaceId.trim() : ''
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: '어떤 후기인지 알 수 없습니다' }, { status: 400 })

  try {
    const rows = await store.update<Review>(
      SPOT_REVIEWS_PATH,
      'data: 후기 삭제',
      (prev) => removeReview(prev, id),
    )
    const mine = spot ? rows.filter((r) => r.kakaoPlaceId === spot) : []
    return NextResponse.json({ deleted: id, summary: summarize(mine) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
```

- [ ] **Step 3: 타입체크**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개

- [ ] **Step 4: 전체 스위트 + 타입체크**

Run: `npm test && npx tsc --noEmit && cd web && npx tsc --noEmit && cd ..`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/reviews.ts web/src/app/api/spot
git commit -m "feat(spot): 후기·방문·위시리스트·숨김 API 라우트 4종"
```

---

### Task 6: useSpotWishlist / useSpotDismissed 훅

**Files:**
- Create: `web/src/lib/use-spot-wishlist.ts`
- Create: `web/src/lib/use-spot-dismissed.ts`

**Interfaces:**
- Consumes: `useRemoteSet`(그대로 재사용), `WishRow`/`DismissRow`(`reviews.ts`)
- Produces: `useSpotWishlist(): WishlistState`, `useSpotDismissed(): DismissedState`(Task 9~14가 씀)

- [ ] **Step 1: 구현 (테스트 없음 — 순수 로직이 useRemoteSet에 있어 자체 테스트 없음)**

```typescript
// web/src/lib/use-spot-wishlist.ts
'use client'

import { useRemoteSet } from './use-remote-set'
import type { WishRow } from './reviews'

export interface WishlistState {
  wished: Set<string>
  ready: boolean
  toggle: (spotId: string) => void
}

export function useSpotWishlist(): WishlistState {
  const { ids, ready, toggle } = useRemoteSet(
    '/api/spot/wishlist',
    (body) => {
      const b = body as { wishes?: WishRow[]; ok?: boolean }
      return { ok: b.ok === true, ids: (b.wishes ?? []).map((w) => w.kakaoPlaceId) }
    },
  )
  return { wished: ids, ready, toggle }
}
```

```typescript
// web/src/lib/use-spot-dismissed.ts
'use client'

import { useRemoteSet } from './use-remote-set'
import type { DismissRow } from './reviews'

export interface DismissedState {
  dismissed: Set<string>
  ready: boolean
  dismiss: (spotId: string) => void
}

export function useSpotDismissed(): DismissedState {
  const { ids, ready, toggle } = useRemoteSet(
    '/api/spot/dismissed',
    (body) => {
      const b = body as { dismissed?: DismissRow[]; ok?: boolean }
      return { ok: b.ok === true, ids: (b.dismissed ?? []).map((d) => d.kakaoPlaceId) }
    },
  )
  return { dismissed: ids, ready, dismiss: toggle }
}
```

- [ ] **Step 2: 타입체크**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개

- [ ] **Step 3: 커밋**

```bash
git add web/src/lib/use-spot-wishlist.ts web/src/lib/use-spot-dismissed.ts
git commit -m "feat(spot): 위시리스트·숨김 훅"
```

---

### Task 7: 전환 스위치 3-way 확장 (domain-switch.ts/tsx, tab-bar.tsx, back-link.tsx)

**Files:**
- Modify: `web/src/lib/domain-switch.ts` (`Domain` 타입·`domainOf`·`switchDomainPath`를 3-way로)
- Modify: `web/src/app/domain-switch.tsx` (`OPTIONS`에 항목 추가)
- Modify: `web/src/app/tab-bar.tsx` (경로 계산을 3-way로)
- Modify: `web/src/app/cafe/[id]/back-link.tsx` (fallback을 3-way로)
- Test: `web/src/lib/domain-switch.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Produces: `type Domain = 'cafe' | 'restaurant' | 'spot'`, `domainOf`/`switchDomainPath`(확장판, Task 9~15가 씀)

**이 태스크가 유일하게 카페·식당 도메인 전환 관련 공유 파일을 수정하는
곳이다.** 기존 두 도메인의 분기·경로·동작은 절대 안 바꾸고, `'spot'` 갈래만
추가한다. `layout.tsx`는 이미 `<DomainSwitch />`를 렌더링하고 있으므로
**전혀 안 건드린다**(식당 때 이미 끝난 배선).

- [ ] **Step 1: domain-switch.test.ts에 실패하는 테스트 추가**

기존 파일 끝에 추가:

```typescript
describe('domainOf — spot', () => {
  it('/spot 로 시작하면 spot', () => {
    expect(domainOf('/spot')).toBe('spot')
    expect(domainOf('/spot/list')).toBe('spot')
  })
})

describe('switchDomainPath — spot', () => {
  it('홈: / <-> /spot', () => {
    expect(switchDomainPath('/', 'spot')).toBe('/spot')
    expect(switchDomainPath('/spot', 'cafe')).toBe('/')
  })
  it('식당 <-> 가볼 곳도 서로 오간다', () => {
    expect(switchDomainPath('/restaurant/list', 'spot')).toBe('/spot/list')
    expect(switchDomainPath('/spot/visited', 'restaurant')).toBe('/restaurant/visited')
  })
  it('가볼 곳 상세는 대응하는 곳이 없으므로 각 홈으로 보낸다', () => {
    expect(switchDomainPath('/spot/789', 'cafe')).toBe('/')
    expect(switchDomainPath('/cafe/123', 'spot')).toBe('/spot')
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd web && npx vitest run src/lib/domain-switch.test.ts`
Expected: FAIL — `domainOf('/spot')`가 `'cafe'`를 반환

- [ ] **Step 3: domain-switch.ts를 3-way로 확장**

전체 내용을 아래로 교체(로직 구조는 그대로, 갈래만 하나 늘어난다):

```typescript
export type Domain = 'cafe' | 'restaurant' | 'spot'

export function domainOf(pathname: string): Domain {
  if (pathname === '/restaurant' || pathname.startsWith('/restaurant/')) return 'restaurant'
  if (pathname === '/spot' || pathname.startsWith('/spot/')) return 'spot'
  return 'cafe'
}

/**
 * 지금 보던 화면과 같은 종류로 도메인을 바꾼다.
 *
 * 목록·다녀온 곳·정보는 대응 경로가 있어 그대로 옮긴다. 상세 페이지는
 * 대응하는 상대 항목이 없으므로 그 도메인의 홈으로 보낸다.
 */
export function switchDomainPath(pathname: string, to: Domain): string {
  const from = domainOf(pathname)
  if (from === to) return pathname

  const prefix = from === 'cafe' ? '' : `/${from}`
  const rest = prefix ? pathname.slice(prefix.length) : pathname
  // rest 는 '', '/list', '/visited', '/info', 혹은 '/<id>' (상세)
  const known = ['', '/list', '/visited', '/info']
  const tail = known.includes(rest) ? rest : ''

  return to === 'cafe' ? (tail || '/') : `/${to}${tail}`
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npx vitest run src/lib/domain-switch.test.ts`
Expected: PASS (기존 카페·식당 케이스 포함 전부)

- [ ] **Step 5: DomainSwitch 컴포넌트에 항목 추가**

`web/src/app/domain-switch.tsx`의 `OPTIONS` 배열 한 줄만 교체:

```typescript
const OPTIONS: [Domain, string][] = [
  ['cafe', '☕ 카페'], ['restaurant', '🍚 식당'], ['spot', '🏞️ 가볼곳'],
]
```

(그 외 컴포넌트 본문은 전혀 안 바꾼다 — 이미 배열을 순회하는 구조라 항목만
늘어나도 그대로 동작한다.)

- [ ] **Step 6: tab-bar.tsx를 3-way로 확장**

`TabBar` 함수 본문만 아래로 교체(`Tab` 컴포넌트는 그대로):

```tsx
export function TabBar() {
  const path = usePathname()
  const domain = domainOf(path)
  const prefix = domain === 'cafe' ? '' : `/${domain}`
  const home = prefix || '/'
  const list = `${prefix}/list`
  const visited = `${prefix}/visited`
  const info = `${prefix}/info`
  const homeIcon = domain === 'restaurant' ? '🍚' : domain === 'spot' ? '🏞️' : '☕'

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-[480px]">
        <Tab href={home} label="이번 주" icon={homeIcon} active={path === home} />
        <Tab href={list} label="전체" icon="📋" active={path.startsWith(list)} />
        <Tab href={visited} label="다녀온 곳" icon="★" active={path.startsWith(visited)} />
        <Tab href={info} label="정보" icon="ⓘ" active={path.startsWith(info)} />
      </div>
    </nav>
  )
}
```

(주의: `home === '/'`일 때 `path.startsWith('/')`는 항상 true이므로 홈 탭만
`path === home`으로 판정한다 — 기존 코드가 이미 이 방식이라 그대로 유지.)

- [ ] **Step 7: back-link.tsx를 3-way로 확장**

`web/src/app/cafe/[id]/back-link.tsx`의 `router.push(...)` 한 줄만 교체:

```typescript
        else router.push(
          domainOf(pathname) === 'restaurant' ? '/restaurant'
            : domainOf(pathname) === 'spot' ? '/spot'
              : '/',
        )
```

- [ ] **Step 8: 타입체크**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개. (Next.js 타입 라우트가 `/spot` 계열을 아직 모르면 에러가
날 수 있다 — Task 11~15에서 실제 페이지 파일이 생기면 자동 해소되므로, 그
원인이면 경고로 남기고 계속 진행한다.)

- [ ] **Step 9: 카페·식당 회귀 확인**

Run: `cd web && npm test`
Expected: 전부 통과 — 기존 카페·식당 도메인 관련 케이스(`domainOf('/')`,
`domainOf('/restaurant')`, `switchDomainPath` 카페↔식당 케이스 등)가 값 하나
안 바뀌고 통과해야 한다.

- [ ] **Step 10: 커밋**

```bash
git add web/src/lib/domain-switch.ts web/src/lib/domain-switch.test.ts web/src/app/domain-switch.tsx web/src/app/tab-bar.tsx web/src/app/cafe/\[id\]/back-link.tsx
git commit -m "feat(spot): 전환 스위치·탭바·뒤로가기 3-way 확장 (카페/식당 동작 불변)"
```

---

### Task 8: spot-card.tsx

**Files:**
- Create: `web/src/app/spot-card.tsx`

**Interfaces:**
- Consumes: `SpotListRow`(Task 4), `driveLabel`/`addedLabel`(`web/src/lib/labels.ts`,
  직접 import), `Badge`(`web/src/app/badge.tsx`, 직접 import), `spotRecentlyVisited`
  (Task 4), `PARKING_LABEL`/`INDOOR_OUTDOOR_LABEL`(Task 4), `Thumb`(재사용,
  아이콘 prop 이미 있음)
- Produces: `<SpotCard>`(Task 10이 씀)

- [ ] **Step 1: 작성**

`web/src/app/restaurant-card.tsx`와 대응. 카드 상단 고정 정보를 "태그(최대
2개) · 주차 · 체류시간/실내외"로 바꾼다. **`Badge`/`driveLabel`/`addedLabel`은
처음부터 leaf 모듈에서 직접 import한다** — `cafe-card.tsx`나 `site.ts`를 거치지
않는다:

```typescript
// web/src/app/spot-card.tsx
import Link from 'next/link'
import {
  spotRecentlyVisited, PARKING_LABEL, INDOOR_OUTDOOR_LABEL, type SpotListRow,
} from '@/lib/spot-site'
import { driveLabel, addedLabel } from '@/lib/labels'
import { Badge } from './badge'
import { Thumb } from './thumb'
import { NaverMapLink } from './naver-map-link'

const PARKING_TONE: Record<string, string> = {
  A: 'text-emerald-700 dark:text-emerald-400',
  B: 'text-amber-700 dark:text-amber-400',
  C: 'text-orange-700 dark:text-orange-400',
  D: 'text-red-700 dark:text-red-400',
  '?': 'text-ink-soft',
}

/** 카드 상단 고정: 태그(최대 2개) · 주차 · 체류시간/실내외. 갈지 말지를 3초에 결정하게 하는 정보 */
export function SpotTopThree({ spot }: { spot: SpotListRow }) {
  const extra = [
    spot.stayDuration,
    spot.indoorOutdoor ? INDOOR_OUTDOOR_LABEL[spot.indoorOutdoor] : null,
  ].filter((x): x is string => Boolean(x))
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
      <span className="font-semibold">
        {spot.tags.length > 0 ? spot.tags.slice(0, 2).join(' · ') : '태그 미확인'}
      </span>
      <span className="text-line">·</span>
      <span className={`font-semibold ${PARKING_TONE[spot.parkingGrade]}`}>
        {PARKING_LABEL[spot.parkingGrade]}
      </span>
      {extra.length > 0 && (
        <>
          <span className="text-line">·</span>
          <span>{extra.join(' · ')}</span>
        </>
      )}
    </div>
  )
}

export function SpotCard({
  spot, rank, wished, onToggleWish, stale, onDismiss,
}: {
  spot: SpotListRow
  rank?: number
  wished?: boolean
  onToggleWish?: () => void
  stale?: boolean
  onDismiss?: () => void
}) {
  const visited = spotRecentlyVisited(spot.visitedOn)
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card">
      <Link
        href={`/spot/${spot.id}`}
        aria-label={`${spot.name} 자세히 보기`}
        className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
      >
        <div className="flex gap-3">
          <Thumb src={spot.imageUrl} alt={spot.name} size={60} icon="🏞️" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[17px] font-bold leading-snug">
                {rank !== undefined && (
                  <span className="mr-1.5 text-bean">
                    {rank}
                    <span className="sr-only">위 </span>
                  </span>
                )}
                {spot.isNew && (
                  <span className="mr-1.5 align-[1px] rounded bg-bean px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                    NEW
                  </span>
                )}
                {spot.name}
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
                {spot.ratingCount > 0 && (
                  <span className="text-[13px] font-bold text-bean">
                    ★ {spot.ratingAvg.toFixed(1)}
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
              {spot.sigungu} · {driveLabel(spot.driveMinutes)} · {addedLabel(spot.firstSeenAt)}
            </p>

            <div className="mt-1.5">
              <SpotTopThree spot={spot} />
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

        {spot.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {spot.tags.slice(0, 4).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        )}

        {spot.evidence && (
          <p className="mt-3 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed text-ink-soft">
            {spot.evidence}
          </p>
        )}
      </Link>

      <NaverMapLink
        href={spot.naverMapUrl}
        className="flex min-h-[48px] items-center justify-center gap-1.5 border-t border-line text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        네이버지도로 열기 ↗
      </NaverMapLink>
    </article>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개

- [ ] **Step 3: 전체 스위트**

Run: `npm test && cd web && npm test && cd ..`
Expected: 전부 통과

- [ ] **Step 4: 커밋**

```bash
git add web/src/app/spot-card.tsx
git commit -m "feat(spot): 가볼 곳 카드"
```

---

### Task 9: spot-feed-cards.tsx + spot-home-feed.tsx

**Files:**
- Create: `web/src/app/spot-feed-cards.tsx`
- Create: `web/src/app/spot-home-feed.tsx`

**Interfaces:**
- Consumes: `SpotCard`(Task 8), `SpotListRow`(Task 4), `spotIsStale`(Task 4),
  `useSpotWishlist`/`useSpotDismissed`(Task 6), `PAGE_SIZE`/`pageOf`/`pageCount`/
  `pageFromParam`(`paging.ts`, 재사용), `spotHiddenByVisit`(Task 4)
- Produces: `SpotFeedRow`, `<SpotFeedCards>`, `<SpotHomeFeed>`(Task 10이 씀)

- [ ] **Step 1: spot-feed-cards.tsx**

```typescript
// web/src/app/spot-feed-cards.tsx
import { SpotCard } from './spot-card'
import { spotIsStale, type SpotListRow } from '@/lib/spot-site'

export interface SpotFeedRow extends SpotListRow {
  reason: string
}

export function SpotFeedCards({
  rows, offset = 0, showRank = true, wished, onToggleWish, onDismiss,
}: {
  rows: SpotFeedRow[]
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
          <SpotCard
            spot={r}
            rank={showRank ? offset + i + 1 : undefined}
            wished={wished?.has(r.id)}
            onToggleWish={onToggleWish ? () => onToggleWish(r.id) : undefined}
            stale={!r.visitedOn && spotIsStale(r.lastSeenAt)}
            onDismiss={onDismiss ? () => onDismiss(r.id) : undefined}
          />
          <p className="mt-1.5 px-1 text-[12px] text-ink-soft">{r.reason}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: spot-home-feed.tsx**

`web/src/app/restaurant-home-feed.tsx`와 대응. `/api/restaurant/visited` →
`/api/spot/visited`, 훅·컴포넌트를 가볼 곳판으로:

```typescript
// web/src/app/spot-home-feed.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PAGE_SIZE, pageCount, pageFromParam, pageOf } from '@/lib/paging'
import { spotHiddenByVisit } from '@/lib/spot-site'
import type { VisitRow } from '@/lib/reviews'
import { useSpotWishlist } from '@/lib/use-spot-wishlist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { SpotFeedCards, type SpotFeedRow } from './spot-feed-cards'

export type { SpotFeedRow }

export type HomeSort = 'default' | 'near' | 'new'

const HOME_SORT_LABEL: [HomeSort, string][] = [
  ['default', '우선순위'], ['near', '가까운순'], ['new', '최신순'],
]

function sortFeed(rows: SpotFeedRow[], sort: HomeSort): SpotFeedRow[] {
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

export function SpotHomeFeed({ rows }: { rows: SpotFeedRow[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [visited, setVisited] = useState<Set<string> | null>(null)
  const { wished, toggle: toggleWish } = useSpotWishlist()
  const { dismissed, dismiss } = useSpotDismissed()
  const sortParam = params.get('s')
  const sort: HomeSort = sortParam === 'near' || sortParam === 'new' ? sortParam : 'default'

  useEffect(() => {
    fetch('/api/spot/visited')
      .then((r) => r.json())
      .then((body: { visits?: VisitRow[]; ok?: boolean }) => {
        if (body.ok !== true) return
        setVisited(spotHiddenByVisit(body.visits ?? []))
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

      <SpotFeedCards
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

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개

- [ ] **Step 4: 커밋**

```bash
git add web/src/app/spot-feed-cards.tsx web/src/app/spot-home-feed.tsx
git commit -m "feat(spot): 홈 피드 카드 목록 + 페이지네이션"
```

---

### Task 10: `/spot` 홈 페이지

**Files:**
- Create: `web/src/app/spot/page.tsx`

**Interfaces:**
- Consumes: `spotHomeFeed`/`spotPayload`/`toSpotListRow`(Task 4), `PAGE_SIZE`
  (`paging.ts`), `SpotHomeFeed`/`SpotFeedCards`(Task 9)

- [ ] **Step 1: 작성**

```tsx
// web/src/app/spot/page.tsx
import { Suspense } from 'react'
import { spotHomeFeed, spotPayload, toSpotListRow, type SiteSpot } from '@/lib/spot-site'
import { PAGE_SIZE } from '@/lib/paging'
import { SpotHomeFeed } from '../spot-home-feed'
import { SpotFeedCards, type SpotFeedRow } from '../spot-feed-cards'

function reasonLine(posts30: number, posts90: number, trend: SiteSpot['trend']): string {
  const posts = posts30 === posts90
    ? `블로그 30일 ${posts30}건`
    : `블로그 30일 ${posts30}건 · 90일 ${posts90}건`
  return trend === 'rising' ? `${posts} · 지금 뜨는 중` : posts
}

export default function SpotHome() {
  const feed: SpotFeedRow[] = spotHomeFeed().map((s) => ({
    ...toSpotListRow(s),
    reason: reasonLine(s.posts30, s.posts90, s.trend),
  }))

  const week = new Date(spotPayload.weekOf)
  const label = `${week.getMonth() + 1}월 ${week.getDate()}일 주`

  return (
    <div className="py-5">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold tracking-tight">이번 주 추천 (가볼 곳)</h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          {label} · 블로그 화제량과 우리집(인천 부평) 거리로 골랐어요
        </p>
      </div>

      {feed.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-5 text-[14px] text-ink-soft">
          아직 추천할 곳이 없어요. 수집이 끝나면 채워집니다.
        </p>
      ) : (
        <Suspense fallback={<SpotFeedCards rows={feed.slice(0, PAGE_SIZE)} />}>
          <SpotHomeFeed rows={feed} />
        </Suspense>
      )}

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        {spotPayload.stats.regions}개 시군구에서 고른 {spotPayload.stats.passed}곳 중에서
        <br />
        주차·태그·거리를 함께 보고 {Math.min(PAGE_SIZE, feed.length)}곳씩 추렸어요
      </p>
    </div>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개

- [ ] **Step 3: 커밋**

```bash
git add web/src/app/spot/page.tsx
git commit -m "feat(spot): 이번 주 추천 홈 페이지"
```

---

### Task 11: `/spot/list` 전체 목록

**Files:**
- Create: `web/src/app/spot/list/page.tsx`
- Create: `web/src/app/spot/list/spot-list-client.tsx`

**Interfaces:**
- Consumes: `spotPayload`/`toSpotListRow`/`spotIsStale`/`spotRecentlyVisited`
  (Task 4), `readListParams`/`listParamsToQuery`(`url-state.ts`, 재사용),
  `useUrlSync`(재사용), `areaCounts`/`countMatching`/`filterAndSort`/
  `groupBySigungu`/`PAGE_CHUNK`/`SPLIT_AREAS`(`filter.ts`, **무변경 재사용** —
  `SpotListRow`가 `FilterableRow`를 만족), `useSpotWishlist`/`useSpotDismissed`
  (Task 6), `AreaChips`/`Chip`/`SearchBox`(`filters.tsx`, 재사용), `SpotCard`
  (Task 8)

- [ ] **Step 1: page.tsx (서버 컴포넌트)**

```tsx
// web/src/app/spot/list/page.tsx
import { spotPayload, toSpotListRow } from '@/lib/spot-site'
import { readListParams } from '@/lib/url-state'
import { SpotListClient } from './spot-list-client'

export const metadata = { title: '가볼 곳 전체 리스트 — 심김 빵지순례' }

export default async function SpotListPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  return (
    <SpotListClient
      spots={spotPayload.spots.map(toSpotListRow)}
      initial={initial}
    />
  )
}
```

- [ ] **Step 2: spot-list-client.tsx**

`web/src/app/restaurant/list/restaurant-list-client.tsx`와 대응. **태그 칩은
다중 선택**(카페의 `ALL_TAGS` 패턴 그대로) — 식당의 단일선택 음식종류 칩과
다르다:

```tsx
// web/src/app/spot/list/spot-list-client.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  SPOT_TAG_LABEL, spotIsStale, spotRecentlyVisited, type SpotListRow,
} from '@/lib/spot-site'
import {
  areaCounts, countMatching, filterAndSort, groupBySigungu, PAGE_CHUNK, SPLIT_AREAS, type Sort,
} from '@/lib/filter'
import { listParamsToQuery, type ListParams } from '@/lib/url-state'
import { useUrlSync } from '@/lib/use-url-sync'
import { useSpotWishlist } from '@/lib/use-spot-wishlist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { AreaChips, Chip, SearchBox } from '../../filters'
import { SpotCard } from '../../spot-card'

const SPOT_TAG_CHIPS = Object.keys(SPOT_TAG_LABEL)

export function SpotListClient(
  { spots, initial }: { spots: SpotListRow[]; initial: ListParams },
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
  const { wished, toggle: toggleWish } = useSpotWishlist()
  const { dismissed, dismiss } = useSpotDismissed()

  useUrlSync(listParamsToQuery({
    ...initial, q, area, tags, sort, city, newOnly, wishOnly, shown: shownCount,
  }))

  const visible = useMemo(
    () => spots.filter((s) => !dismissed.has(s.id)),
    [spots, dismissed],
  )
  const wishFiltered = useMemo(
    () => (wishOnly ? visible.filter((s) => wished.has(s.id)) : visible),
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
        <h1 className="text-[22px] font-bold tracking-tight">가볼 곳 전체 리스트</h1>
        <span className="text-[13px] text-ink-soft">{matched.length}곳</span>
      </div>

      <div className="mt-3">
        <SearchBox value={q} onChange={reset(setQ)} placeholder="장소명 검색" />
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
        {SPOT_TAG_CHIPS.map((t) => (
          <Chip key={t} on={tags.includes(t)} onClick={() => toggle(t)}>{SPOT_TAG_LABEL[t]}</Chip>
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
          주차가 어려운 도심 장소도 함께 보여줍니다.
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
                {g.rows.map((s) => (
                  <SpotCard
                    key={s.id}
                    spot={s}
                    wished={wished.has(s.id)}
                    onToggleWish={() => toggleWish(s.id)}
                    stale={!spotRecentlyVisited(s.visitedOn) && spotIsStale(s.lastSeenAt)}
                    onDismiss={() => dismiss(s.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {shown.map((s) => (
            <SpotCard
              key={s.id}
              spot={s}
              wished={wished.has(s.id)}
              onToggleWish={() => toggleWish(s.id)}
              stale={!spotRecentlyVisited(s.visitedOn) && spotIsStale(s.lastSeenAt)}
              onDismiss={() => dismiss(s.id)}
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
              ? <>“{q}” 로 찾은 곳이 없어요.<br />이름 일부만 넣어보세요.</>
              : '조건에 맞는 곳이 없어요. 칩을 줄여보세요.'}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 타입체크**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개. (`filterAndSort` 등이 `<T extends FilterableRow>`로
선언돼 있어 `SpotListRow`가 구조적으로 만족하는지가 관건 — Task 4의
`SpotListRow`는 이미 `FilterableRow`의 10개 필드를 전부 포함하므로 만족해야
한다. 에러가 나면 두 타입을 필드별로 대조한다.)

- [ ] **Step 4: 커밋**

```bash
git add web/src/app/spot/list
git commit -m "feat(spot): 전체 목록 (다중선택 태그 칩·검색·정렬)"
```

---

### Task 12: `/spot/[id]` 상세 페이지 + review-panel + wish-heart

**Files:**
- Create: `web/src/app/spot/[id]/page.tsx`
- Create: `web/src/app/spot/[id]/review-panel.tsx`
- Create: `web/src/app/spot/[id]/wish-heart.tsx`

**Interfaces:**
- Consumes: `spotById`/`driveLabel`/`SPOT_TAG_LABEL`/`PARKING_LABEL`/
  `INDOOR_OUTDOOR_LABEL`/`spotPayload`/`spotRecentlyVisited`(Task 4), `Badge`
  (`web/src/app/badge.tsx`, 직접 import), `NaverMapLink`(재사용), `BackLink`
  (Task 7에서 3-way로 확장된 것을 그대로 import), `Stars`/`StarPicker`
  (`cafe/[id]/review-panel.tsx`에서 **이미 export되어 있음** — 그대로 import,
  다시 export할 필요 없음), `useSpotWishlist`(Task 6)

- [ ] **Step 1: wish-heart.tsx**

```tsx
// web/src/app/spot/[id]/wish-heart.tsx
'use client'

import { useSpotWishlist } from '@/lib/use-spot-wishlist'

export function WishHeart({ spotId }: { spotId: string }) {
  const { wished, toggle } = useSpotWishlist()
  const on = wished.has(spotId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? '위시리스트에서 빼기' : '위시리스트에 담기'}
      onClick={() => toggle(spotId)}
      className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border text-[20px] ${
        on ? 'border-bean bg-bean-soft text-bean' : 'border-line text-ink-soft'
      }`}
    >
      {on ? '♥' : '♡'}
    </button>
  )
}
```

- [ ] **Step 2: review-panel.tsx**

`web/src/app/restaurant/[id]/review-panel.tsx`와 대응. `/api/restaurant/*`→
`/api/spot/*`, localStorage 키를 가볼 곳 전용으로 분리:

```tsx
// web/src/app/spot/[id]/review-panel.tsx
'use client'

import { useEffect, useState } from 'react'
import { MAX_COMMENT, MAX_NICKNAME, type RatingSummary, type Review } from '@/lib/reviews'
import type { SiteSpot } from '@/lib/spot-site'
import { VIEW_ONLY, VIEW_ONLY_NOTE } from '@/lib/view-only'
import { Stars, StarPicker } from '../../cafe/[id]/review-panel'

const NICK_KEY = 'cafe-nickname'
const MINE_KEY = 'spot-my-reviews'

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

function fromPayload(rows: SiteSpot['familyReviews']): Loaded {
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

export function ReviewPanel({ spotId, initialVisited, built }: {
  spotId: string
  initialVisited: boolean
  built: SiteSpot['familyReviews']
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

    fetch(`/api/spot/reviews?spot=${encodeURIComponent(spotId)}`)
      .then((r) => r.json())
      .then((body: Loaded) => {
        if (body.ok === false) {
          setData((prev) => ({ ...prev, enabled: body.enabled, writable: body.writable }))
          return
        }
        setData({ ...body, live: true })
      })
      .catch(() => {})

    fetch('/api/spot/visited')
      .then((r) => r.json())
      .then((body: { visits?: { kakaoPlaceId: string }[] }) => {
        if (body.visits?.some((v) => v.kakaoPlaceId === spotId)) setVisited(true)
      })
      .catch(() => {})
  }, [spotId])

  const submit = async () => {
    if (rating === 0) {
      setError('별점을 눌러주세요')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/spot/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: spotId, rating, nickname, comment }),
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
      const res = await fetch('/api/spot/reviews', {
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
      const res = await fetch('/api/spot/reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, kakaoPlaceId: spotId }),
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
      const res = await fetch('/api/spot/visited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kakaoPlaceId: spotId, action: visited ? 'remove' : 'add' }),
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

- [ ] **Step 3: page.tsx**

`web/src/app/restaurant/[id]/page.tsx`와 대응. `cuisineType`/`hasRoom`/
`reservable` 자리에 `tags`/`stayDuration`/`indoorOutdoor`/`season`을 정보
행에 넣는다:

```tsx
// web/src/app/spot/[id]/page.tsx
import { notFound } from 'next/navigation'
import {
  spotById, SPOT_TAG_LABEL, driveLabel, PARKING_LABEL, INDOOR_OUTDOOR_LABEL,
  spotPayload, spotRecentlyVisited,
} from '@/lib/spot-site'
import { Badge } from '../../badge'
import { NaverMapLink } from '../../naver-map-link'
import { ReviewPanel } from './review-panel'
import { BackLink } from '../../cafe/[id]/back-link'
import { WishHeart } from './wish-heart'

export function generateStaticParams() {
  return spotPayload.spots.map((s) => ({ id: s.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const spot = spotById((await params).id)
  return { title: spot ? `${spot.name} — 심김 빵지순례` : '심김 빵지순례' }
}

const PARKING_NOTE: Record<string, string> = {
  A: '전용 주차장이 넉넉해요.',
  B: '주차는 되지만 넉넉하지는 않아요. 건물·상가 주차장이거나 조건부 무료일 수 있어요.',
  C: '주차가 어려워요. 인근 유료·공영 주차장을 알아보고 가세요.',
  D: '주차가 안 돼요.',
  '?': '후기에 주차 얘기가 없었어요. 출발 전에 확인하세요.',
}

export default async function SpotDetail({ params }: { params: Promise<{ id: string }> }) {
  const spot = spotById((await params).id)
  if (!spot) notFound()

  const rows: [string, string][] = [
    ['태그', spot.tags.length > 0 ? spot.tags.map((t) => SPOT_TAG_LABEL[t] ?? t).join(', ') : '미확인'],
    ['주차', `${spot.parkingGrade} — ${PARKING_LABEL[spot.parkingGrade]}`],
    ['이동', driveLabel(spot.driveMinutes)],
  ]
  if (spot.stayDuration) rows.push(['체류시간', spot.stayDuration])
  if (spot.indoorOutdoor) rows.push(['실내외', INDOOR_OUTDOOR_LABEL[spot.indoorOutdoor]])
  if (spot.season) rows.push(['계절', spot.season])
  if (spot.teenAppeal !== null) rows.push(['10대 취향', `${spot.teenAppeal} / 5`])

  return (
    <div className="py-5">
      <BackLink />

      <div className="mt-1 flex items-start justify-between gap-2">
        <h1 className="text-[24px] font-bold leading-tight tracking-tight">
          {spot.isNew && (
            <span className="mr-2 align-middle rounded bg-bean px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white">
              NEW
            </span>
          )}
          {spot.name}
        </h1>
        <WishHeart spotId={spot.id} />
      </div>
      <p className="mt-1 text-[14px] text-ink-soft">
        {spot.sigungu} · {driveLabel(spot.driveMinutes)}
      </p>

      {spotRecentlyVisited(spot.visitedOn) && (
        <p className="mt-2 inline-block rounded-full bg-line px-2.5 py-1 text-[12px] text-ink-soft">
          {spot.visitedOn} 에 다녀왔어요
        </p>
      )}

      {spot.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {spot.tags.map((t) => (
            <Badge key={t}>{SPOT_TAG_LABEL[t] ?? t}</Badge>
          ))}
        </div>
      )}

      <NaverMapLink
        href={spot.naverMapUrl}
        className="mt-5 flex min-h-[56px] items-center justify-center rounded-2xl bg-bean text-[16px] font-bold text-white active:opacity-90"
      >
        네이버지도로 열기 ↗
      </NaverMapLink>

      <NaverMapLink
        href={spot.naverMapUrl}
        className="mt-2 flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-line bg-card text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        영업시간·휴무일 확인 ↗
      </NaverMapLink>
      <p className="mt-1.5 text-center text-[12px] text-ink-soft">
        영업시간은 자주 바뀌어서 지도에서 바로 확인하는 게 정확해요
      </p>

      <ReviewPanel
        spotId={spot.id}
        initialVisited={spot.visitedOn !== null}
        built={spot.familyReviews}
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
          {PARKING_NOTE[spot.parkingGrade]}
        </p>
        {spot.parkingEvidence && (
          <blockquote className="mt-2 rounded-xl bg-bean-soft/50 px-3.5 py-3 text-[13px] leading-relaxed">
            “{spot.parkingEvidence}”
          </blockquote>
        )}
      </section>

      {spot.evidence && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">후기에서</h2>
          <blockquote className="mt-2 rounded-xl bg-bean-soft/50 px-3.5 py-3 text-[13px] leading-relaxed">
            “{spot.evidence}”
          </blockquote>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-[15px] font-bold">얼마나 화제인가</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          블로그 후기가 최근 30일에 <b className="text-ink">{spot.posts30}건</b>
          {spot.posts90 !== spot.posts30 && (
            <>, 90일에 <b className="text-ink">{spot.posts90}건</b></>
          )}{' '}올라왔어요.
          {spot.trend === 'rising' && ' 최근 한 달이 그 전보다 눈에 띄게 늘었어요.'}
          {spot.trend === 'unknown' && ' 최근 글이 몰려 있어서 이전과 비교하기는 어려워요.'}
        </p>
      </section>

      {spot.kakaoPlaceUrl && (
        <a
          href={spot.kakaoPlaceUrl}
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

- [ ] **Step 4: 타입체크 + 전체 스위트**

Run: `cd web && npx tsc --noEmit && npm test`
Expected: 에러 0개, 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add web/src/app/spot/\[id\]
git commit -m "feat(spot): 상세 페이지 + 후기·위시하트"
```

---

### Task 13: `/spot/visited` 다녀온 곳

**Files:**
- Create: `web/src/app/spot/visited/page.tsx`
- Create: `web/src/app/spot/visited/spot-visited-list.tsx`

**Interfaces:**
- Consumes: `nextSort`/`SORT_LABEL`/`sortVisited`(`visited-sort.ts`, **이미
  제네릭 — 그대로 재사용, 수정 없음**), `matchesQuery`/`areaLabel`(`filter.ts`,
  재사용), `Stars`(`cafe/[id]/review-panel.tsx`, 재사용), `spotPayload`/
  `SPOT_REVISIT_DAYS`(Task 4), `SiteSpotVisited`(Task 4)

- [ ] **Step 1: spot-visited-list.tsx**

`web/src/app/restaurant/visited/restaurant-visited-list.tsx`와 대응.
`mergeRestaurantVisits`→`mergeSpotVisits`, `KnownRestaurant`→`KnownSpot`,
`/restaurant/${v.id}`→`/spot/${v.id}`, `/api/restaurant/*`→`/api/spot/*`:

```tsx
// web/src/app/spot/visited/spot-visited-list.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { SiteSpotVisited } from '@/lib/spot-site'
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

export interface KnownSpot {
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

export function mergeSpotVisits(
  built: SiteSpotVisited[],
  live: VisitLite[],
  known: Map<string, KnownSpot>,
  hasLive = true,
): SiteSpotVisited[] {
  const byId = new Map(built.map((v) => [v.id, v]))
  if (!hasLive) {
    return [...built].sort((a, b) => b.visitedOn.localeCompare(a.visitedOn))
  }

  const out = new Map<string, SiteSpotVisited>()
  for (const v of live) {
    const prev = out.get(v.kakaoPlaceId)
    if (prev && prev.visitedOn >= v.visitedOn) continue
    const s = known.get(v.kakaoPlaceId) ?? byId.get(v.kakaoPlaceId)
    if (!s) continue
    const b = byId.get(v.kakaoPlaceId)
    out.set(v.kakaoPlaceId, {
      id: v.kakaoPlaceId, name: s.name, sigungu: s.sigungu, area: s.area,
      visitedOn: v.visitedOn, note: v.note ?? '', tags: s.tags,
      naverMapUrl: s.naverMapUrl, imageUrl: s.imageUrl ?? null,
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

export function filterSpotVisited(
  rows: SiteSpotVisited[], f: VisitedFilter,
): SiteSpotVisited[] {
  return rows.filter((v) => {
    if (f.area && v.area !== f.area) return false
    if (f.q && !matchesQuery(v.name, f.q)) return false
    return f.tags.every((t) => v.tags.includes(t))
  })
}

export function spotVisitedAreas(rows: SiteSpotVisited[]): AreaCount[] {
  const map = new Map<string, number>()
  for (const v of rows) map.set(v.area, (map.get(v.area) ?? 0) + 1)
  return [...map.entries()]
    .map(([area, count]) => ({ area, label: areaLabel(area), count, nearest: 0 }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
}

export function spotVisitedTags(rows: SiteSpotVisited[]): { tag: string; count: number }[] {
  const map = new Map<string, number>()
  for (const v of rows) for (const t of v.tags) map.set(t, (map.get(t) ?? 0) + 1)
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function SpotVisitedList({
  built, known, initial,
}: { built: SiteSpotVisited[]; known: KnownSpot[]; initial: ListParams }) {
  const [rows, setRows] = useState<SiteSpotVisited[]>(
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
    const map = new Map(known.map((s) => [s.id, s]))
    fetch('/api/spot/visited')
      .then((r) => r.json())
      .then((body: { visits?: VisitLite[]; ok?: boolean; writable?: boolean }) => {
        if (body.writable === false) setViewOnly(true)
        setRows(mergeSpotVisits(built, body.visits ?? [], map, body.ok === true))
      })
      .catch(() => {})

    fetch('/api/spot/reviews')
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
      const res = await fetch('/api/spot/visited', {
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

  const areas = useMemo(() => spotVisitedAreas(rows), [rows])
  const tagList = useMemo(() => spotVisitedTags(rows), [rows])
  const shown = useMemo(
    () => sortVisited(filterSpotVisited(rows, { q, area, tags }), order),
    [rows, q, area, tags, order],
  )
  const toggle = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  const dirty = q !== '' || area !== null || tags.length > 0

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-card p-5">
        <p className="text-[14px] leading-relaxed text-ink-soft">
          아직 기록이 없어요. 다녀온 곳을 열어 <b className="text-ink">다녀왔어요</b> 를
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
            <SearchBox value={q} onChange={setQ} placeholder="장소명 검색" />
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
                  href={`/spot/${v.id}`}
                  aria-label={`${v.name} 자세히 보기`}
                  className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
                >
                  <div className="flex gap-3">
                    <Thumb src={v.imageUrl} alt={v.name} size={60} icon="🏞️" />
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

- [ ] **Step 2: page.tsx**

```tsx
// web/src/app/spot/visited/page.tsx
import { spotPayload, SPOT_REVISIT_DAYS } from '@/lib/spot-site'
import { readListParams } from '@/lib/url-state'
import { SpotVisitedList, type KnownSpot } from './spot-visited-list'

export const metadata = { title: '다녀온 곳 (가볼 곳) — 심김 빵지순례' }

export default async function SpotVisitedPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  const known: KnownSpot[] = spotPayload.spots.map((s) => ({
    id: s.id, name: s.name, sigungu: s.sigungu, area: s.area, tags: s.tags,
    naverMapUrl: s.naverMapUrl, imageUrl: s.imageUrl,
  }))

  return (
    <div className="py-5">
      <h1 className="text-[22px] font-bold tracking-tight">다녀온 곳</h1>
      <SpotVisitedList built={spotPayload.visited} known={known} initial={initial} />

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        다녀온 곳은 {Math.round(SPOT_REVISIT_DAYS / 30)}개월간 추천에서 내려갑니다.
        <br />
        또 가고 싶으면 전체 리스트에서 찾을 수 있어요.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: 타입체크 + 전체 스위트**

Run: `cd web && npx tsc --noEmit && npm test`
Expected: 에러 0개, 전부 통과

- [ ] **Step 4: 커밋**

```bash
git add web/src/app/spot/visited
git commit -m "feat(spot): 다녀온 곳 페이지"
```

---

### Task 14: `/spot/info` 정보 페이지

**Files:**
- Create: `web/src/app/spot/info/page.tsx`

**Interfaces:**
- Consumes: `spotPayload`/`SPOT_REVISIT_DAYS`(Task 4), `VIEW_ONLY`(재사용)

- [ ] **Step 1: 작성**

`web/src/app/restaurant/info/page.tsx`와 같은 구조, 1단계 스펙 문서 기준으로
단계 설명을 새로 쓴다:

```tsx
// web/src/app/spot/info/page.tsx
import { spotPayload, SPOT_REVISIT_DAYS } from '@/lib/spot-site'
import { VIEW_ONLY } from '@/lib/view-only'

export const metadata = { title: '가볼 곳 정보 — 심김 빵지순례' }

export default function SpotInfo() {
  const at = new Date(spotPayload.generatedAt)
  const stamp = `${at.getFullYear()}. ${at.getMonth() + 1}. ${at.getDate()}.`
  const { stats } = spotPayload
  const shown = stats.passed + stats.cityOnly

  const steps: [string, React.ReactNode][] = [
    ['가볼 곳을 찾는다',
      `수도권 ${stats.scannedRegions}개 시군구를 카카오 장소 검색으로 훑어요.`],
    ['화제량을 센다', (
      <>
        블로그 후기가 얼마나 빠르게 늘고 있는지 봐요. 카페·식당과 같은
        방식이에요 — <b className="text-ink">집에서 가까운 곳은 기준을
        낮춰서</b> 봐요.
      </>
    )],
    ['후기를 읽는다', '태그·체류시간·실내외·계절·주차를 후기 원문에서 뽑아요. 근거 인용이 없으면 버려요.'],
    ['거리를 잰다', '집(인천 부평)에서 카카오 길찾기로 실제 운전 시간을 재요.'],
    ['순위를 매긴다', (
      <>
        화제량 × (거리·주차·태그)로 점수를 내고 높은 순으로 줄을 세워요.{' '}
        아이와 함께 갈 때를 위해{' '}
        <b className="text-ink">&ldquo;아이와 가기 좋은 곳&rdquo; 태그가 있는 곳</b>에 가산점을 줘요.
      </>
    )],
    ['다녀온 곳은 내린다',
      `별점을 남기면 다녀온 곳으로 자동 기록되고, ${Math.round(SPOT_REVISIT_DAYS / 30)}개월간 추천에서 빠져요.`],
  ]

  const stats2: [string, string][] = [
    ['찾은 곳', `${stats.discovered.toLocaleString()}곳`],
    ['전체 탭에 보이는 곳', `${stats.passed.toLocaleString()}곳`],
    ['「도심 포함」 을 켜면', `${shown.toLocaleString()}곳 (+${stats.cityOnly})`],
    ['운전 시간 실측', `${stats.driveMeasured.toLocaleString()} / ${shown.toLocaleString()}곳`],
    ['훑는 지역', `${stats.scannedRegions}개 시군구`],
    ['가볼 곳이 있는 지역', `${stats.regions}개 시군구`],
    ['갱신', stamp],
  ]

  const marks: [string, React.ReactNode][] = [
    ['NEW', '우리 목록에 새로 들어온 곳이에요 (30일 이내).'],
    ['지역 칩', '시 단위로 묶었어요. 가까운 곳부터 놓고 서울은 맨 뒤예요.'],
    ['태그 칩', '자연/공원·관광지/명소·시장/전통거리 등 10개 중 여러 개를 동시에 고를 수 있어요. 고른 태그를 전부 가진 곳만 보여요.'],
    ['블로그 30일 / 90일', '우리가 직접 센 글 수예요. 상호가 실제로 언급된 글만 셉니다.'],
  ]

  return (
    <div className="py-5 text-[14px] leading-relaxed">
      <h1 className="text-[22px] font-bold tracking-tight">가볼 곳 목록은 어떻게 만들어지나</h1>

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
            <b className="text-ink">다녀온 곳에 자동으로 들어갑니다.</b> 카페·식당
            별점과는 별도로 저장돼요.
          </p>
        </>
      )}

      <h2 className="mt-7 text-[17px] font-bold">없는 정보</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        <b className="text-ink">영업시간과 리뷰 수는 싣지 않습니다.</b> 카페·식당
        화면과 같은 이유예요. 대신 상세 화면에{' '}
        <b className="text-ink">영업시간·휴무일 확인</b> 버튼을 두었어요. 체류시간·
        실내외·계절 정보는 저장만 해 두고 있어요 — 자동 추천 로직에는 아직 안
        씁니다.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 0개

- [ ] **Step 3: 커밋**

```bash
git add web/src/app/spot/info
git commit -m "feat(spot): 정보 페이지"
```

---

### Task 15: 최종 통합 검증 — 실제 데이터로 빌드, 전체 스위트, 브라우저 확인

**Files:** 없음(검증 전용 태스크, 코드 변경 없음 — 단, 검증 중 발견되는 문제는 이 태스크 안에서 고친다)

**Interfaces:** 없음 (Task 1~14가 만든 전체 파이프라인을 처음부터 끝까지 실행)

- [ ] **Step 1: 실제 데이터로 site.json 3종 재생성**

```bash
DATA_DIR=data npx tsx src/cli/run.ts site
```

Expected: 에러 없이 세 파일 모두 생성. 콘솔에 카페·식당·가볼 곳 세 줄 모두
출력. (1단계에서 이미 실제 데이터를 채워 뒀으므로 "가볼 곳 0곳"이 아니라
실제 판정된 곳 수가 나와야 한다.)

- [ ] **Step 2: 웹 빌드 전체**

```bash
npm run build:web
```

Expected: `site` 생성 + `next build`(web/) 모두 성공. 타입 에러·린트 에러
0개. Next.js가 `/spot`, `/spot/list`, `/spot/visited`, `/spot/info`,
`/spot/[id]` 라우트를 전부 인식하고 빌드하는지 로그에서 확인.

- [ ] **Step 3: 전체 테스트 스위트 (파이프라인 + web)**

```bash
npm test
cd web && npm test && cd ..
```

Expected: 전부 통과. 카페·식당 쪽 기존 테스트 회귀 없음.

- [ ] **Step 4: 개발 서버 또는 프로덕션 서버로 브라우저 확인**

(이 환경에서 `next dev`가 Turbopack/Windows 버그로 안 되는 경우 `next build`
+ `next start`로 확인한다.)

- 헤더의 "☕ 카페 / 🍚 식당 / 🏞️ 가볼곳" 3-way 스위치가 56px 헤더 안에 들어가는지, 누르면 `/spot`로 이동하는지 확인
- 카페 ↔ 식당 전환이 이전과 동일하게 동작하는지(회귀 없음) 확인
- `/spot/list`에서 태그 칩 **다중 선택**(2개 이상 골랐을 때 AND로 좁혀지는지, 0개 결과로 깨지지 않는지)·검색·정렬이 동작하는지 확인
- 가볼 곳 하나를 열어 상세 페이지에서 태그·체류시간·실내외·계절·주차 표시, 별점 남기기가 동작하는지 확인 — 별점을 남기면 "다녀온 곳"에 자동으로 들어가는지도 확인
- `/spot/visited`, `/spot/info` 렌더 확인
- 다시 헤더 스위치로 카페·식당으로 전환했을 때 화면이 이전과 동일하게 동작하는지 확인

- [ ] **Step 5: 카페·식당 화면 무변경 최종 확인**

```bash
git diff --stat $(git merge-base HEAD origin/master) -- \
  web/src/app/page.tsx web/src/app/list web/src/app/visited web/src/app/info \
  'web/src/app/cafe/[id]/page.tsx' 'web/src/app/cafe/[id]/wish-heart.tsx' \
  web/src/app/restaurant web/src/lib/site.ts web/src/lib/site-types.ts \
  web/src/lib/restaurant-site.ts web/src/lib/restaurant-site-types.ts \
  web/src/lib/filter.ts web/src/lib/use-wishlist.ts web/src/lib/use-dismissed.ts \
  web/src/lib/use-restaurant-wishlist.ts web/src/lib/use-restaurant-dismissed.ts \
  web/src/app/api/reviews web/src/app/api/visited web/src/app/api/wishlist web/src/app/api/dismissed \
  web/src/app/api/restaurant web/src/lib/visited-sort.ts web/src/app/thumb.tsx \
  web/src/lib/labels.ts web/src/app/badge.tsx
```

Expected: **빈 출력.** 이 파일들은 이번 계획 전체에서 단 한 줄도 바뀌지
않아야 한다(순수 추가/3-way 확장이 허용된 `layout.tsx`/`domain-switch.ts`/
`domain-switch.tsx`/`tab-bar.tsx`/`reviews.ts`/`cafe/[id]/back-link.tsx`는
이 목록에서 의도적으로 제외 — 그 파일들은 Diff가 있는 게 정상이다).

- [ ] **Step 6: 스텝 1~5에서 발견된 문제가 있다면 이 자리에서 수정하고 다시 1~5 반복**

- [ ] **Step 7: 최종 커밋 (필요한 경우만)**

```bash
git add -A
git commit -m "fix(spot): 최종 통합 검증에서 발견된 문제 수정"
```

(문제가 없었다면 이 스텝은 생략.)

---

## Self-Review 메모 (계획 작성자 기록)

- **스펙 커버리지**: 설계 문서 3절(전환 스위치)→Task 7. 4절(데이터
  계층)→Task 1·2·3·4·5·6. 5절(라우팅·UI, 다중선택 필터·leaf 모듈 직접
  import·새 속성 노출)→Task 8~14. 6절(테스트)→전 태스크에 내장. 7절(범위
  밖)은 이 계획에 태스크 없음(의도됨).
- **"카페·식당 영향 0" 검증 지점**: `domain-switch.ts`/`domain-switch.tsx`/
  `tab-bar.tsx`/`back-link.tsx`(Task 7)만 기존 두 도메인 동작에 영향을 줄 수
  있는 유일한 지점 — 3-way 확장 직후 기존 카페·식당 케이스가 값 하나 안
  바뀌고 통과하는지를 Step 9에서 명시적으로 확인한다. 그 외 모든 태스크는
  새 파일만 만들거나(`spot-*`), 이미 도메인 무관하게 설계된 파일(`filter.ts`,
  `reviews.ts`, `visited-sort.ts`, `thumb.tsx`, `labels.ts`, `badge.tsx`,
  StarPicker export)을 무변경으로 재사용한다.
- **식당 2단계 대비 달라진 점**: (1) leaf 모듈(`labels.ts`/`badge.tsx`)이
  이미 있어 Task 9(Thumb 아이콘 prop 추가)가 통째로 사라짐 — Thumb는 이미
  아이콘 prop이 있다. (2) `StarPicker` export가 이미 끝나 있어 Task 13의
  해당 스텝이 사라짐. (3) `sortVisited`가 이미 제네릭이라 Task 14의 해당
  스텝이 사라짐. (4) `domain-switch.ts` 등 4개 파일이 이미 존재해서 Task
  7~8이 CREATE가 아니라 MODIFY로 바뀌고 태스크 하나로 합쳐짐(`layout.tsx`는
  이미 배선이 끝나 있어 전혀 안 건드림). (5) 필터 칩은 식당의 단일선택이
  아니라 카페의 다중선택 패턴을 그대로 재사용 — 별도 라디오 UI를 만들
  필요가 없다.
- **타입 일관성**: `SpotStore`/`SpotListRow`/`SiteSpot`의 필드 이름이 Task
  1·4에서 정의된 대로 Task 8~14 전체에서 동일하게 쓰였는지, `SPOT_TAG_LABEL`
  키가 1단계의 `SPOT_TAGS`(10개) 상수와 실제로 일치하는지 재확인 완료.
