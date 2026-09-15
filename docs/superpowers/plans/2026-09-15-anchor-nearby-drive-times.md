# 앵커 기반 도메인 간 근처 추천 2단계(실제 이동시간) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 근처 추천 카드의 거리 기준을 직선거리에서 실제 이동시간(카카오 길찾기)으로 정밀화하되, 사용자 클릭 시엔 API 호출이 전혀 없도록 빌드 타임 캐시로 전부 미리 계산해 둔다.

**Architecture:** 새 매일 잡이 직선거리 top-10(1단계 `nearestByDomain` 재사용) 중 아직 안 잰 페어만 골라 카카오 길찾기로 실측해 영구 캐시(`data/nearby-drive-cache.json`, append-only)에 쌓는다. 기존 `npm run site` 빌드 단계는 API를 전혀 안 부르고 이 캐시를 조회만 해서, 실측 있으면 그 값으로 재정렬, 없으면 기존 `estimateDriveMinutes` 추정치로 폴백한다.

**Tech Stack:** TypeScript, Zod(캐시 스키마), Vitest, 기존 `createKakaoDirections` 클라이언트 재사용.

**Spec:** `docs/superpowers/specs/2026-09-15-anchor-nearby-drive-times-design.md`

## Global Constraints

- 1차 필터(직선거리 top-K)는 **K=10**. 최종 노출은 1단계와 동일하게 도메인당 5개.
- A→B와 B→A는 **대칭으로 근사**한다 — `[idA,idB].sort().join(':')`를 페어 키로 쓴다.
- 캐시는 **append-only**(한 번 잰 페어는 절대 덮어쓰거나 지우지 않는다).
- 새 잡은 **매일** 돈다. 하루 예산 **5,000건**(카카오 길찾기 무료 한도 10,000건/일의 절반).
- 근처 추천 카드 표시: 실측(`driveMinutes`) 있으면 "차로 N분", 없으면 `distanceKm`(직선거리) 폴백.
- 후보(다른 곳에서 이 자신이 추천되는 쪽)는 `parkingGrade === 'C'`(cityOnly)면 제외한다. **앵커는 제외하지 않는다** — 1단계와 동일한 규칙. 이 잡은 site 페이로드가 아니라 **원본 배열만** 갖고 있으므로 `cityOnly`를 `attributes?.parkingGrade === 'C'`로 직접 계산한다(카페·식당·가볼 곳 payload.ts 세 곳 모두 이 규칙을 쓴다 — `src/site/payload.ts:231`, `src/site/restaurant-payload.ts:167` 등).
- health 기록 원칙(`classify.ts`에서 이미 고친 것과 동일): **처리할 미스가 0건이어도 성공으로 기록한다.** 미스가 있었는데 전부 실패한 경우만 기록 안 함.
- 이 잡이 계산하는 top-10 후보 집합은 site 빌드가 최종적으로 쓰는 집합(판정·화제량까지 반영된 최종 페이로드 기준)보다 **살짝 넓을 수 있다**(예: 화제량 스냅샷이 아직 없어 최종 페이로드엔 안 실리는 `active` 상태 장소도 이 잡은 후보로 본다) — 그만큼 몇 건 더 캐싱해도 손해가 없으므로 의도적으로 단순하게 둔다. 두 계산이 100% 일치할 필요는 없다.

---

### Task 1: 페어 캐시 스키마·저장소 배선·순수 함수

**Files:**
- Modify: `src/schema.ts` (파일 끝 또는 `HealthSchema` 근처에 추가)
- Create: `src/site/nearby-drive-cache.ts`
- Test: `tests/site/nearby-drive-cache.test.ts`
- Modify: `src/store/types.ts`
- Modify: `src/store/json-store.ts`

**Interfaces:**
- Produces: `NearbyDrivePairSchema`, `NearbyDrivePair { pairKey: string; minutes: number; km: number; tollWon: number | null; measuredAt: string }` (from `src/schema.ts`), `pairKeyOf(idA: string, idB: string): string`, `buildPairIndex(cache: NearbyDrivePair[]): Map<string, NearbyDrivePair>`, `lookupPair(index: Map<string, NearbyDrivePair>, idA: string, idB: string): NearbyDrivePair | null` (from `src/site/nearby-drive-cache.js`), `Store.readNearbyDriveCache(): Promise<NearbyDrivePair[]>`, `Store.writeNearbyDriveCache(rows: NearbyDrivePair[]): Promise<void>`

- [ ] **Step 1: `src/schema.ts`에 스키마 추가**

`HealthSchema`/`type Health` 선언(176~183번 줄 부근) 바로 다음에 추가:

```typescript
/**
 * 근처 추천 2단계 — 앵커↔후보 페어의 실제 이동시간 영구 캐시.
 * 좌표가 안 바뀌므로 한 번 잰 페어는 끝까지 유효하다(append-only).
 * A→B/B→A는 대칭으로 근사해 pairKey 하나로 합친다(방향 무관).
 */
export const NearbyDrivePairSchema = z.object({
  pairKey: z.string().min(1),
  minutes: z.number().int().nonnegative(),
  km: z.number().nonnegative(),
  tollWon: z.number().int().nullable(),
  measuredAt: z.string(),
})
export type NearbyDrivePair = z.infer<typeof NearbyDrivePairSchema>
```

- [ ] **Step 2: 실패하는 테스트 작성**

```typescript
// tests/site/nearby-drive-cache.test.ts
import { describe, it, expect } from 'vitest'
import { pairKeyOf, buildPairIndex, lookupPair } from '../../src/site/nearby-drive-cache.js'
import type { NearbyDrivePair } from '../../src/schema.js'

describe('pairKeyOf', () => {
  it('방향이 달라도 같은 키를 만든다', () => {
    expect(pairKeyOf('a1', 'b2')).toBe(pairKeyOf('b2', 'a1'))
  })

  it('id를 정렬해 콜론으로 잇는다', () => {
    expect(pairKeyOf('b2', 'a1')).toBe('a1:b2')
  })
})

describe('buildPairIndex / lookupPair', () => {
  const pair: NearbyDrivePair = {
    pairKey: pairKeyOf('c1', 'r1'), minutes: 12, km: 5.5, tollWon: 0,
    measuredAt: '2026-09-15T00:00:00.000Z',
  }

  it('캐시에 있으면 방향 상관없이 찾는다', () => {
    const index = buildPairIndex([pair])
    expect(lookupPair(index, 'c1', 'r1')).toEqual(pair)
    expect(lookupPair(index, 'r1', 'c1')).toEqual(pair)
  })

  it('캐시에 없으면 null', () => {
    const index = buildPairIndex([pair])
    expect(lookupPair(index, 'c1', 's1')).toBeNull()
  })

  it('빈 캐시는 항상 null', () => {
    const index = buildPairIndex([])
    expect(lookupPair(index, 'c1', 'r1')).toBeNull()
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- tests/site/nearby-drive-cache.test.ts`
Expected: FAIL — `Cannot find module '../../src/site/nearby-drive-cache.js'`

- [ ] **Step 4: 구현**

```typescript
// src/site/nearby-drive-cache.ts
import type { NearbyDrivePair } from '../schema.js'

/** 방향 무관 페어 키. pairKeyOf(a,b) === pairKeyOf(b,a) */
export function pairKeyOf(idA: string, idB: string): string {
  return [idA, idB].sort().join(':')
}

/**
 * 캐시 배열을 pairKey -> 항목 Map으로 색인한다.
 *
 * 캐시가 수만 건까지 자란다 — 매번 배열을 순회하면 site 빌드가(하루 여러 번
 * 돈다) 수만×수십 번 선형 탐색을 하게 된다. 호출자가 이 함수로 **한 번만**
 * 색인을 만들고 `lookupPair`에 그 Map을 넘긴다.
 */
export function buildPairIndex(cache: NearbyDrivePair[]): Map<string, NearbyDrivePair> {
  return new Map(cache.map((p) => [p.pairKey, p]))
}

/** 색인에서 두 지점 간 실측 페어를 찾는다. 없으면 null */
export function lookupPair(
  index: Map<string, NearbyDrivePair>,
  idA: string,
  idB: string,
): NearbyDrivePair | null {
  return index.get(pairKeyOf(idA, idB)) ?? null
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- tests/site/nearby-drive-cache.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: `Store` 인터페이스에 메서드 추가**

`src/store/types.ts` 상단 import에 `NearbyDrivePair` 추가:

```typescript
import type {
  Cafe,
  BuzzSnapshot,
  Visit,
  Suggestion,
  GoldenLabel,
  Review,
  Health,
  BlacklistEntry,
  NotifyLog,
  NearbyDrivePair,
} from '../schema.js'
```

`readNotifyLog`/`writeNotifyLog` 선언 다음(48번 줄 근처, `appendRaw` 위)에 추가:

```typescript
  /**
   * 근처 추천 2단계 페어 캐시. 카페·식당·가볼 곳 어느 도메인 것도 아니라서
   * (셋을 가로지르는 데이터) health·notifyLog와 같은 자리(base Store)에만 둔다.
   */
  readNearbyDriveCache(): Promise<NearbyDrivePair[]>
  writeNearbyDriveCache(rows: NearbyDrivePair[]): Promise<void>
```

- [ ] **Step 7: `createJsonStore` 구현 추가**

`src/store/json-store.ts`의 import 목록(5~15번 줄)에 `NearbyDrivePairSchema` 추가:

```typescript
import {
  CafeSchema,
  BuzzSnapshotSchema,
  VisitSchema,
  SuggestionSchema,
  GoldenLabelSchema,
  ReviewSchema,
  HealthSchema,
  NotifyLogSchema,
  BlacklistEntrySchema,
  NearbyDrivePairSchema,
} from '../schema.js'
```

`readNotifyLog`/`writeNotifyLog` 구현 다음에 추가:

```typescript
    readNearbyDriveCache: () => readArray(dataDir, 'nearby-drive-cache.json', NearbyDrivePairSchema),
    writeNearbyDriveCache: (r) => writeArray(dataDir, 'nearby-drive-cache.json', r),
```

- [ ] **Step 8: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 9: Commit**

```bash
git add src/schema.ts src/site/nearby-drive-cache.ts tests/site/nearby-drive-cache.test.ts src/store/types.ts src/store/json-store.ts
git commit -m "feat(nearby-drive): 페어 캐시 스키마·저장소·대칭 키 순수 함수"
```

---

### Task 2: 필요한 페어 계산 순수 함수

**Files:**
- Create: `src/site/nearby-drive-plan.ts`
- Test: `tests/site/nearby-drive-plan.test.ts`

**Interfaces:**
- Consumes: `nearestByDomain`, `GeoPoint` from `./nearby.js`(Task 1 이전부터 존재, 1단계); `pairKeyOf` from `./nearby-drive-cache.js`(Task 1); `Cafe` from `../schema.js`; `Restaurant` from `../restaurant-schema.js`; `Spot` from `../spot-schema.js`
- Produces: `PlannedFetch { anchorId: string; candidateId: string }`, `planNearbyDriveFetches(input: PlanInput): PlannedFetch[]`

이 함수는 **원본 배열만** 쓴다(site 최종 페이로드 없이) — 이 잡이 `site` 빌드와 다른 시각에, 다른 목적으로 돌기 때문에 최종 페이로드에 의존하면 안 된다(Global Constraints 참고).

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/site/nearby-drive-plan.test.ts
import { describe, it, expect } from 'vitest'
import { planNearbyDriveFetches } from '../../src/site/nearby-drive-plan.js'
import { pairKeyOf, buildPairIndex } from '../../src/site/nearby-drive-cache.js'
import type { Cafe } from '../../src/schema.js'
import type { Restaurant } from '../../src/restaurant-schema.js'
import type { Spot } from '../../src/spot-schema.js'

function cafe(id: string, lat: number, lng: number, over: Partial<Cafe> = {}): Cafe {
  return {
    kakaoPlaceId: id, name: `카페${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
    ...over,
  } as Cafe
}

function restaurant(id: string, lat: number, lng: number, over: Partial<Restaurant> = {}): Restaurant {
  return {
    kakaoPlaceId: id, name: `식당${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
    ...over,
  } as Restaurant
}

function spot(id: string, lat: number, lng: number, over: Partial<Spot> = {}): Spot {
  return {
    kakaoPlaceId: id, name: `가볼곳${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
    ...over,
  } as Spot
}

describe('planNearbyDriveFetches', () => {
  it('preLimit 이내 미스만 계획한다', () => {
    const out = planNearbyDriveFetches({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901), restaurant('r2', 37.6, 127.0)],
      spots: [],
      cacheIndex: buildPairIndex([]),
      preLimit: 1,
      budget: 100,
    })
    // c1 -> 식당 방향에서 preLimit=1 이므로 더 가까운 r1만 계획된다
    expect(out.some((f) => f.anchorId === 'c1' && f.candidateId === 'r1')).toBe(true)
    expect(out.some((f) => f.anchorId === 'c1' && f.candidateId === 'r2')).toBe(false)
  })

  it('이미 캐시된 페어는 계획에서 뺀다', () => {
    const cache = buildPairIndex([{
      pairKey: pairKeyOf('c1', 'r1'), minutes: 5, km: 1, tollWon: 0,
      measuredAt: '2026-09-01T00:00:00.000Z',
    }])
    const out = planNearbyDriveFetches({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      spots: [],
      cacheIndex: cache,
      preLimit: 10,
      budget: 100,
    })
    expect(out.some((f) => f.anchorId === 'c1' && f.candidateId === 'r1')).toBe(false)
  })

  it('대칭 키라서 한 방향 계산 결과가 반대 방향 중복을 막는다', () => {
    // c1 -> r1 방향에서 이미 잡혔으면, r1 -> c1 방향에서 다시 안 나온다
    const out = planNearbyDriveFetches({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      spots: [],
      cacheIndex: buildPairIndex([]),
      preLimit: 10,
      budget: 100,
    })
    const c1ToR1 = out.filter((f) =>
      (f.anchorId === 'c1' && f.candidateId === 'r1')
      || (f.anchorId === 'r1' && f.candidateId === 'c1'))
    expect(c1ToR1).toHaveLength(1)
  })

  it('예산을 넘기면 그 자리에서 멈춘다', () => {
    const restaurants = Array.from({ length: 5 }, (_, i) =>
      restaurant(`r${i}`, 37.5 + i * 0.001, 126.9 + i * 0.001))
    const out = planNearbyDriveFetches({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants,
      spots: [],
      cacheIndex: buildPairIndex([]),
      preLimit: 10,
      budget: 2,
    })
    expect(out).toHaveLength(2)
  })

  it('parkingGrade C(cityOnly) 후보는 제외하지만 앵커로는 쓴다', () => {
    const cityOnlyCafe = cafe('c1', 37.5, 126.9, {
      attributes: { parkingGrade: 'C' } as never,
    })
    const out = planNearbyDriveFetches({
      cafes: [cityOnlyCafe],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      spots: [],
      cacheIndex: buildPairIndex([]),
      preLimit: 10,
      budget: 100,
    })
    // c1은 cityOnly 지만 앵커라서 근처 식당을 계획해야 한다
    expect(out.some((f) => f.anchorId === 'c1' && f.candidateId === 'r1')).toBe(true)
    // 반대로 c1이 후보(식당 r1의 근처 카페)로 쓰이는 건 없어야 한다
    expect(out.some((f) => f.anchorId === 'r1' && f.candidateId === 'c1')).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- tests/site/nearby-drive-plan.test.ts`
Expected: FAIL — `Cannot find module '../../src/site/nearby-drive-plan.js'`

- [ ] **Step 3: 구현**

```typescript
// src/site/nearby-drive-plan.ts
import { nearestByDomain, type GeoPoint } from './nearby.js'
import { pairKeyOf, type NearbyDrivePair } from './nearby-drive-cache.js'
import type { Cafe } from '../schema.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { Spot } from '../spot-schema.js'

export interface PlannedFetch {
  anchorId: string
  candidateId: string
}

export interface PlanInput {
  cafes: Cafe[]
  restaurants: Restaurant[]
  spots: Spot[]
  cacheIndex: Map<string, NearbyDrivePair>
  preLimit: number
  budget: number
}

interface RawPoint extends GeoPoint {
  cityOnly: boolean
}

type RawRow = { kakaoPlaceId: string; lat: number; lng: number; status: string; attributes: { parkingGrade?: string } | null }

/**
 * status active 만 남기고 원본 좌표로 변환한다. cityOnly는
 * parkingGrade === 'C' 로 직접 계산한다(payload.ts 세 곳과 같은 규칙) —
 * 이 잡은 site 최종 페이로드가 없으므로 원본에서 바로 판단한다.
 */
function toRawPoints(rows: RawRow[]): RawPoint[] {
  return rows
    .filter((r) => r.status === 'active')
    .map((r) => ({
      id: r.kakaoPlaceId, lat: r.lat, lng: r.lng,
      cityOnly: r.attributes?.parkingGrade === 'C',
    }))
}

export function planNearbyDriveFetches(input: PlanInput): PlannedFetch[] {
  const { cafes, restaurants, spots, cacheIndex, preLimit, budget } = input

  const cafeAll = toRawPoints(cafes)
  const restAll = toRawPoints(restaurants)
  const spotAll = toRawPoints(spots)
  const cands = (all: RawPoint[]) => all.filter((p) => !p.cityOnly)

  const directionPairs: [RawPoint[], RawPoint[]][] = [
    [cafeAll, cands(restAll)], [cafeAll, cands(spotAll)],
    [restAll, cands(cafeAll)], [restAll, cands(spotAll)],
    [spotAll, cands(cafeAll)], [spotAll, cands(restAll)],
  ]

  const seen = new Set(cacheIndex.keys())
  const out: PlannedFetch[] = []
  for (const [anchors, candidates] of directionPairs) {
    const matches = nearestByDomain(anchors, candidates, preLimit)
    for (const [anchorId, list] of matches) {
      for (const m of list) {
        const key = pairKeyOf(anchorId, m.id)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ anchorId, candidateId: m.id })
        if (out.length >= budget) return out
      }
    }
  }
  return out
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- tests/site/nearby-drive-plan.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add src/site/nearby-drive-plan.ts tests/site/nearby-drive-plan.test.ts
git commit -m "feat(nearby-drive): 6방향 top-K 중 캐시 미스만 골라 예산 안에서 계획하는 순수 함수"
```

---

### Task 3: 매일 잡 — 캐시 채우기

**Files:**
- Create: `src/jobs/nearby-drive-times.ts`
- Test: `tests/jobs/nearby-drive-times.test.ts`
- Modify: `src/jobs/usage-watch.ts`

**Interfaces:**
- Consumes: `planNearbyDriveFetches`, `PlannedFetch` from `../site/nearby-drive-plan.js`(Task 2); `buildPairIndex` from `../site/nearby-drive-cache.js`(Task 1); `recordFailure`, `recordSuccess` from `../sources/health.js`(기존); `SourceError` from `../sources/rate-limiter.js`(기존); `Coord`, `Route` from `../sources/kakao-directions.js`(기존)
- Produces: `NEARBY_DRIVE_SOURCE = 'kakao-directions-nearby'`, `DAILY_BUDGET = 5000`, `PRE_LIMIT = 10`, `NearbyDriveDeps`, `NearbyDriveResult { measured: number; unroutable: number; failed: number; quotaExhausted: boolean; budgetExhausted: boolean }`, `runNearbyDriveTimes(deps, opts?): Promise<NearbyDriveResult>`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/jobs/nearby-drive-times.test.ts
import { describe, it, expect } from 'vitest'
import { runNearbyDriveTimes, type NearbyDriveDeps } from '../../src/jobs/nearby-drive-times.js'
import { pairKeyOf } from '../../src/site/nearby-drive-cache.js'
import { SourceError } from '../../src/sources/rate-limiter.js'
import type { Cafe, Health, NearbyDrivePair } from '../../src/schema.js'
import type { Restaurant } from '../../src/restaurant-schema.js'
import type { Coord, Route } from '../../src/sources/kakao-directions.js'

const NOW = new Date('2026-09-15T00:00:00.000Z')

function cafe(id: string, lat: number, lng: number): Cafe {
  return {
    kakaoPlaceId: id, name: `카페${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
  } as Cafe
}

function restaurant(id: string, lat: number, lng: number): Restaurant {
  return {
    kakaoPlaceId: id, name: `식당${id}`, sigungu: '부평구', lat, lng,
    firstSeenAt: '2026-01-01', status: 'active', ambiguousName: false,
    attributes: null, tags: [],
  } as Restaurant
}

function harness(opts?: {
  cafes?: Cafe[]
  restaurants?: Restaurant[]
  cache?: NearbyDrivePair[]
  route?: (o: Coord, d: Coord) => Promise<{ route: Route | null; payload: unknown }>
}) {
  let cache = opts?.cache ?? []
  let health: Health[] = []
  let routeCalls = 0
  const deps: NearbyDriveDeps = {
    store: {
      readCafes: async () => opts?.cafes ?? [],
      readRestaurants: async () => opts?.restaurants ?? [],
      readSpots: async () => [],
      readNearbyDriveCache: async () => cache,
      writeNearbyDriveCache: async (r) => { cache = r },
      appendRaw: async () => 'p',
      readHealth: async () => health,
      writeHealth: async (r) => { health = r },
    },
    directions: {
      route: async (o, d) => {
        routeCalls++
        return opts?.route ? opts.route(o, d) : { route: { minutes: 10, km: 2, tollWon: 0 }, payload: {} }
      },
    },
    now: NOW,
  }
  return { deps, cache: () => cache, health: () => health, routeCalls: () => routeCalls }
}

describe('runNearbyDriveTimes', () => {
  it('캐시에 없는 페어만 API를 호출해서 채운다', async () => {
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.measured).toBe(1)
    expect(h.routeCalls()).toBe(1)
    expect(h.cache()).toHaveLength(1)
    expect(h.cache()[0]!.pairKey).toBe(pairKeyOf('c1', 'r1'))
  })

  it('이미 캐시된 페어는 재호출하지 않는다(대칭 근사)', async () => {
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      cache: [{
        pairKey: pairKeyOf('c1', 'r1'), minutes: 5, km: 1, tollWon: 0,
        measuredAt: '2026-09-01T00:00:00.000Z',
      }],
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.measured).toBe(0)
    expect(h.routeCalls()).toBe(0)
  })

  it('예산을 넘으면 budgetExhausted: true', async () => {
    const restaurants = Array.from({ length: 5 }, (_, i) =>
      restaurant(`r${i}`, 37.5 + i * 0.001, 126.9 + i * 0.001))
    const h = harness({ cafes: [cafe('c1', 37.5, 126.9)], restaurants })
    const r = await runNearbyDriveTimes(h.deps, { budget: 2 })
    expect(r.budgetExhausted).toBe(true)
    expect(r.measured).toBe(2)
  })

  it('처리할 미스가 0건이어도 health 성공을 기록한다', async () => {
    const h = harness({})
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.measured).toBe(0)
    const entry = h.health().find((x) => x.source === 'kakao-directions-nearby')
    expect(entry?.lastSuccessAt).toBe(NOW.toISOString())
  })

  it('미스가 있는데 전부 실패하면 health 성공을 기록하지 않는다', async () => {
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      route: async () => { throw new Error('네트워크 오류') },
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.failed).toBe(1)
    const entry = h.health().find((x) => x.source === 'kakao-directions-nearby')
    expect(entry?.lastSuccessAt).toBeFalsy()
  })

  it('쿼터 연속 3회 실패 시 조기 중단한다', async () => {
    const restaurants = Array.from({ length: 10 }, (_, i) =>
      restaurant(`r${i}`, 37.5 + i * 0.001, 126.9 + i * 0.001))
    let calls = 0
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants,
      route: async () => { calls++; throw new SourceError('429', 429) },
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.quotaExhausted).toBe(true)
    expect(calls).toBe(3)
  })

  it('경로를 못 찾은 페어는 캐시에 안 남긴다', async () => {
    const h = harness({
      cafes: [cafe('c1', 37.5, 126.9)],
      restaurants: [restaurant('r1', 37.501, 126.901)],
      route: async () => ({ route: null, payload: {} }),
    })
    const r = await runNearbyDriveTimes(h.deps)
    expect(r.unroutable).toBe(1)
    expect(h.cache()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- tests/jobs/nearby-drive-times.test.ts`
Expected: FAIL — `Cannot find module '../../src/jobs/nearby-drive-times.js'`

- [ ] **Step 3: 구현**

```typescript
// src/jobs/nearby-drive-times.ts
import { planNearbyDriveFetches } from '../site/nearby-drive-plan.js'
import { buildPairIndex, pairKeyOf } from '../site/nearby-drive-cache.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
import type { Coord, Route } from '../sources/kakao-directions.js'
import type { Cafe, Health, NearbyDrivePair } from '../schema.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { Spot } from '../spot-schema.js'

export const NEARBY_DRIVE_SOURCE = 'kakao-directions-nearby'
export const DAILY_BUDGET = 5000
export const PRE_LIMIT = 10
const QUOTA_GIVE_UP = 3
const FLUSH_EVERY = 25

export interface NearbyDriveDeps {
  store: {
    readCafes(): Promise<Cafe[]>
    readRestaurants(): Promise<Restaurant[]>
    readSpots(): Promise<Spot[]>
    readNearbyDriveCache(): Promise<NearbyDrivePair[]>
    writeNearbyDriveCache(rows: NearbyDrivePair[]): Promise<void>
    appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
    readHealth(): Promise<Health[]>
    writeHealth(rows: Health[]): Promise<void>
  }
  directions: { route(o: Coord, d: Coord): Promise<{ route: Route | null; payload: unknown }> }
  now?: Date
}

export interface NearbyDriveResult {
  measured: number
  unroutable: number
  failed: number
  quotaExhausted: boolean
  budgetExhausted: boolean
}

/**
 * 근처 추천 2단계 — 캐시에 없는 앵커↔후보 페어를 카카오 길찾기로 채운다.
 *
 * site 빌드(하루 여러 번)와 달리 이 잡은 **매일 한 번**만 돌아 오늘의
 * 예산만큼만 처리한다. 캐시가 다 채워지면 "오늘 할 일 0건"이 정상 상태가
 * 되고(classify.ts와 같은 이유), 남은 미스는 그날의 top-10 재계산에서
 * 자연히 다시 잡힌다 — 별도의 "밀린 작업 큐"를 유지하지 않는다.
 */
export async function runNearbyDriveTimes(
  deps: NearbyDriveDeps,
  opts: { budget?: number; preLimit?: number } = {},
): Promise<NearbyDriveResult> {
  const { store, directions, now = new Date() } = deps
  const budget = opts.budget ?? DAILY_BUDGET
  const preLimit = opts.preLimit ?? PRE_LIMIT

  const [cafes, restaurants, spots, cache] = await Promise.all([
    store.readCafes(), store.readRestaurants(), store.readSpots(), store.readNearbyDriveCache(),
  ])
  const cacheIndex = buildPairIndex(cache)

  // budget+1개까지 물어봐서, 오늘 미스가 예산을 넘었는지(budgetExhausted)를
  // 별도 카운트 없이 판단한다.
  const planned = planNearbyDriveFetches({
    cafes, restaurants, spots, cacheIndex, preLimit, budget: budget + 1,
  })
  const budgetExhausted = planned.length > budget
  const targets = planned.slice(0, budget)

  const byId = new Map<string, { lat: number; lng: number; name: string }>()
  for (const c of cafes) byId.set(c.kakaoPlaceId, c)
  for (const r of restaurants) byId.set(r.kakaoPlaceId, r)
  for (const s of spots) byId.set(s.kakaoPlaceId, s)

  let measured = 0
  let unroutable = 0
  let failed = 0
  let quotaErrors = 0
  let quotaExhausted = false
  const additions: NearbyDrivePair[] = []

  for (const [i, t] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) {
      await store.writeNearbyDriveCache([...cache, ...additions])
    }
    const anchor = byId.get(t.anchorId)
    const cand = byId.get(t.candidateId)
    if (!anchor || !cand) continue
    try {
      const { route, payload } = await directions.route(
        { lat: anchor.lat, lng: anchor.lng },
        { lat: cand.lat, lng: cand.lng },
      )
      await store.appendRaw(NEARBY_DRIVE_SOURCE, `${anchor.name} -> ${cand.name}`, payload, now)
      if (!route) {
        unroutable++
        continue
      }
      additions.push({
        pairKey: pairKeyOf(t.anchorId, t.candidateId),
        minutes: route.minutes,
        km: route.km,
        tollWon: route.tollWon,
        measuredAt: now.toISOString(),
      })
      measured++
      quotaErrors = 0
    } catch (e) {
      failed++
      await recordFailure(store, NEARBY_DRIVE_SOURCE, e, now)
      if (e instanceof SourceError && e.status === 429) {
        if (++quotaErrors >= QUOTA_GIVE_UP) {
          quotaExhausted = true
          break
        }
      } else {
        quotaErrors = 0
      }
    }
  }

  await store.writeNearbyDriveCache([...cache, ...additions])
  // targets 가 0곳(=오늘 처리할 미스가 없는 정상 상태)이어도 성공으로
  // 기록한다 — classify.ts 에서 고친 것과 같은 원칙(daily-watch 오탐 방지).
  if (targets.length === 0 || measured > 0) {
    await recordSuccess(store, NEARBY_DRIVE_SOURCE, now)
  }

  return { measured, unroutable, failed, quotaExhausted, budgetExhausted }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- tests/jobs/nearby-drive-times.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: `usage-watch.ts`에 새 소스 등록**

`src/jobs/usage-watch.ts`의 `WEEKLY_SOURCES` 배열(43~49번 줄)에 추가:

```typescript
const WEEKLY_SOURCES = [
  'kakao-local', 'kakao-directions', 'harvest', LIVENESS_SOURCE,
  'kakao-local-restaurant', 'kakao-directions-restaurant', 'harvest-restaurant',
  RESTAURANT_LIVENESS_SOURCE,
  'kakao-local-spot', 'kakao-directions-spot', 'harvest-spot',
  SPOT_LIVENESS_SOURCE,
  'kakao-directions-nearby',
] as const
```

(`DAILY_STALE_HOURS`가 아니라 `WEEKLY_SOURCES`에 넣는 이유: 이 잡 자체는 매일 돌지만, 캐시가 다 채워진 뒤엔 "오늘 신규 0건"이 며칠 이어질 수 있는 성격이 주간 소스들과 비슷하다 — 216시간 기준이 36시간 기준보다 오탐 위험이 적다. 스펙 참고.)

- [ ] **Step 6: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: Commit**

```bash
git add src/jobs/nearby-drive-times.ts tests/jobs/nearby-drive-times.test.ts src/jobs/usage-watch.ts
git commit -m "feat(nearby-drive): 매일 캐시 채우기 잡 — 예산 상한·쿼터 조기중단·빈 큐도 성공 기록"
```

---

### Task 4: CLI 배선

**Files:**
- Modify: `src/cli/run.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `runNearbyDriveTimes` from `../jobs/nearby-drive-times.js`(Task 3)

- [ ] **Step 1: import 추가**

`src/cli/run.ts` 상단 import 목록(다른 `run*` 잡 import들 근처)에 추가:

```typescript
import { runNearbyDriveTimes } from '../jobs/nearby-drive-times.js'
```

- [ ] **Step 2: 새 CLI 케이스 추가**

이 계획 작성 시점 기준 `case 'drive':` 블록은 398~406번 줄이다 — 실제 줄
번호는 그 사이 다른 작업으로 달라질 수 있으니 `grep -n "case 'drive':" -A
10 src/cli/run.ts`로 직접 위치를 확인한 뒤 그 블록(`break }` 다음) 바로
아래에 추가한다. `restaurant-drive`(660번대)와 같은 패턴으로
`createContext()`의 `base.store`(카페·캐시 겸용)에 식당·가볼 곳 store 를
합성한다:

```typescript
    case 'nearby-drive': {
      const base = createContext()
      const restaurantStore = createRestaurantJsonStore(base.env.DATA_DIR)
      const spotStore = createSpotJsonStore(base.env.DATA_DIR)
      const ctx = {
        store: {
          readCafes: base.store.readCafes,
          readRestaurants: restaurantStore.readRestaurants,
          readSpots: spotStore.readSpots,
          readNearbyDriveCache: base.store.readNearbyDriveCache,
          writeNearbyDriveCache: base.store.writeNearbyDriveCache,
          appendRaw: base.store.appendRaw,
          readHealth: base.store.readHealth,
          writeHealth: base.store.writeHealth,
        },
        directions: base.directions,
      }
      const budget = numFlag(rest, 'budget')
      const preLimit = numFlag(rest, 'pre-limit')
      console.log(`근처 이동시간 캐시 채우기 시작${budget ? ` (예산 ${budget}건)` : ''}`)
      const r = await runNearbyDriveTimes(ctx, { budget, preLimit })
      console.log(
        `  측정 ${r.measured}건 / 경로없음 ${r.unroutable}건 / 실패 ${r.failed}건`
        + `${r.budgetExhausted ? ' · 예산 소진(내일 이어서)' : ''}`
        + `${r.quotaExhausted ? ' · 쿼터 소진' : ''}`,
      )
      break
    }
```

(`createRestaurantJsonStore`/`createSpotJsonStore`는 이미 파일 상단에 import돼 있다 — `restaurant-drive`/`spot-drive` 케이스가 이미 쓰고 있다.)

- [ ] **Step 3: 쓰기 락 대상에 추가**

`MUTATING` Set(796~801번 줄)에 `'nearby-drive'` 추가:

```typescript
const MUTATING = new Set([
  'discover', 'buzz', 'classify', 'drive', 'suggest', 'visited', 'hide', 'label',
  'restaurant-discover', 'restaurant-buzz', 'restaurant-classify', 'restaurant-drive', 'restaurant-suggest',
  'restaurant-liveness',
  'spot-discover', 'spot-buzz', 'spot-classify', 'spot-drive', 'spot-suggest', 'spot-liveness',
  'nearby-drive',
])
```

- [ ] **Step 4: `package.json`에 스크립트 추가**

`"restaurant-drive"` 스크립트 줄 옆에 추가:

```json
    "nearby-drive": "tsx --env-file-if-exists=.env src/cli/run.ts nearby-drive",
```

- [ ] **Step 5: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 기존 테스트 회귀 확인**

Run: `npm test`
Expected: 기존 테스트 전부 PASS (이 태스크는 새 유닛 테스트를 추가하지 않는다 — CLI 배선 자체는 Task 8의 실측 실행으로 검증한다)

- [ ] **Step 7: Commit**

```bash
git add src/cli/run.ts package.json
git commit -m "feat(nearby-drive): CLI nearby-drive 명령 배선"
```

---

### Task 5: GitHub Actions 매일 워크플로

**Files:**
- Create: `.github/workflows/daily-nearby-drive.yml`

**Interfaces:**
- Consumes: `npm run nearby-drive`(Task 4), `scripts/commit-data.sh`(기존, 전 워크플로 공용)

- [ ] **Step 1: 워크플로 파일 작성**

```yaml
# .github/workflows/daily-nearby-drive.yml
name: daily-nearby-drive
on:
  schedule:
    # 11:05 UTC = 20:05 KST. 그날의 카페·식당·가볼 곳 저녁 판정
    # (18:23·18:56·19:29 KST)이 전부 끝난 뒤라, 오늘 새로 active 가 된
    # 곳도 당일부터 근처 추천 후보에 반영된다. 기존 어느 시각과도 안 겹친다.
    - cron: '5 11 * * *'
  workflow_dispatch:

# data/ 를 쓰는 워크플로는 전부 하나씩 돈다 — 다른 모든 잡과 같은
# data-write 그룹을 공유한다(daily-buzz-restaurant.yml 주석 참고).
concurrency:
  group: data-write
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run nearby-drive
        env:
          KAKAO_REST_API_KEY: ${{ secrets.KAKAO_REST_API_KEY }}
          # 길찾기에 LLM 은 쓰지 않지만 환경변수 검증이 provider 키를 요구한다.
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      # 커밋·푸시 규칙은 scripts/commit-data.sh 한 곳에 있다 — 전 워크플로 공용.
      # npm run --silent site 가 세 페이로드 + 근처 추천 3파일을 전부
      # 다시 만든다 — 이걸 건너뛰면 오늘 채운 캐시가 화면에 절대 안 반영된다.
      - name: 데이터 커밋
        run: bash scripts/commit-data.sh "근처 이동시간 캐시 채우기"
```

- [ ] **Step 2: YAML 문법 확인**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/daily-nearby-drive.yml'))" ` (또는 `npx js-yaml .github/workflows/daily-nearby-drive.yml`)
Expected: 에러 없이 파싱됨

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/daily-nearby-drive.yml
git commit -m "ci: 근처 이동시간 캐시를 매일 채우는 워크플로 추가"
```

---

### Task 6: site 빌드 통합 — 캐시 조회 + 실측 우선 정렬

**Files:**
- Modify: `src/site/nearby-payload.ts`
- Modify: `tests/site/nearby-payload.test.ts`
- Modify: `src/cli/run.ts`(`case 'site':` 블록)

**Interfaces:**
- Consumes: `buildPairIndex`, `lookupPair` from `./nearby-drive-cache.js`(Task 1); `estimateDriveMinutes` from `../pipeline/geo.js`(기존); `NearbyDrivePair` from `../schema.js`
- Produces: `NearbyCard`에 `driveMinutes: number | null` 필드 추가, `BuildNearbyInput`에 `driveCache: NearbyDrivePair[]`·`preLimit: number` 필드 추가

**API 호출은 없다** — 캐시 조회 + 순수 계산뿐이다.

- [ ] **Step 1: 기존 테스트 중 지금 수정과 모순되는 것부터 고친다**

`tests/site/nearby-payload.test.ts`의 "출력 카드에 driveMinutes 필드가 없다" 테스트(66~78번 줄)를 아래로 **교체**한다 — 이번 태스크로 이 필드가 생기므로 기존 assertion이 거짓이 된다:

```typescript
  it('캐시에 실측이 있으면 driveMinutes를 채우고, 없으면 null이다', () => {
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [{ kakaoPlaceId: 'r1', lat: 37.501, lng: 126.901 } as Restaurant],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [{ id: 'r1', name: '식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never],
      spotSite: [],
      driveCache: [],
      preLimit: 10,
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants[0]).toHaveProperty('driveMinutes', null)
    expect(result.cafe.c1!.restaurants[0]).toHaveProperty('distanceKm')
  })
```

같은 파일의 나머지 다섯 `describe` 블록 호출부에도 전부 `driveCache: [], preLimit: 10,`을 `limit: 5,` 앞에 추가한다(타입 에러 방지 — `BuildNearbyInput`이 이번 태스크로 필수 필드 두 개를 더 요구하게 된다).

- [ ] **Step 2: 새 테스트 추가**

같은 파일 맨 끝(마지막 `})` 앞, describe 블록 안)에 추가:

```typescript
  it('실측 페어가 있으면 그 값 기준으로 재정렬한다(직선거리 순서와 달라도)', () => {
    const near: Restaurant = { kakaoPlaceId: 'near', lat: 37.501, lng: 126.901 } as Restaurant
    const far: Restaurant = { kakaoPlaceId: 'far', lat: 37.502, lng: 126.902 } as Restaurant
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [near, far],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [
        { id: 'near', name: '가까운식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never,
        { id: 'far', name: '먼식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never,
      ],
      spotSite: [],
      // 직선거리로는 near가 더 가깝지만, 실측으로는 far가 더 빠르다고 캐시해둔다
      driveCache: [
        { pairKey: 'c1:far', minutes: 3, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
        { pairKey: 'c1:near', minutes: 30, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
      ],
      preLimit: 10,
      limit: 5,
    })
    const ids = result.cafe.c1!.restaurants.map((r) => r.id)
    expect(ids[0]).toBe('far')
    expect(ids[1]).toBe('near')
  })

  it('preLimit으로 직선거리 1차 후보를 좁힌 뒤에만 재정렬한다', () => {
    // preLimit=1이면 far는 애초에 1차 후보에도 못 들어간다(near가 더 가까움)
    const near: Restaurant = { kakaoPlaceId: 'near', lat: 37.501, lng: 126.901 } as Restaurant
    const far: Restaurant = { kakaoPlaceId: 'far', lat: 38.5, lng: 127.9 } as Restaurant
    const result = buildNearbyPayloads({
      cafes: [cafe({ kakaoPlaceId: 'c1', lat: 37.5, lng: 126.9 })],
      restaurants: [near, far],
      spots: [],
      cafeSite: [siteCafe({ id: 'c1' }) as never],
      restaurantSite: [
        { id: 'near', name: '가까운식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never,
        { id: 'far', name: '먼식당', sigungu: '부평구', imageUrl: null, tags: [], ratingAvg: 0, ratingCount: 0, cityOnly: false } as never,
      ],
      spotSite: [],
      driveCache: [
        { pairKey: 'c1:far', minutes: 1, km: 1, tollWon: 0, measuredAt: '2026-09-15T00:00:00.000Z' },
      ],
      preLimit: 1,
      limit: 5,
    })
    expect(result.cafe.c1!.restaurants.map((r) => r.id)).toEqual(['near'])
  })
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- tests/site/nearby-payload.test.ts`
Expected: FAIL(타입 에러 — `driveCache`/`preLimit` 없음, `driveMinutes` 관련 assertion 불일치)

- [ ] **Step 4: `src/site/nearby-payload.ts` 수정**

파일 상단 import에 추가:

```typescript
import { buildPairIndex, lookupPair } from './nearby-drive-cache.js'
import { estimateDriveMinutes } from '../pipeline/geo.js'
import type { NearbyDrivePair } from '../schema.js'
```

`NearbyCard` 인터페이스(7~18번 줄)에 필드 추가:

```typescript
export interface NearbyCard {
  id: string
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
  distanceKm: number
  /** 실측 있으면 분 단위, 없으면 null(카드는 이때 distanceKm으로 폴백 표시) */
  driveMinutes: number | null
  /** 앵커(지금 보는 곳)에서 이 카드로의 차량 길찾기 링크 */
  directionsUrl: string
}
```

`BuildNearbyInput`(20~28번 줄)에 필드 추가:

```typescript
export interface BuildNearbyInput {
  cafes: Cafe[]
  restaurants: Restaurant[]
  spots: Spot[]
  cafeSite: SiteCafe[]
  restaurantSite: SiteRestaurant[]
  spotSite: SiteSpot[]
  driveCache: NearbyDrivePair[]
  /** 직선거리 1차 필터 개수(2단계 K). 그 안에서만 실측 기준 재정렬한다 */
  preLimit: number
  limit: number
}
```

`toCards` 함수(99~111번 줄)를 아래로 교체 — 실측 있으면 그 값, 없으면 `estimateDriveMinutes(직선거리)`로 정렬 기준을 통일해 재정렬한 뒤 `finalLimit`으로 자른다:

```typescript
function toCards(
  anchor: GeoCard,
  matches: NearbyMatch[],
  byId: Map<string, GeoCard>,
  driveIndex: Map<string, NearbyDrivePair>,
  finalLimit: number,
): NearbyCard[] {
  const withRank = matches.flatMap((m) => {
    const c = byId.get(m.id)
    if (!c) return []
    const hit = lookupPair(driveIndex, anchor.id, c.id)
    const rankMinutes = hit ? hit.minutes : estimateDriveMinutes(m.distanceKm)
    return [{
      card: {
        id: c.id, name: c.name, imageUrl: c.imageUrl, tags: c.tags, sigungu: c.sigungu,
        ratingAvg: c.ratingAvg, ratingCount: c.ratingCount, distanceKm: m.distanceKm,
        driveMinutes: hit ? hit.minutes : null,
        directionsUrl: directionsUrl(anchor, c),
      },
      rankMinutes,
    }]
  })
  withRank.sort((a, b) => a.rankMinutes - b.rankMinutes)
  return withRank.slice(0, finalLimit).map((x) => x.card)
}
```

`nearbyMap` 함수(114~129번 줄)를 아래로 교체 — `preLimit`으로 1차 후보를 넓게 잡고 `finalLimit`으로 최종을 자른다:

```typescript
function nearbyMap(
  anchors: GeoCard[],
  candidates: GeoCard[],
  driveIndex: Map<string, NearbyDrivePair>,
  preLimit: number,
  finalLimit: number,
): Map<string, NearbyCard[]> {
  const matches = nearestByDomain(anchors, candidates, preLimit)
  const candidateById = new Map(candidates.map((c) => [c.id, c]))
  const anchorById = new Map(anchors.map((a) => [a.id, a]))
  const result = new Map<string, NearbyCard[]>()
  for (const [anchorId, m] of matches) {
    const anchor = anchorById.get(anchorId)
    if (!anchor) continue
    result.set(anchorId, toCards(anchor, m, candidateById, driveIndex, finalLimit))
  }
  return result
}
```

`buildNearbyPayloads`(131번 줄~) 시작 부분을 교체:

```typescript
export function buildNearbyPayloads(input: BuildNearbyInput): NearbyPayloads {
  const {
    cafes, restaurants, spots, cafeSite, restaurantSite, spotSite,
    driveCache, preLimit, limit,
  } = input
  const driveIndex = buildPairIndex(driveCache)

  const cafeAnchors = toGeoCards(cafes, cafeSite, { excludeCityOnly: false })
  const cafeCands = toGeoCards(cafes, cafeSite, { excludeCityOnly: true })
  const restAnchors = toGeoCards(restaurants, restaurantSite, { excludeCityOnly: false })
  const restCands = toGeoCards(restaurants, restaurantSite, { excludeCityOnly: true })
  const spotAnchors = toGeoCards(spots, spotSite, { excludeCityOnly: false })
  const spotCands = toGeoCards(spots, spotSite, { excludeCityOnly: true })

  const cafeToRest = nearbyMap(cafeAnchors, restCands, driveIndex, preLimit, limit)
  const cafeToSpot = nearbyMap(cafeAnchors, spotCands, driveIndex, preLimit, limit)
  const restToCafe = nearbyMap(restAnchors, cafeCands, driveIndex, preLimit, limit)
  const restToSpot = nearbyMap(restAnchors, spotCands, driveIndex, preLimit, limit)
  const spotToCafe = nearbyMap(spotAnchors, cafeCands, driveIndex, preLimit, limit)
  const spotToRest = nearbyMap(spotAnchors, restCands, driveIndex, preLimit, limit)
```

(이 아래 `cafe`/`restaurant`/`spot` 결과 조립 부분은 기존 코드 그대로 — 안 바뀐다.)

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- tests/site/nearby-payload.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: `case 'site':` 호출부 갱신**

`src/cli/run.ts`에서 `buildNearbyPayloads(` 호출부를 찾아(이 계획 작성
시점 기준 492~502번 줄, `grep -n "buildNearbyPayloads(" src/cli/run.ts`로
직접 확인) 교체:

```typescript
        const driveCache = await store.readNearbyDriveCache()
        const nearby = buildNearbyPayloads({
          cafes, restaurants: outerRestaurants, spots: outerSpots,
          cafeSite: payload.cafes,
          restaurantSite: outerRestPayload?.restaurants ?? [],
          spotSite: outerSpotPayload?.spots ?? [],
          driveCache,
          preLimit: 10,
          limit: 5,
        })
```

- [ ] **Step 7: 전체 타입 검사 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 전부 통과

- [ ] **Step 8: Commit**

```bash
git add src/site/nearby-payload.ts tests/site/nearby-payload.test.ts src/cli/run.ts
git commit -m "feat(nearby-drive): site 빌드가 캐시를 읽어 실측 우선으로 근처 카드를 재정렬"
```

---

### Task 7: 웹 UI — "차로 N분" 표시

**Files:**
- Modify: `web/src/lib/nearby-types.ts`
- Modify: `web/src/app/nearby-card.tsx`

**Interfaces:**
- Consumes: 없음(기존 `NearbyCard` 표시 컴포넌트 수정)

- [ ] **Step 1: 타입에 필드 추가**

`web/src/lib/nearby-types.ts`의 `NearbyCard` 인터페이스에 추가(`src/site/nearby-payload.ts`의 `NearbyCard`와 필드를 맞춘다):

```typescript
export interface NearbyCard {
  id: string
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
  distanceKm: number
  driveMinutes: number | null
}
```

- [ ] **Step 2: 카드 표시 로직 수정**

`web/src/app/nearby-card.tsx`에서 거리 표시 줄을 찾아 교체:

```tsx
        <p className="mt-0.5 text-[12px] text-ink-soft">
          {item.sigungu} · {item.driveMinutes != null ? `차로 ${item.driveMinutes}분` : `직선거리 ${item.distanceKm}km`}
        </p>
```

- [ ] **Step 3: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 없음(단, `web/src/generated/site-*-nearby.json`에 아직 `driveMinutes` 필드가 없는 예전 형식이 남아있다면 `as unknown as Record<...>` 캐스팅을 거치는 기존 lib 함수들 덕에 컴파일 타임 에러는 안 난다 — Task 8에서 실측 데이터로 갱신된다)

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/nearby-types.ts web/src/app/nearby-card.tsx
git commit -m "feat(nearby-drive): 근처 카드에 실측 있으면 '차로 N분' 표시"
```

---

### Task 8: 실측 검증 — 소규모 백필 + 빌드 + 브라우저 확인

**Files:** 없음(검증 전용 태스크)

**Interfaces:**
- Consumes: Task 1~7 전부

캐시가 완전히 빈 상태에서 전체 백필(4만~7만 건)을 한 번에 돌리면 하루 예산(5,000건)을 넘어 오래 걸린다 — 이 태스크는 **기능이 올바르게 동작하는지**를 작은 예산으로 검증하는 것이 목적이다. 실제 전체 백필은 매일 워크플로가 배포 후 자동으로 진행한다.

- [ ] **Step 1: 소규모 예산으로 로컬 실행**

Run: `npm run nearby-drive -- --budget 20`
Expected: 콘솔에 `측정 N건 / 경로없음 N건 / 실패 N건` 출력, `data/nearby-drive-cache.json`에 최대 20건 생성됨(카카오 API 키가 `.env`에 있어야 한다 — 없으면 이 스텝은 건너뛰고 Step 2로 가되, Step 3의 "차로 N분" 확인은 스킵한다)

- [ ] **Step 2: 캐시 파일 육안 확인**

Run: `node -e "const d=require('./data/nearby-drive-cache.json'); console.log(d.length, d[0])"`
Expected: 배열 길이가 0보다 크고(1단계 실행 성공 시), 각 항목이 `pairKey`/`minutes`/`km`/`tollWon`/`measuredAt` 필드를 가진다

- [ ] **Step 3: site 빌드로 반영 확인**

Run: `npm run site`
Expected: 콘솔에 "근처 추천 3파일 생성 완료" 출력. 이어서:

Run: `node -e "const d=require('./web/src/generated/site-cafe-nearby.json'); const hit = Object.values(d).flatMap(v => [...v.restaurants, ...v.spots]).find(c => c.driveMinutes != null); console.log(hit ?? '실측 히트 없음(예산이 작아 우연히 다른 페어만 캐싱됐을 수 있음 — 정상)')"`
Expected: `driveMinutes`가 채워진 카드가 최소 하나 보이거나(정상), 혹은 이번 실행에서 캐싱된 페어들이 우연히 어느 앵커의 최종 top-5 안에 안 들었을 수도 있다(그래도 실패는 아니다 — `--budget`을 늘려 재실행하면 확률이 올라간다)

- [ ] **Step 4: 전체 테스트 + 타입 검사 + 웹 빌드**

Run: `npm test && npx tsc --noEmit && cd web && npx tsc --noEmit && npm test && npm run build`
Expected: 전부 통과, 빌드 성공

- [ ] **Step 5: 로컬 프리뷰로 실제 렌더링 확인**

`npm run dev`(web 디렉터리)로 로컬 서버를 띄우고, Step 3에서 `driveMinutes`가 채워진 것으로 확인된 앵커의 상세 페이지에 접속해 근처 카드에 "차로 N분"이 실제로 뜨는지 브라우저로 확인한다. 실측 히트가 없었다면 아무 카드나 열어 "직선거리 X.Xkm" 폴백이 정상 표시되는지만 확인한다.

- [ ] **Step 6: 데이터 커밋**

```bash
git add data/nearby-drive-cache.json web/src/generated/site-cafe-nearby.json web/src/generated/site-restaurant-nearby.json web/src/generated/site-spot-nearby.json
git commit -m "chore(nearby-drive): 로컬 소규모 백필 결과 커밋 (검증용, 이후 매일 잡이 이어서 채운다)"
```

**배포 후 확인할 것(사용자에게 안내)**: `daily-nearby-drive` 워크플로가 매일 20:05 KST에 돌면서 8~14일에 걸쳐 캐시를 채운다. `data/health.json`의 `kakao-directions-nearby` 항목으로 진행 상황을 볼 수 있다 — `consecutiveFailures: 0`이 유지되면 정상.
