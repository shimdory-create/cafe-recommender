# 식당 추천 파이프라인 (1단계: 데이터만) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카페 파이프라인과 나란히 도는 식당 데이터 파이프라인을 만든다. 화면에는
아직 아무것도 안 보인다 — 산출물은 `data/restaurants.json` 등 새 데이터 파일뿐이다.

**Architecture:** 지역·거리·화제량 수식·폐업 감지 같은 도메인 무관 로직은 그대로
import 해 쓴다. 검색어·관련성 판별·제외 목록·태그·LLM 프롬프트 다섯 곳만 식당판을
새로 쓴다. 저장소를 직접 읽고 쓰는 잡(liveness·drive-times)은 카페 코드를 전혀
건드리지 않기 위해 얇게 복사한다. `buzz.ts`(관련성 함수 주입)와 `score.ts`(상수
export)에는 카페 쪽 동작이 바이트 단위로 그대로인 **가산적** 변경만 한다.

**Tech Stack:** TypeScript, Node, Zod, Vitest — 기존 카페 파이프라인과 동일.

**Spec:** [docs/superpowers/specs/2026-09-01-restaurant-pipeline-design.md](../specs/2026-09-01-restaurant-pipeline-design.md)

## Global Constraints

- **카페 파이프라인 파일은 새 필드·새 export 추가 외에는 절대 수정하지 않는다.** 기존
  카페 테스트(`npm run test`, 43개 파일)는 이 계획의 모든 태스크가 끝난 뒤에도
  100% 그대로 통과해야 한다 — 이것이 "카페 영향 0"의 실측 증거다.
- 검색어는 항상 `"{시도} {시군구} {키워드}"` 형태로 조합한다 (동명 시군구 문제,
  카페 파이프라인과 동일한 이유).
- 새 파일은 기존 카페 파일과 같은 스타일을 따른다 — 순수 함수는 `pipeline/`,
  저장소를 만지는 잡은 `jobs/`, 정적 목록은 `config/`.
- `data/restaurants.json`, `data/restaurant-buzz.json`, `data/restaurant-suggestions.json`,
  `data/restaurant-blacklist.json` 이 새 파일이다. `data/cafes.json` 등 기존 파일은
  건드리지 않는다. `data/health.json`, `data/raw/` 는 **공유한다** — health 는 소스
  이름으로만 구분되므로 이미 범용이고, watch 감시가 식당 소스도 같은 틀로 보게 하려면
  같은 파일에 있어야 한다.

---

### Task 1: 식당 스키마

**Files:**
- Create: `src/restaurant-schema.ts`
- Test: `tests/restaurant-schema.test.ts`

**Interfaces:**
- Produces: `RestaurantSchema`, `Restaurant` (타입), `RestaurantAttributesSchema`,
  `RestaurantAttributes` (타입), `SiteRestaurantSchema` (2단계에서 쓸 표시용 — 지금은
  타입만 정의해 둔다), `RestaurantBlacklistEntrySchema`(카페의 `BlacklistEntry`와
  동일 모양)

카페의 `CafeSchema`/`CafeAttributesSchema`(`src/schema.ts:45-63`, `9-42`)를 참고해
같은 필드 이름 규칙을 따르되, 도메인 전용 축만 바꾼다: `menuLevel` 대신
`cuisineType`, `hasBakery`/`breadBakedOnsite`/`bakerySignal` 은 뺀다, `hasRoom`·
`reservable` 을 새로 넣는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/restaurant-schema.test.ts
import { describe, it, expect } from 'vitest'
import { RestaurantSchema, RestaurantAttributesSchema } from '../src/restaurant-schema.js'

describe('RestaurantAttributesSchema', () => {
  it('cuisineType 은 정해진 값만 받는다', () => {
    const base = {
      cuisineType: '한식', evidence: 'e', parkingGrade: 'A', parkingEvidence: 'p',
      hasRoom: null, reservable: null, viewStrength: 0, viewTypes: [],
      outdoorSeating: null, teenAppeal: null, confidence: 0.5,
      extractedAt: '2026-09-01T00:00:00.000Z', modelVersion: 'test',
    }
    expect(RestaurantAttributesSchema.safeParse(base).success).toBe(true)
    expect(RestaurantAttributesSchema.safeParse({ ...base, cuisineType: '아무거나' }).success)
      .toBe(false)
  })

  it('cuisineType 을 모르면 null 이다', () => {
    const base = {
      cuisineType: null, evidence: 'e', parkingGrade: '?', parkingEvidence: '',
      hasRoom: null, reservable: null, viewStrength: 0, viewTypes: [],
      outdoorSeating: null, teenAppeal: null, confidence: 0.2,
      extractedAt: '2026-09-01T00:00:00.000Z', modelVersion: 'test',
    }
    expect(RestaurantAttributesSchema.safeParse(base).success).toBe(true)
  })
})

describe('RestaurantSchema', () => {
  it('신규 발굴 카페와 같은 최소 필드로 파싱된다', () => {
    const r = {
      kakaoPlaceId: '1', name: '식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-01T00:00:00.000Z', status: 'pending_extraction',
      ambiguousName: false, tags: [],
    }
    expect(RestaurantSchema.safeParse(r).success).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/restaurant-schema.test.ts`
Expected: FAIL — `src/restaurant-schema.ts` 모듈이 없다는 에러.

- [ ] **Step 3: 스키마 작성**

`src/schema.ts` 의 `CafeSchema`/`CafeAttributesSchema`/`Health`/`BlacklistEntrySchema`
import 구조를 그대로 따른다 (health·blacklist·raw 타입은 카페 스키마 파일에서
그대로 재수출한다 — 새로 정의하면 `usage-watch.ts`가 보는 `Health` 타입이 갈라진다).

```typescript
// src/restaurant-schema.ts
import { z } from 'zod'
import { HealthSchema, BlacklistEntrySchema } from './schema.js'

export { HealthSchema, BlacklistEntrySchema }
export type { Health, BlacklistEntry } from './schema.js'

/** 음식 종류. 여기서 늘리지 않는다 — 카페 성격 태그와 같은 이유(스펙 참고) */
export const CUISINE_TYPES = ['한식', '일식', '중식', '양식', '분식', '고기구이'] as const
export type CuisineType = (typeof CUISINE_TYPES)[number]

export const RestaurantAttributesSchema = z.object({
  /** 모르면 null — 카페의 scale 널 규칙과 동일 */
  cuisineType: z.enum(CUISINE_TYPES).nullable(),
  evidence: z.string(),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),
  parkingEvidence: z.string(),
  /** 룸·개별공간 여부 (부모님 모시고 가는 경우 대비) */
  hasRoom: z.boolean().nullable(),
  /** 예약 가능 여부 — 웨이팅 회피 신호 */
  reservable: z.boolean().nullable(),
  viewStrength: z.number().int().min(0).max(5),
  viewTypes: z.array(z.string()),
  outdoorSeating: z.boolean().nullable(),
  teenAppeal: z.number().min(0).max(5).nullable(),
  confidence: z.number().min(0).max(1),
  extractedAt: z.string(),
  modelVersion: z.string().min(1),
})
export type RestaurantAttributes = z.infer<typeof RestaurantAttributesSchema>

export const RestaurantSchema = z.object({
  kakaoPlaceId: z.string().min(1),
  name: z.string().min(1),
  sigungu: z.string().min(1),
  roadAddress: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  lat: z.number(),
  lng: z.number(),
  categoryName: z.string().nullable().optional(),
  kakaoPlaceUrl: z.string().nullable().optional(),
  naverMapUrl: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  straightKm: z.number().nullable().optional(),
  driveMinutesEst: z.number().int().nullable().optional(),
  driveMinutes: z.number().int().nullable().optional(),
  driveKm: z.number().nullable().optional(),
  tollWon: z.number().int().nullable().optional(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string().optional(),
  status: z.enum(['active', 'hidden', 'excluded_auto', 'pending_extraction']),
  excludeReason: z.string().nullable().optional(),
  ambiguousName: z.boolean().default(false),
  imageUrl: z.string().nullable().optional(),
  attributes: RestaurantAttributesSchema.nullable(),
  /** Layer 4 태그. cuisineType 이 null 이면 빈 배열 — 카페의 "태그 0개 배제"와 같은 게이트를 그대로 쓴다 */
  tags: z.array(z.string()),
})
export type Restaurant = z.infer<typeof RestaurantSchema>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/restaurant-schema.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 기존 카페 테스트 회귀 확인**

Run: `npm test`
Expected: 43 test files 그대로 통과 (새 파일 추가는 카페 스키마를 안 건드렸으므로 영향 없음)

- [ ] **Step 6: 커밋**

```bash
git add src/restaurant-schema.ts tests/restaurant-schema.test.ts
git commit -m "feat(restaurant): 식당 스키마 — 음식종류·룸·예약 축"
```

---

### Task 2: 식당 저장소

**Files:**
- Create: `src/store/restaurant-json-store.ts`
- Test: `tests/store/restaurant-json-store.test.ts`

**Interfaces:**
- Consumes: `RestaurantSchema`, `RestaurantAttributesSchema` (Task 1), `HealthSchema`,
  `BlacklistEntrySchema` (from `restaurant-schema.ts` 재수출)
- Produces: `RestaurantStore` 인터페이스, `createRestaurantJsonStore(dataDir): RestaurantStore`

`src/store/json-store.ts` 를 건드리지 않는다 — `readArray`/`writeArray` 헬퍼가
모듈 비공개라서, 같은 40줄짜리 함수를 이 파일 안에 다시 둔다. 파일은 별개지만
가리키는 실제 경로(`dataDir`)는 카페와 같은 `data/` 디렉터리다 — `health.json`과
`raw/` 는 그래서 자동으로 공유된다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/store/restaurant-json-store.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRestaurantJsonStore } from '../../src/store/restaurant-json-store.js'

let dir: string

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('createRestaurantJsonStore', () => {
  it('쓴 뒤 읽으면 같은 내용이 온다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'rest-store-'))
    const store = createRestaurantJsonStore(dir)
    expect(await store.readRestaurants()).toEqual([])
    const row = {
      kakaoPlaceId: '1', name: '식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-01T00:00:00.000Z', status: 'pending_extraction' as const,
      ambiguousName: false, attributes: null, tags: [],
    }
    await store.writeRestaurants([row])
    expect(await store.readRestaurants()).toEqual([row])
  })

  it('파일이 없으면 빈 배열이다 (카페 저장소와 같은 동작)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'rest-store-'))
    const store = createRestaurantJsonStore(dir)
    expect(await store.readRestaurantBuzz()).toEqual([])
    expect(await store.readRestaurantSuggestions()).toEqual([])
    expect(await store.readHealth()).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/store/restaurant-json-store.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/store/json-store.ts:22-55`(`readArray`/`writeArray`)와 `68-108`
(`createJsonStore` 본문)을 식당용 파일 이름으로 바꿔 그대로 옮긴다.

```typescript
// src/store/restaurant-json-store.ts
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  RestaurantSchema, HealthSchema, BlacklistEntrySchema,
} from '../restaurant-schema.js'
import { BuzzSnapshotSchema, SuggestionSchema } from '../schema.js'
import type { Restaurant, Health, BlacklistEntry } from '../restaurant-schema.js'
import type { BuzzSnapshot, Suggestion } from '../schema.js'

async function readArray<S extends z.ZodType>(
  dir: string, file: string, schema: S,
): Promise<z.output<S>[]> {
  const path = join(dir, file)
  if (!existsSync(path)) return []
  const text = await readFile(path, 'utf8')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    throw new Error(`${file} JSON 파싱 실패: ${(e as Error).message}`)
  }
  const parsed = z.array(schema).safeParse(json)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const where = first?.path.join('.') || '(최상위)'
    throw new Error(`${file} 스키마 오류 [${where}]: ${first?.message}`)
  }
  return parsed.data as z.output<S>[]
}

async function writeArray(dir: string, file: string, rows: unknown): Promise<void> {
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `.${file}.tmp`)
  await writeFile(tmp, JSON.stringify(rows, null, 2) + '\n', 'utf8')
  await rename(tmp, join(dir, file))
}

export function rawDirOf(dataDir: string): string {
  return process.env.RAW_DIR || join(dataDir, 'raw')
}

export interface RestaurantStore {
  readRestaurants(): Promise<Restaurant[]>
  writeRestaurants(rows: Restaurant[]): Promise<void>
  readRestaurantBuzz(): Promise<BuzzSnapshot[]>
  writeRestaurantBuzz(rows: BuzzSnapshot[]): Promise<void>
  readRestaurantSuggestions(): Promise<Suggestion[]>
  writeRestaurantSuggestions(rows: Suggestion[]): Promise<void>
  readBlacklist(): Promise<BlacklistEntry[]>
  readHealth(): Promise<Health[]>
  writeHealth(rows: Health[]): Promise<void>
  appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
}

export function createRestaurantJsonStore(dataDir: string): RestaurantStore {
  return {
    readRestaurants: () => readArray(dataDir, 'restaurants.json', RestaurantSchema),
    writeRestaurants: (r) => writeArray(dataDir, 'restaurants.json', r),

    readRestaurantBuzz: () => readArray(dataDir, 'restaurant-buzz.json', BuzzSnapshotSchema),
    writeRestaurantBuzz: (r) => writeArray(dataDir, 'restaurant-buzz.json', r),

    readRestaurantSuggestions: () =>
      readArray(dataDir, 'restaurant-suggestions.json', SuggestionSchema),
    writeRestaurantSuggestions: (r) => writeArray(dataDir, 'restaurant-suggestions.json', r),

    readBlacklist: () => readArray(dataDir, 'restaurant-blacklist.json', BlacklistEntrySchema),

    // health·raw 는 카페와 같은 data/ 를 가리킨다 — 파일도 그대로 공유한다
    readHealth: () => readArray(dataDir, 'health.json', HealthSchema),
    writeHealth: (r) => writeArray(dataDir, 'health.json', r),

    async appendRaw(source, query, payload, now = new Date()) {
      const day = now.toISOString().slice(0, 10)
      const dir = join(rawDirOf(dataDir), day)
      await mkdir(dir, { recursive: true })
      const safe = `${source}-${query}`.replace(/[^\w가-힣-]+/g, '_').slice(0, 80)
      const path = join(dir, `${safe}-${now.getTime()}.json`)
      await writeFile(
        path,
        JSON.stringify({ source, query, fetchedAt: now.toISOString(), payload }, null, 2) + '\n',
        'utf8',
      )
      return path
    },
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/store/restaurant-json-store.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/store/restaurant-json-store.ts tests/store/restaurant-json-store.test.ts
git commit -m "feat(restaurant): 식당 전용 JSON 저장소 (health·raw 는 카페와 공유)"
```

---

### Task 3: 검색어·관련성·제외 목록

**Files:**
- Create: `src/config/restaurant-keywords.ts`
- Create: `src/pipeline/restaurant-relevance.ts`
- Create: `src/pipeline/restaurant-exclude.ts`
- Test: `tests/pipeline/restaurant-relevance.test.ts`
- Test: `tests/pipeline/restaurant-exclude.test.ts`

**Interfaces:**
- Produces: `RESTAURANT_SEARCH_KEYWORDS`, `restaurantCurationQueries(regionLabel)`,
  `isRestaurantRelevant(doc, name)`, `isAmbiguousRestaurantName(name)`,
  `evaluateRestaurantExclusion(input, blacklist): ExcludeReason`

`config/keywords.ts`(전체), `pipeline/relevance.ts`(전체), `pipeline/exclude.ts`(전체)를
그대로 복사해 다음만 바꾼다.

- [ ] **Step 1: 검색어 작성 (테스트 불필요 — 정적 목록)**

```typescript
// src/config/restaurant-keywords.ts
export const RESTAURANT_SEARCH_KEYWORDS = [
  '한식맛집', '일식맛집', '중식맛집', '양식맛집', '분식맛집', '고기맛집',
] as const

export function restaurantCurationQueries(regionLabel: string): string[] {
  return [
    `${regionLabel} 맛집 추천`,
    `${regionLabel} 맛집 베스트`,
    `${regionLabel} 가족 외식`,
  ]
}
```

- [ ] **Step 2: 관련성 판별 실패 테스트 작성**

```typescript
// tests/pipeline/restaurant-relevance.test.ts
import { describe, it, expect } from 'vitest'
import { isRestaurantRelevant } from '../../src/pipeline/restaurant-relevance.js'

const doc = (title: string, contents = '') => ({
  title, contents, dateTime: new Date(), thumbnail: '',
} as never)

describe('isRestaurantRelevant', () => {
  it('상호명 + 식당 문맥어가 있으면 관련 있다', () => {
    expect(isRestaurantRelevant(doc('부평 소문난식당 다녀왔어요 맛집'), '소문난식당')).toBe(true)
  })

  it('문맥어가 없으면 관련 없다 (상호명만으로는 부족)', () => {
    expect(isRestaurantRelevant(doc('소문난식당 근처 공원 산책'), '소문난식당')).toBe(false)
  })

  it('상호명이 아예 없으면 관련 없다', () => {
    expect(isRestaurantRelevant(doc('오늘 점심 맛집 다녀옴'), '소문난식당')).toBe(false)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/restaurant-relevance.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 관련성 판별 구현**

`pipeline/relevance.ts:1-68` 전체를 복사하고 `CAFE_CONTEXT`(7줄)와
`AMBIGUOUS_NAMES`(10-13줄)만 바꾼다. `splitBranch`(지점 분리 로직)는 식당도 "OO
본점/지점" 표기를 그대로 쓰므로 이름만 바꿔 그대로 둔다.

```typescript
// src/pipeline/restaurant-relevance.ts
import type { BlogDoc } from '../sources/kakao-blog.js'

const RESTAURANT_CONTEXT = ['식당', '맛집', '음식점', '메뉴', '식사', '먹방'] as const

const AMBIGUOUS_NAMES = new Set([
  '식당', '맛집', '음식점', '가든', '하우스', '식탁',
])

const squeeze = (s: string) => s.replace(/\s+/g, '')

export function splitBranch(name: string): { base: string; branch: string } {
  const n = name.trim()
  const m = /^(.+?)\s+([가-힣A-Za-z0-9]{2,}?)(본점|지점|점)$/.exec(n)
  if (!m) return { base: n, branch: '' }
  return { base: m[1]!.trim(), branch: m[2]! }
}

export function isRestaurantRelevant(doc: BlogDoc, name: string): boolean {
  const hay = squeeze(`${doc.title} ${doc.contents}`)
  const needle = squeeze(name)
  if (!needle) return false
  if (!hay.includes(needle)) {
    const { base, branch } = splitBranch(name)
    if (!branch || !hay.includes(squeeze(base)) || !hay.includes(branch)) return false
  }
  return RESTAURANT_CONTEXT.some((w) => hay.includes(w))
}

export function isAmbiguousRestaurantName(name: string): boolean {
  const n = squeeze(name)
  return n.length <= 2 || AMBIGUOUS_NAMES.has(n)
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/restaurant-relevance.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: 제외 목록 실패 테스트 작성**

```typescript
// tests/pipeline/restaurant-exclude.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateRestaurantExclusion } from '../../src/pipeline/restaurant-exclude.js'

describe('evaluateRestaurantExclusion', () => {
  it('배달·포장 전용은 카테고리로 배제한다', () => {
    const r = evaluateRestaurantExclusion(
      { name: '아무개식당', categoryName: '음식점 > 배달전문' }, [],
    )
    expect(r).toBe('category')
  })

  it('술집·호프는 카테고리로 배제한다', () => {
    const r = evaluateRestaurantExclusion(
      { name: '아무개호프', categoryName: '음식점 > 호프,요리주점' }, [],
    )
    expect(r).toBe('category')
  })

  it('블랙리스트(프랜차이즈)에 있으면 배제한다', () => {
    const r = evaluateRestaurantExclusion(
      { name: '맥도날드 부평점', categoryName: '음식점 > 패스트푸드' },
      [{ pattern: '맥도날드', matchType: 'contains' }],
    )
    expect(r).toBe('franchise')
  })

  it('둘 다 아니면 배제하지 않는다', () => {
    const r = evaluateRestaurantExclusion(
      { name: '소문난식당', categoryName: '음식점 > 한식' }, [],
    )
    expect(r).toBeNull()
  })
})
```

- [ ] **Step 7: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/restaurant-exclude.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 8: 제외 목록 구현**

`pipeline/exclude.ts` 전체 구조를 그대로 복사하고 `EXCLUDED_CATEGORY_KEYWORDS`만
바꾼다 (승인된 제외 기준: 프랜차이즈·패스트푸드, 배달·포장 전용, 술집·호프 —
프랜차이즈는 블랙리스트 파일로, 나머지 둘은 카테고리 키워드로).

```typescript
// src/pipeline/restaurant-exclude.ts
import type { BlacklistEntry } from '../restaurant-schema.js'

export type ExcludeReason = 'franchise' | 'category' | null

const EXCLUDED_CATEGORY_KEYWORDS = [
  '패스트푸드', '배달전문', '포장전문', '호프', '요리주점', '술집',
] as const

const squeeze = (s: string) => s.replace(/\s+/g, '')

function hit(name: string, e: BlacklistEntry): boolean {
  if (e.matchType === 'regex') {
    try {
      return new RegExp(e.pattern).test(name)
    } catch {
      return false
    }
  }
  const n = squeeze(name)
  const p = squeeze(e.pattern)
  if (e.matchType === 'exact') return n === p
  return n.includes(p)
}

export function evaluateRestaurantExclusion(
  input: { name: string; categoryName: string },
  blacklist: BlacklistEntry[],
): ExcludeReason {
  if (blacklist.some((e) => hit(input.name, e))) return 'franchise'
  if (EXCLUDED_CATEGORY_KEYWORDS.some((k) => input.categoryName.includes(k))) return 'category'
  return null
}
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/restaurant-exclude.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 10: 커밋**

```bash
git add src/config/restaurant-keywords.ts src/pipeline/restaurant-relevance.ts \
  src/pipeline/restaurant-exclude.ts tests/pipeline/restaurant-relevance.test.ts \
  tests/pipeline/restaurant-exclude.test.ts
git commit -m "feat(restaurant): 검색어·관련성 판별·제외 목록"
```

---

### Task 4: 태그(음식종류) 부여 — 게이트는 그대로 재사용

**Files:**
- Create: `src/pipeline/restaurant-tag.ts`
- Test: `tests/pipeline/restaurant-tag.test.ts`

**Interfaces:**
- Consumes: `RestaurantAttributes` (Task 1)
- Produces: `assignRestaurantTags(a: RestaurantAttributes): string[]`

**`pipeline/gate.ts` 는 이 태스크에서 전혀 안 건드린다.** `passesGate`/
`passesHardGate` 는 이미 `tags: string[]` + `parkingGrade` 만 보는 범용 함수라
(`gate.ts:1-4` 의 `GateInput`), `assignRestaurantTags` 가 만든 태그 배열을 그대로
넣으면 "음식종류 미분류 배제"가 "태그 0개 배제"와 같은 코드로 자동으로 성립한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/pipeline/restaurant-tag.test.ts
import { describe, it, expect } from 'vitest'
import { assignRestaurantTags } from '../../src/pipeline/restaurant-tag.js'
import { passesHardGate } from '../../src/pipeline/gate.js'
import type { RestaurantAttributes } from '../../src/restaurant-schema.js'

const base: RestaurantAttributes = {
  cuisineType: '한식', evidence: 'e', parkingGrade: 'A', parkingEvidence: 'p',
  hasRoom: null, reservable: null, viewStrength: 0, viewTypes: [],
  outdoorSeating: null, teenAppeal: null, confidence: 0.5,
  extractedAt: '2026-09-01T00:00:00.000Z', modelVersion: 'test',
}

describe('assignRestaurantTags', () => {
  it('음식 종류를 태그로 낸다', () => {
    expect(assignRestaurantTags(base)).toContain('한식')
  })

  it('룸이 있으면 룸 태그를 더한다', () => {
    expect(assignRestaurantTags({ ...base, hasRoom: true })).toContain('룸있음')
  })

  it('예약 가능이면 태그를 더한다', () => {
    expect(assignRestaurantTags({ ...base, reservable: true })).toContain('예약가능')
  })

  it('음식종류를 모르면 태그가 비고, 그러면 기존 게이트가 배제한다', () => {
    const tags = assignRestaurantTags({ ...base, cuisineType: null })
    expect(tags).toEqual([])
    expect(passesHardGate({ tags, parkingGrade: 'A' }).pass).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/restaurant-tag.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/pipeline/restaurant-tag.ts
import type { RestaurantAttributes } from '../restaurant-schema.js'

export function assignRestaurantTags(a: RestaurantAttributes): string[] {
  const tags = new Set<string>()
  if (a.cuisineType) tags.add(a.cuisineType)
  if (a.hasRoom) tags.add('룸있음')
  if (a.reservable) tags.add('예약가능')
  return [...tags]
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/restaurant-tag.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/restaurant-tag.ts tests/pipeline/restaurant-tag.test.ts
git commit -m "feat(restaurant): 음식종류·룸·예약 태그 (게이트는 gate.ts 그대로 재사용)"
```

---

### Task 5: `buzz.ts` 에 관련성 판별 주입 (카페 동작 불변)

**Files:**
- Modify: `src/pipeline/buzz.ts:1-2,31-37,80-86`
- Test: `tests/pipeline/buzz.test.ts` (기존 파일 — 회귀 확인용, 새 테스트 추가)

**Interfaces:**
- Produces: `computeBuzz(input & { isRelevant?: (doc, name) => boolean })`,
  `pickThumbnail(input & { isRelevant?: (doc, name) => boolean })` — **선택 인자,
  기본값은 지금의 카페 `isRelevant`.** 기본값을 생략한 기존 모든 호출(카페
  `daily-buzz.ts`)은 동작이 한 글자도 안 바뀐다.

이 태스크가 이 계획에서 유일하게 카페 파이프라인 파일을 수정하는 곳이다. **가산적
선택 인자 하나만 추가**하고, 기존 시그니처로 호출하면 결과가 완전히 동일함을
Step 5 에서 실측으로 확인한다.

- [ ] **Step 1: 실패하는 테스트 작성 (기존 `tests/pipeline/buzz.test.ts` 에 추가)**

```typescript
// tests/pipeline/buzz.test.ts 에 추가
it('isRelevant 를 주입하면 그 판정을 쓴다 (식당 등 다른 도메인용)', () => {
  const docs = [
    { title: '아무개식당 맛집 후기', contents: '', dateTime: new Date(), thumbnail: 't' } as never,
  ]
  // 카페 기본 판정으로는 관련 없음(카페 문맥어가 없다) -> relevantCount 0
  const withoutInjection = computeBuzz({ docs, cafeName: '아무개식당', now: new Date() })
  expect(withoutInjection.relevantCount).toBe(0)

  // 식당 판정을 주입하면 관련 있음으로 잡힌다
  const withInjection = computeBuzz({
    docs, cafeName: '아무개식당', now: new Date(),
    isRelevant: (d, n) => d.title.includes(n) && d.title.includes('맛집'),
  })
  expect(withInjection.relevantCount).toBe(1)
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/buzz.test.ts`
Expected: FAIL — `computeBuzz` 가 `isRelevant` 옵션을 모른다 (타입 에러 또는 기본
판별기로 0 을 반환해 두 번째 assert 실패)

- [ ] **Step 3: `computeBuzz`/`pickThumbnail` 에 선택 인자 추가**

`src/pipeline/buzz.ts:31-37`(`computeBuzz` 시그니처)과 `80-86`(`pickThumbnail`)만
고친다. 함수 본문 로직은 안 바꾼다 — `isRelevant` 를 지역 상수 대신 매개변수로
받을 뿐이다.

```typescript
// src/pipeline/buzz.ts — 변경 전
export function computeBuzz(input: {
  docs: BlogDoc[]
  cafeName: string
  now: Date
}): BuzzMetrics {
  const { docs, cafeName, now } = input
  const relevant = docs.filter((d) => isRelevant(d, cafeName))
  // ...
```

```typescript
// src/pipeline/buzz.ts — 변경 후
export function computeBuzz(input: {
  docs: BlogDoc[]
  cafeName: string
  now: Date
  /** 관련성 판별기. 안 주면 카페 기본값(관련성.ts) — 기존 호출부는 동작 불변 */
  isRelevant?: (doc: BlogDoc, name: string) => boolean
}): BuzzMetrics {
  const { docs, cafeName, now, isRelevant: relevantFn = isRelevant } = input
  const relevant = docs.filter((d) => relevantFn(d, cafeName))
  // ... (이하 본문 동일, 새 이름 relevantFn 은 이 줄에서만 쓰인다)
```

`pickThumbnail` 도 같은 방식으로 고친다:

```typescript
export function pickThumbnail(input: {
  docs: BlogDoc[]
  cafeName: string
  isRelevant?: (doc: BlogDoc, name: string) => boolean
}): string {
  const relevantFn = input.isRelevant ?? isRelevant
  for (const d of input.docs) {
    if (!d.thumbnail) continue
    if (!relevantFn(d, input.cafeName)) continue
    return d.thumbnail
  }
  return ''
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/buzz.test.ts`
Expected: PASS (기존 테스트 전부 + 새 테스트)

- [ ] **Step 5: 카페 회귀 전량 확인 (이 태스크의 핵심 안전장치)**

Run: `npm test`
Expected: 43 test files 전부 통과, 특히 `tests/jobs/daily-buzz.test.ts` 와
`tests/pipeline/buzz.test.ts` 의 기존 케이스가 값 하나도 안 바뀌고 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/pipeline/buzz.ts tests/pipeline/buzz.test.ts
git commit -m "feat(buzz): isRelevant 를 선택 인자로 주입 가능하게 (기존 호출 동작 불변)"
```

---

### Task 6: 식당 스코어링 — `score.ts` 는 상수 하나만 export

**Files:**
- Modify: `src/pipeline/score.ts:44` (한 줄 — `const` → `export const`)
- Create: `src/pipeline/restaurant-score.ts`
- Test: `tests/pipeline/restaurant-score.test.ts`

**Interfaces:**
- Consumes: `PARKING_MULT` (score.ts, 이 태스크에서 export 로 바꿈), `hotScore`,
  `pickWeekendCandidates` (score.ts, 무변경 재사용)
- Produces: `restaurantFamilyFit(input, now): number`

`familyFit`(`score.ts:55-74`)의 `menu` 항을 룸·예약 보너스로 바꾼 버전을 새로
쓴다. 거리·주차·재방문·계절·10대 선호 항은 로직이 동일하므로 복사해서 쓰되,
`PARKING_MULT` 딱 하나는 값이 갈리면 안 되는 상수라 export 해서 같은 값을
가져다 쓴다 (숫자를 두 곳에 따로 적으면 나중에 카페 쪽만 고치고 식당은
안 고치는 드리프트가 생긴다).

- [ ] **Step 1: `PARKING_MULT` export (한 줄)**

`src/pipeline/score.ts:44` 를:
```typescript
const PARKING_MULT: Record<FitInput['parkingGrade'], number> = {
```
다음으로 바꾼다:
```typescript
export const PARKING_MULT: Record<FitInput['parkingGrade'], number> = {
```

- [ ] **Step 2: 카페 회귀 확인 (export 추가는 동작에 영향 없어야 한다)**

Run: `npm test`
Expected: 43 test files 그대로 통과

- [ ] **Step 3: 실패하는 테스트 작성**

```typescript
// tests/pipeline/restaurant-score.test.ts
import { describe, it, expect } from 'vitest'
import { restaurantFamilyFit } from '../../src/pipeline/restaurant-score.js'

const base = {
  driveMinutes: 30, parkingGrade: 'A' as const, hasRoom: false, reservable: false,
  lastVisitedOn: null, outdoorOnly: false, teenAppeal: 2,
}

describe('restaurantFamilyFit', () => {
  it('룸이 있으면 점수가 오른다', () => {
    const now = new Date('2026-09-01')
    const withRoom = restaurantFamilyFit({ ...base, hasRoom: true }, now)
    const without = restaurantFamilyFit(base, now)
    expect(withRoom).toBeGreaterThan(without)
  })

  it('예약 가능하면 점수가 오른다', () => {
    const now = new Date('2026-09-01')
    const reservable = restaurantFamilyFit({ ...base, reservable: true }, now)
    const not = restaurantFamilyFit(base, now)
    expect(reservable).toBeGreaterThan(not)
  })

  it('주차 D 는 0점 — 카페와 같은 규칙', () => {
    const now = new Date('2026-09-01')
    expect(restaurantFamilyFit({ ...base, parkingGrade: 'D' }, now)).toBe(0)
  })
})
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/restaurant-score.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 5: 구현**

`score.ts:55-74` 의 `familyFit` 구조(거리·주차·재방문·계절·10대 항)를 그대로
따르되 `menu` 자리를 룸·예약 보너스로 바꾼다.

```typescript
// src/pipeline/restaurant-score.ts
import { PARKING_MULT } from './score.js'

const DAY = 86_400_000
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export interface RestaurantFitInput {
  driveMinutes: number
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  hasRoom: boolean | null
  reservable: boolean | null
  lastVisitedOn: string | null
  outdoorOnly: boolean
  teenAppeal: number
}

/**
 * 카페의 menuLevel(식사 가능 여부) 자리를 룸·예약 보너스로 바꿨다 — 식당은
 * 전부 식사가 되므로 그 축이 의미가 없다는 판단 (가족 요청, 설계 문서 2절).
 */
export function restaurantFamilyFit(i: RestaurantFitInput, now: Date): number {
  const distance = Math.exp(-Math.max(i.driveMinutes, 0) / 70)
  const parking = PARKING_MULT[i.parkingGrade]
  // 둘 다 있으면 더 후하게 — 부모님 모시고 가면서 안 기다리는 게 이상적
  const roomBonus = i.hasRoom ? 1.15 : 1.0
  const reserveBonus = i.reservable ? 1.15 : 1.0

  let unvisited = 1.0
  if (i.lastVisitedOn) {
    const days = (now.getTime() - new Date(i.lastVisitedOn).getTime()) / DAY
    unvisited = days <= 180 ? 0.15 : days <= 365 ? 0.5 : 0.8
  }

  const month = now.getUTCMonth() + 1
  const harsh = (month >= 7 && month <= 8) || month === 12 || month <= 2
  const season = i.outdoorOnly ? (harsh ? 0.5 : 1.2) : 1.0

  const teen = 0.85 + 0.03 * clamp(i.teenAppeal, 0, 5)

  return distance * parking * roomBonus * reserveBonus * unvisited * season * teen
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/restaurant-score.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: 커밋**

```bash
git add src/pipeline/score.ts src/pipeline/restaurant-score.ts \
  tests/pipeline/restaurant-score.test.ts
git commit -m "feat(restaurant): 가족적합도 — menuLevel 자리에 룸·예약 보너스"
```

---

### Task 7: LLM 프롬프트

**Files:**
- Modify: `src/llm/prompts.ts` (파일 끝에 새 export 만 추가 — 기존 함수는 안 건드림)
- Test: `tests/llm/restaurant-prompts.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 문자열 조립)
- Produces: `buildRestaurantExtractPrompt(input): string`,
  `buildRestaurantHarvestPrompt(regionLabel, snippets): string`,
  `RESTAURANT_PROMPT_VERSION`

`buildExtractPrompt`(`llm/prompts.ts:30-77`)와 `buildHarvestPrompt`(80-93)를
참고해 규칙 문구만 식당에 맞게 바꾼다. `PROMPT_VERSION`(카페용, 13번줄)은 안
건드리고 별도 상수를 새로 낸다 — 두 도메인의 프롬프트를 독립적으로 개정할 수
있어야 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/llm/restaurant-prompts.test.ts
import { describe, it, expect } from 'vitest'
import { buildRestaurantExtractPrompt } from '../../src/llm/prompts.js'

describe('buildRestaurantExtractPrompt', () => {
  it('식당 이름과 음식종류 규칙을 포함한다', () => {
    const p = buildRestaurantExtractPrompt({
      name: '소문난식당', sigungu: '부평구', categoryName: '음식점 > 한식',
      snippets: ['맛있었어요'], parkingSnippets: [],
    })
    expect(p).toContain('소문난식당')
    expect(p).toContain('cuisineType')
    expect(p).toContain('한식')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/llm/restaurant-prompts.test.ts`
Expected: FAIL — export 없음

- [ ] **Step 3: `src/llm/prompts.ts` 파일 끝에 추가**

```typescript
// src/llm/prompts.ts 끝에 추가

export const RESTAURANT_PROMPT_VERSION = 'r1'

export interface RestaurantExtractPromptInput {
  name: string
  sigungu: string
  categoryName: string
  snippets: string[]
  parkingSnippets: string[]
}

export function buildRestaurantExtractPrompt(i: RestaurantExtractPromptInput): string {
  const body = i.snippets.length
    ? i.snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')
    : '(후기 없음)'
  const parking = i.parkingSnippets.length
    ? i.parkingSnippets.map((s, n) => `[P${n + 1}] ${s}`).join('\n')
    : '(주차 언급 없음)'

  return `너는 한국 식당 정보를 구조화하는 도구다. 아래 블로그 후기에서만
근거를 찾아 JSON 으로 답하라.

식당: ${i.name}
지역: ${i.sigungu}
카카오 분류: ${i.categoryName}

--- 블로그 후기 ---
${body}

--- 주차 관련 후기 ---
${parking}

규칙:
1. 후기에 없는 것을 추측하지 마라. 모르면 null 을 쓰고, parkingGrade 는 "?" 를 쓴다.
2. evidence 에는 판단 근거가 된 원문을 그대로 인용하라. 요약하지 마라. 비워두지 마라.
3. parkingEvidence 에도 주차 판단의 근거 원문을 인용하라. 근거가 없으면 빈 문자열.
4. cuisineType: 한식/일식/중식/양식/분식/고기구이 중 하나만 고른다.
   메뉴가 뚜렷하게 안 나오면 null 이다. 추측하지 마라.
5. hasRoom: 룸·개별공간·단체석이 있다는 언급이 있으면 true, 명시적으로 없다고
   하면 false, 언급이 없으면 null.
6. reservable: 예약 가능하다는 언급이 있으면 true, "예약 불가"·"웨이팅 필수"
   처럼 명시되면 false, 언급이 없으면 null.
7. viewStrength: 0=뷰 없음, 3=뷰가 방문 이유가 될 만함, 5=뷰가 압도적.
   후기에 창밖 풍경·전망 언급이 없으면 0 이다.
8. viewTypes: 바다·강·호수·산·정원·도심 중 해당하는 것. viewStrength 가 0 이면 빈 배열.
9. parkingGrade — 차로 가는 가족이 헛걸음하지 않는 것이 목적이다. 후하게 주지 마라.
   A = 전용 주차장이 넉넉하다. B = 협소하거나 공용 주차장. "1시간 무료" 처럼
   조건부 무료는 최대 B. C = 5대 미만이거나 인근 유료 주차장 의존.
   D = 주차 불가 명시. ? = 언급 없음.
10. teenAppeal: 중고생이 좋아할 요소가 많을수록 높게. 0~5.
11. confidence: 후기 정보가 빈약하면 낮게. 0~1.`
}

export function buildRestaurantHarvestPrompt(regionLabel: string, snippets: string[]): string {
  return `아래는 "${regionLabel}" 맛집을 소개하는 블로그 글 조각들이다.
글에서 실제 식당 상호명만 뽑아 JSON 으로 답하라.

${snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')}

규칙:
1. 상호명만 뽑는다. "맛집", "가족외식", "고기집" 같은 일반어는 제외한다.
2. 지역명("${regionLabel}")을 상호명에 붙이지 마라.
3. 프랜차이즈(맥도날드·롯데리아·버거킹·교촌치킨·bhc 등)는 제외한다.
4. 확실하지 않으면 넣지 마라. 적게 뽑는 편이 낫다.
5. 같은 식당이 여러 번 나오면 한 번만 넣는다.`
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/llm/restaurant-prompts.test.ts`
Expected: PASS

- [ ] **Step 5: 카페 회귀 확인 (파일 끝에 추가만 했는지 확인)**

Run: `npm test`
Expected: 43 test files 그대로 통과

- [ ] **Step 6: 커밋**

```bash
git add src/llm/prompts.ts tests/llm/restaurant-prompts.test.ts
git commit -m "feat(restaurant): LLM 추출 프롬프트 (음식종류·룸·예약)"
```

---

### Task 8: 식당 속성 추출 헬퍼

**Files:**
- Create: `src/pipeline/restaurant-extract.ts`
- Test: `tests/pipeline/restaurant-extract.test.ts`

**Interfaces:**
- Consumes: `buildRestaurantExtractPrompt`, `RESTAURANT_PROMPT_VERSION` (Task 7),
  `RestaurantAttributesSchema` (Task 1), `LlmClient` (`src/llm/types.js`, 무변경)
- Produces: `extractRestaurantAttributes(deps, input): Promise<RestaurantAttributes>`

`pipeline/extract.ts` 전체(33줄)를 그대로 구조를 따라 복사한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/pipeline/restaurant-extract.test.ts
import { describe, it, expect } from 'vitest'
import { extractRestaurantAttributes } from '../../src/pipeline/restaurant-extract.js'

const fakeLlm = {
  modelVersion: 'fake-1',
  extract: async () => ({
    cuisineType: '한식', evidence: 'e', parkingGrade: 'A' as const, parkingEvidence: 'p',
    hasRoom: true, reservable: false, viewStrength: 0, viewTypes: [],
    outdoorSeating: null, teenAppeal: 3, confidence: 0.8,
  }),
}

describe('extractRestaurantAttributes', () => {
  it('LLM 응답에 extractedAt·modelVersion 을 붙인다', async () => {
    const now = new Date('2026-09-01T00:00:00.000Z')
    const a = await extractRestaurantAttributes(
      { llm: fakeLlm as never, now },
      { name: '소문난식당', sigungu: '부평구', categoryName: '', snippets: [], parkingSnippets: [] },
    )
    expect(a.extractedAt).toBe('2026-09-01T00:00:00.000Z')
    expect(a.modelVersion).toContain('fake-1')
    expect(a.cuisineType).toBe('한식')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/restaurant-extract.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/pipeline/restaurant-extract.ts
import { RestaurantAttributesSchema, type RestaurantAttributes } from '../restaurant-schema.js'
import {
  buildRestaurantExtractPrompt, RESTAURANT_PROMPT_VERSION,
  type RestaurantExtractPromptInput,
} from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'

export const LlmRestaurantAttributesSchema = RestaurantAttributesSchema.omit({
  extractedAt: true,
  modelVersion: true,
})

export async function extractRestaurantAttributes(
  deps: { llm: LlmClient; now?: Date },
  input: RestaurantExtractPromptInput,
): Promise<RestaurantAttributes> {
  const { llm, now = new Date() } = deps
  const raw = await llm.extract({
    prompt: buildRestaurantExtractPrompt(input),
    schema: LlmRestaurantAttributesSchema,
    maxRetries: 3,
    escalateTo: 'gemini-3.6-flash',
  })
  return RestaurantAttributesSchema.parse({
    ...raw,
    extractedAt: now.toISOString(),
    modelVersion: `${llm.modelVersion}+${RESTAURANT_PROMPT_VERSION}`,
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/restaurant-extract.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/restaurant-extract.ts tests/pipeline/restaurant-extract.test.ts
git commit -m "feat(restaurant): LLM 속성 추출 헬퍼"
```

---

### Task 9: 발굴 잡 (discover)

**Files:**
- Create: `src/pipeline/restaurant-harvest.ts`
- Create: `src/jobs/restaurant-discover.ts`
- Test: `tests/jobs/restaurant-discover.test.ts`

**Interfaces:**
- Consumes: `RestaurantStore` (Task 2), `RESTAURANT_SEARCH_KEYWORDS`,
  `restaurantCurationQueries` (Task 3), `evaluateRestaurantExclusion` (Task 3),
  `isAmbiguousRestaurantName` (Task 3), `buildRestaurantHarvestPrompt` (Task 7),
  도메인 무관 재사용: `regionLabel`/`Region`(`config/regions.js`), `HOME`/
  `haversineKm`/`estimateDriveMinutes`(`pipeline/geo.js`), `belongsToRegion`
  (`pipeline/region-match.js`), `resolveSigungu`(`pipeline/district.js`),
  `recordSuccess`/`recordFailure`(`sources/health.js`)
- Produces: `harvestCuratedRestaurants(deps, region)`, `runRestaurantDiscover(deps, opts)`,
  `restaurantNaverMapUrl(sigungu, name)`

`pipeline/harvest.ts`(전체 73줄)와 `jobs/weekly-discover.ts`(전체 162줄)를 그대로
복사해 다음만 바꾼다: import 출처(Task 3·7·2 모듈), `HarvestSchema`는 그대로(이름
배열은 도메인 무관), `SEARCH_KEYWORDS`→`RESTAURANT_SEARCH_KEYWORDS`,
`curationQueries`→`restaurantCurationQueries`, `buildHarvestPrompt`→
`buildRestaurantHarvestPrompt`, `evaluateExclusion`→`evaluateRestaurantExclusion`,
`isAmbiguousName`→`isAmbiguousRestaurantName`, `Cafe`→`Restaurant`,
`store.readCafes/writeCafes`→`store.readRestaurants/writeRestaurants`,
`'kakao-local'`/`'harvest'` health 소스 이름은 `'kakao-local-restaurant'`/
`'harvest-restaurant'` 로 바꾼다 (watch 감시에서 카페와 구분되게 — Task 13 에서
이 이름들을 그대로 다시 쓴다).

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/jobs/restaurant-discover.test.ts
import { describe, it, expect } from 'vitest'
import { runRestaurantDiscover } from '../../src/jobs/restaurant-discover.js'
import type { Region } from '../../src/config/regions.js'

const region: Region = { sido: '인천', sigungu: '부평구', excluded: false } as Region

function harness() {
  let saved: unknown[] = []
  let health: unknown[] = []
  const deps = {
    store: {
      readRestaurants: async () => saved as never,
      writeRestaurants: async (r: unknown[]) => { saved = r },
      readBlacklist: async () => [],
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    local: {
      searchKeyword: async () => ({
        places: [{
          id: '1', placeName: '소문난식당', roadAddressName: '인천 부평구 1',
          addressName: '인천 부평구 1', lat: 37.5, lng: 126.7, categoryName: '음식점 > 한식',
          placeUrl: '', phone: '',
        }],
        isEnd: true, payload: {},
      }),
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    llm: { modelVersion: 'fake-1', extract: async () => ({ names: [] }) } as never,
    now: new Date('2026-09-01'),
  }
  return { deps, saved: () => saved }
}

describe('runRestaurantDiscover', () => {
  it('카카오 키워드 검색으로 찾은 식당을 pending_extraction 으로 넣는다', async () => {
    const h = harness()
    const r = await runRestaurantDiscover(h.deps, { regions: [region], skipHarvest: true })
    expect(r.discovered).toBe(1)
    expect((h.saved()[0] as { status: string }).status).toBe('pending_extraction')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/restaurant-discover.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `restaurant-harvest.ts` 구현** (`pipeline/harvest.ts` 그대로 복사, import·이름만 교체)

```typescript
// src/pipeline/restaurant-harvest.ts
import { z } from 'zod'
import { restaurantCurationQueries } from '../config/restaurant-keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { buildRestaurantHarvestPrompt } from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

const HarvestSchema = z.object({
  names: z.array(z.string().min(1)).max(40),
})

export interface RestaurantHarvestDeps {
  blog: {
    search: (
      q: string, o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  local: { searchKeyword: (q: string, page: number) => Promise<{ places: KakaoPlace[] }> }
  llm: LlmClient
  store: Pick<RestaurantStore, 'appendRaw'>
}

export async function harvestCuratedRestaurants(
  deps: RestaurantHarvestDeps,
  region: Region,
): Promise<{ names: string[]; places: KakaoPlace[] }> {
  const { blog, local, llm, store } = deps
  const label = regionLabel(region)

  const snippets: string[] = []
  for (const q of restaurantCurationQueries(label)) {
    const res = await blog.search(q, { size: 30, sort: 'accuracy' })
    await store.appendRaw('kakao-blog-curation-restaurant', q, res.payload)
    snippets.push(...res.docs.map((d) => `${d.title} ${d.contents}`))
  }
  if (snippets.length === 0) return { names: [], places: [] }

  const { names } = await llm.extract({
    prompt: buildRestaurantHarvestPrompt(label, snippets),
    schema: HarvestSchema,
    maxRetries: 2,
  })

  const seen = new Set<string>()
  const places: KakaoPlace[] = []
  for (const name of names) {
    const { places: found } = await local.searchKeyword(`${region.sigungu} ${name}`, 1)
    const best = found[0]
    if (!best) continue
    if (seen.has(best.id)) continue
    seen.add(best.id)
    places.push(best)
  }
  return { names, places }
}
```

- [ ] **Step 4: `restaurant-discover.ts` 구현** (`jobs/weekly-discover.ts` 그대로 복사, import·이름만 교체)

```typescript
// src/jobs/restaurant-discover.ts
import { RESTAURANT_SEARCH_KEYWORDS } from '../config/restaurant-keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { HOME, haversineKm, estimateDriveMinutes } from '../pipeline/geo.js'
import { evaluateRestaurantExclusion } from '../pipeline/restaurant-exclude.js'
import { belongsToRegion } from '../pipeline/region-match.js'
import { isAmbiguousRestaurantName } from '../pipeline/restaurant-relevance.js'
import { harvestCuratedRestaurants } from '../pipeline/restaurant-harvest.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import { resolveSigungu } from '../pipeline/district.js'
import type { Restaurant, BlacklistEntry } from '../restaurant-schema.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { LlmClient } from '../llm/types.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export interface RestaurantDiscoverDeps {
  store: Pick<
    RestaurantStore,
    'readRestaurants' | 'writeRestaurants' | 'readBlacklist' | 'appendRaw'
    | 'readHealth' | 'writeHealth'
  >
  local: {
    searchKeyword: (
      q: string, page: number,
    ) => Promise<{ places: KakaoPlace[]; isEnd: boolean; payload: unknown }>
  }
  blog: {
    search: (
      q: string, o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  llm: LlmClient
  now?: Date
}

export interface RestaurantDiscoverResult {
  discovered: number
  excluded: number
  offRegion: number
  total: number
  errors: string[]
}

export const restaurantNaverMapUrl = (sigungu: string, name: string) =>
  `https://map.naver.com/p/search/${encodeURIComponent(`${sigungu} ${name}`)}`

function toRestaurant(p: KakaoPlace, region: Region, now: Date): Restaurant {
  const straightKm = haversineKm(HOME, { lat: p.lat, lng: p.lng })
  const sigungu = resolveSigungu({
    roadAddress: p.roadAddressName, address: p.addressName, scanned: region.sigungu,
  })
  return {
    kakaoPlaceId: p.id, name: p.placeName, sigungu,
    roadAddress: p.roadAddressName || null, address: p.addressName || null,
    lat: p.lat, lng: p.lng, categoryName: p.categoryName || null,
    kakaoPlaceUrl: p.placeUrl || null, naverMapUrl: restaurantNaverMapUrl(sigungu, p.placeName),
    phone: p.phone || null, straightKm: Number(straightKm.toFixed(2)),
    driveMinutesEst: estimateDriveMinutes(straightKm), firstSeenAt: now.toISOString(),
    status: 'pending_extraction', excludeReason: null,
    ambiguousName: isAmbiguousRestaurantName(p.placeName), attributes: null, tags: [],
  }
}

export async function runRestaurantDiscover(
  deps: RestaurantDiscoverDeps,
  opts: { regions: Region[]; skipHarvest?: boolean },
): Promise<RestaurantDiscoverResult> {
  const { store, local, blog, llm, now = new Date() } = deps
  const errors: string[] = []
  const existing = await store.readRestaurants()
  const byId = new Map<string, Restaurant>(existing.map((r) => [r.kakaoPlaceId, r]))
  const blacklist: BlacklistEntry[] = await store.readBlacklist()
  let discovered = 0
  let excluded = 0
  const offRegionIds = new Set<string>()

  const add = (p: KakaoPlace, region: Region) => {
    if (!p.id || byId.has(p.id)) return
    if (!belongsToRegion(p, region)) {
      offRegionIds.add(p.id)
      return
    }
    const restaurant = toRestaurant(p, region, now)
    const reason = evaluateRestaurantExclusion(
      { name: p.placeName, categoryName: p.categoryName }, blacklist,
    )
    if (reason) {
      restaurant.status = 'excluded_auto'
      restaurant.excludeReason = reason
      excluded++
    } else {
      discovered++
    }
    byId.set(p.id, restaurant)
  }

  for (const region of opts.regions) {
    try {
      for (const kw of RESTAURANT_SEARCH_KEYWORDS) {
        const query = `${regionLabel(region)} ${kw}`
        for (let page = 1; page <= 3; page++) {
          const res = await local.searchKeyword(query, page)
          await store.appendRaw('kakao-local-restaurant', query, res.payload, now)
          res.places.forEach((p) => add(p, region))
          if (res.isEnd) break
        }
      }
      await recordSuccess(store, 'kakao-local-restaurant', now)
    } catch (e) {
      errors.push(`${region.sigungu}: ${(e as Error).message}`)
      await recordFailure(store, 'kakao-local-restaurant', e, now)
    }

    if (opts.skipHarvest) continue
    try {
      const harvested = await harvestCuratedRestaurants({ blog, local, llm, store }, region)
      harvested.places.forEach((p) => add(p, region))
      await recordSuccess(store, 'harvest-restaurant', now)
    } catch (e) {
      errors.push(`${region.sigungu} 수확: ${(e as Error).message}`)
      await recordFailure(store, 'harvest-restaurant', e, now)
    }
  }

  await store.writeRestaurants([...byId.values()])
  return { discovered, excluded, offRegion: offRegionIds.size, total: byId.size, errors }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/jobs/restaurant-discover.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/pipeline/restaurant-harvest.ts src/jobs/restaurant-discover.ts \
  tests/jobs/restaurant-discover.test.ts
git commit -m "feat(restaurant): 발굴 잡 (그물 A + 그물 C)"
```

---

### Task 10: 화제량 잡 (daily-buzz)

**Files:**
- Create: `src/jobs/restaurant-daily-buzz.ts`
- Test: `tests/jobs/restaurant-daily-buzz.test.ts`

**Interfaces:**
- Consumes: `computeBuzz`, `pickThumbnail` (Task 5, `isRelevant` 로
  `isRestaurantRelevant` 주입), `RestaurantStore` (Task 2)
- Produces: `runRestaurantDailyBuzz(deps, opts)`

`jobs/daily-buzz.ts` 전체(152줄)를 그대로 복사해 `Cafe`→`Restaurant`,
`store.readCafes/writeCafes`→`readRestaurants/writeRestaurants`,
`store.readBuzz/writeBuzz`→`readRestaurantBuzz/writeRestaurantBuzz`,
`computeBuzz`/`pickThumbnail` 호출에 `isRelevant: isRestaurantRelevant` 추가,
health 소스 이름 `'kakao-blog'`→`'kakao-blog-restaurant'` 로 바꾼다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/jobs/restaurant-daily-buzz.test.ts
import { describe, it, expect } from 'vitest'
import { runRestaurantDailyBuzz } from '../../src/jobs/restaurant-daily-buzz.js'

function harness() {
  let restaurants = [{
    kakaoPlaceId: '1', name: '소문난식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
    firstSeenAt: '2026-09-01T00:00:00.000Z', status: 'active' as const,
    ambiguousName: false, attributes: null, tags: ['한식'],
  }]
  let buzz: unknown[] = []
  let health: unknown[] = []
  const deps = {
    store: {
      readRestaurants: async () => restaurants,
      writeRestaurants: async (r: typeof restaurants) => { restaurants = r },
      readRestaurantBuzz: async () => buzz as never,
      writeRestaurantBuzz: async (r: unknown[]) => { buzz = r },
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    blog: {
      search: async () => ({
        docs: [{
          title: '소문난식당 맛집 후기', contents: '정말 맛있었다',
          dateTime: new Date('2026-08-30'), thumbnail: 'https://img/1',
        }],
        payload: {},
      }),
    },
    now: new Date('2026-09-01'),
  }
  return { deps, buzz: () => buzz }
}

describe('runRestaurantDailyBuzz', () => {
  it('식당 관련성 판별로 화제량을 잰다', async () => {
    const h = harness()
    const r = await runRestaurantDailyBuzz(h.deps)
    expect(r.updated).toBe(1)
    expect((h.buzz()[0] as { relevantCount: number }).relevantCount).toBe(1)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/restaurant-daily-buzz.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/jobs/restaurant-daily-buzz.ts
import { computeBuzz, pickThumbnail } from '../pipeline/buzz.js'
import { isRestaurantRelevant } from '../pipeline/restaurant-relevance.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export const PENDING_PER_DAY = 800

export interface RestaurantDailyBuzzDeps {
  store: Pick<
    RestaurantStore,
    'readRestaurants' | 'writeRestaurants' | 'readRestaurantBuzz' | 'writeRestaurantBuzz'
    | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: { search: (q: string, o?: object) => Promise<{ docs: BlogDoc[]; payload: unknown }> }
  now?: Date
}

export interface RestaurantDailyBuzzResult {
  updated: number
  failed: number
  dropped: number
  images: number
  active: number
  rotated: number
}

export async function runRestaurantDailyBuzz(
  deps: RestaurantDailyBuzzDeps,
  opts: { limit?: number; pendingPerDay?: number } = {},
): Promise<RestaurantDailyBuzzResult> {
  const { store, blog, now = new Date() } = deps
  const restaurants = await store.readRestaurants()
  const rows = await store.readRestaurantBuzz()

  const active = restaurants.filter((r) => r.status === 'active')
  const measuredAt = new Map(rows.map((r) => [r.kakaoPlaceId, r.capturedAt]))
  const pending = restaurants
    .filter((r) => r.status === 'pending_extraction')
    .sort((a, b) => {
      const x = measuredAt.get(a.kakaoPlaceId) ?? ''
      const y = measuredAt.get(b.kakaoPlaceId) ?? ''
      if (x !== y) return x.localeCompare(y)
      const da = a.driveMinutes ?? a.driveMinutesEst ?? Number.POSITIVE_INFINITY
      const db = b.driveMinutes ?? b.driveMinutesEst ?? Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return a.kakaoPlaceId.localeCompare(b.kakaoPlaceId)
    })
    .slice(0, opts.pendingPerDay ?? PENDING_PER_DAY)

  const targets = [...active, ...pending].slice(0, opts.limit ?? Infinity)
  const activeTargets = targets.filter((r) => r.status === 'active').length
  const capturedAt = now.toISOString().slice(0, 10)
  let updated = 0
  let failed = 0
  let images = 0

  for (const r of targets) {
    try {
      const query = `${r.sigungu} ${r.name}`
      const res = await blog.search(query, { size: 50, sort: 'recency' })
      await store.appendRaw('kakao-blog-restaurant', query, res.payload, now)

      const m = computeBuzz({
        docs: res.docs, cafeName: r.name, now, isRelevant: isRestaurantRelevant,
      })
      const snap: BuzzSnapshot = { kakaoPlaceId: r.kakaoPlaceId, capturedAt, ...m }
      const i = rows.findIndex(
        (row) => row.kakaoPlaceId === r.kakaoPlaceId && row.capturedAt === capturedAt,
      )
      if (i >= 0) rows[i] = snap
      else rows.push(snap)
      updated++

      const thumb = pickThumbnail({
        docs: res.docs, cafeName: r.name, isRelevant: isRestaurantRelevant,
      })
      if (thumb && thumb !== r.imageUrl) {
        r.imageUrl = thumb
        images++
      }
    } catch (e) {
      failed++
      await recordFailure(store, 'kakao-blog-restaurant', e, now)
    }
  }

  const latest = new Map<string, BuzzSnapshot>()
  for (const row of rows) {
    const prev = latest.get(row.kakaoPlaceId)
    if (!prev || row.capturedAt > prev.capturedAt) latest.set(row.kakaoPlaceId, row)
  }
  const kept = [...latest.values()]
  const dropped = rows.length - kept.length

  await store.writeRestaurantBuzz(kept)
  if (images > 0) await store.writeRestaurants(restaurants)
  if (updated > 0) await recordSuccess(store, 'kakao-blog-restaurant', now)
  return {
    updated, failed, dropped, images,
    active: activeTargets, rotated: targets.length - activeTargets,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/jobs/restaurant-daily-buzz.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/jobs/restaurant-daily-buzz.ts tests/jobs/restaurant-daily-buzz.test.ts
git commit -m "feat(restaurant): 일일 화제량 잡"
```

---

### Task 11: 판정 잡 (classify)

**Files:**
- Create: `src/jobs/restaurant-classify.ts`
- Test: `tests/jobs/restaurant-classify.test.ts`

**Interfaces:**
- Consumes: `passesLayer2` (`pipeline/buzz.js`, 무변경 재사용), `extractRestaurantAttributes`
  (Task 8), `assignRestaurantTags` (Task 4), `passesHardGate` (`pipeline/gate.js`,
  **무변경 재사용**), `RestaurantStore` (Task 2)
- Produces: `runRestaurantClassify(deps, opts)`, `orderPendingRestaurants(...)`

`jobs/classify.ts` 전체(246줄)를 그대로 복사해 `Cafe`→`Restaurant`,
`assignTags`→`assignRestaurantTags`, `extractAttributes`→`extractRestaurantAttributes`,
`store.readCafes/writeCafes`→`readRestaurants/writeRestaurants`, health 소스 이름
`'classify'`→`'classify-restaurant'` 로 바꾼다. **`passesLayer2` 와 `passesHardGate`
는 import 출처를 그대로 카페 파이프라인(`pipeline/buzz.js`, `pipeline/gate.js`)에
둔다** — 둘 다 이미 범용이라 복사할 이유가 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/jobs/restaurant-classify.test.ts
import { describe, it, expect } from 'vitest'
import { runRestaurantClassify } from '../../src/jobs/restaurant-classify.js'

function harness() {
  let restaurants = [{
    kakaoPlaceId: '1', name: '소문난식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
    firstSeenAt: '2026-09-01T00:00:00.000Z', status: 'pending_extraction' as const,
    ambiguousName: false, attributes: null, tags: [],
  }]
  let health: unknown[] = []
  const deps = {
    store: {
      readRestaurants: async () => restaurants,
      writeRestaurants: async (r: typeof restaurants) => { restaurants = r },
      readRestaurantBuzz: async () => [{
        kakaoPlaceId: '1', capturedAt: '2026-09-01', receivedCount: 10, relevantCount: 8,
        precision: 0.8, spanDays: 20, postsPer30: 15, posts30d: 8, postsPrev: 4,
        firstPostDate: '2026-08-01', latestPostDate: '2026-08-30', acceleration: 1.5,
        suspectAmbiguous: false,
      }] as never,
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    llm: {
      modelVersion: 'fake-1',
      extract: async () => ({
        cuisineType: '한식', evidence: 'e', parkingGrade: 'A' as const, parkingEvidence: 'p',
        hasRoom: true, reservable: true, viewStrength: 0, viewTypes: [],
        outdoorSeating: null, teenAppeal: 3, confidence: 0.8,
      }),
    } as never,
    now: new Date('2026-09-01'),
  }
  return { deps, restaurants: () => restaurants }
}

describe('runRestaurantClassify', () => {
  it('화제량 컷을 통과하면 판정해서 active 로 만든다', async () => {
    const h = harness()
    const r = await runRestaurantClassify(h.deps)
    expect(r.classified).toBe(1)
    expect(h.restaurants()[0]!.status).toBe('active')
    expect(h.restaurants()[0]!.tags).toContain('한식')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/restaurant-classify.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/jobs/restaurant-classify.ts
import { RESTAURANT_PROMPT_VERSION } from '../llm/prompts.js'
import { passesLayer2 } from '../pipeline/buzz.js'
import { extractRestaurantAttributes } from '../pipeline/restaurant-extract.js'
import { assignRestaurantTags } from '../pipeline/restaurant-tag.js'
import { passesHardGate } from '../pipeline/gate.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
import type { BuzzSnapshot } from '../schema.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { LlmClient } from '../llm/types.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export interface RestaurantClassifyDeps {
  store: Pick<
    RestaurantStore,
    'readRestaurants' | 'writeRestaurants' | 'readRestaurantBuzz' | 'appendRaw'
    | 'readHealth' | 'writeHealth'
  >
  blog: {
    search: (
      q: string, o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  llm: LlmClient
  now?: Date
}

export interface RestaurantClassifyResult {
  classified: number
  excluded: number
  skipped: number
  failed: number
  quotaExhausted: boolean
}

const QUOTA_GIVE_UP = 3
const FLUSH_EVERY = 20
const NEAR_SHARE = 0.3

export function isStaleRestaurantExtraction(r: Restaurant): boolean {
  return r.attributes !== null && !r.attributes.modelVersion.endsWith(`+${RESTAURANT_PROMPT_VERSION}`)
}

const driveOf = (r: Restaurant): number =>
  r.driveMinutes ?? r.driveMinutesEst ?? Number.POSITIVE_INFINITY

export function orderPendingRestaurants(
  pending: Restaurant[],
  latest: Map<string, BuzzSnapshot>,
  opts: { order: 'hot' | 'near' | 'file' | 'mixed'; limit?: number },
): Restaurant[] {
  const { order, limit } = opts
  if (order === 'file') return pending

  const rate = (r: Restaurant) => latest.get(r.kakaoPlaceId)?.postsPer30 ?? -1
  const byHot = [...pending].sort(
    (a, b) => rate(b) - rate(a) || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId),
  )
  if (order === 'hot') return byHot

  const byNear = [...pending].sort(
    (a, b) => driveOf(a) - driveOf(b) || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId),
  )
  if (order === 'near') return byNear

  if (!limit || limit >= pending.length) return byHot

  const nearQuota = Math.floor(limit * NEAR_SHARE)
  const picked = new Set<string>()
  const out: Restaurant[] = []
  for (const r of byNear) {
    if (out.length >= nearQuota) break
    picked.add(r.kakaoPlaceId)
    out.push(r)
  }
  for (const r of byHot) {
    if (picked.has(r.kakaoPlaceId)) continue
    out.push(r)
  }
  return out
}

export async function runRestaurantClassify(
  deps: RestaurantClassifyDeps,
  opts: { limit?: number; redoStale?: boolean; order?: 'hot' | 'near' | 'file' | 'mixed' } = {},
): Promise<RestaurantClassifyResult> {
  const { store, blog, llm, now = new Date() } = deps
  const restaurants = await store.readRestaurants()
  const buzz = await store.readRestaurantBuzz()

  const latest = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latest.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latest.set(b.kakaoPlaceId, b)
  }

  const stale = opts.redoStale ? restaurants.filter(isStaleRestaurantExtraction) : []
  const pending = restaurants.filter((r) => r.status === 'pending_extraction')
  const ordered = orderPendingRestaurants(pending, latest, {
    order: opts.order ?? 'mixed', limit: opts.limit,
  })
  const targets: Restaurant[] = [...stale, ...ordered].slice(0, opts.limit ?? Infinity)

  let classified = 0
  let excluded = 0
  let skipped = 0
  let failed = 0
  let quotaErrors = 0
  let quotaExhausted = false

  for (const [i, r] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeRestaurants(restaurants)
    try {
      const b = latest.get(r.kakaoPlaceId)
      if (!b) {
        skipped++
        continue
      }

      const l2 = passesLayer2(b, { now, driveMinutes: driveOf(r) })
      if (!l2.pass) {
        r.status = 'excluded_auto'
        r.excludeReason = l2.reason ?? 'Layer 2 탈락'
        excluded++
        continue
      }

      const parkingQuery = `${r.sigungu} ${r.name} 주차`
      const parkingRes = await blog.search(parkingQuery, { size: 10, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-parking-restaurant', parkingQuery, parkingRes.payload, now)

      const mainQuery = `${r.sigungu} ${r.name}`
      const mainRes = await blog.search(mainQuery, { size: 15, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-extract-restaurant', mainQuery, mainRes.payload, now)

      const attributes = await extractRestaurantAttributes({ llm, now }, {
        name: r.name, sigungu: r.sigungu, categoryName: r.categoryName ?? '',
        snippets: mainRes.docs.map((d) => `${d.title} ${d.contents}`),
        parkingSnippets: parkingRes.docs.map((d) => `${d.title} ${d.contents}`),
      })
      r.attributes = attributes
      r.tags = assignRestaurantTags(attributes)

      const gate = passesHardGate({ tags: r.tags, parkingGrade: attributes.parkingGrade })
      if (!gate.pass) {
        r.status = 'excluded_auto'
        r.excludeReason = gate.reason ?? 'Layer 5 탈락'
        excluded++
      } else {
        r.status = 'active'
        r.excludeReason = null
        classified++
      }
      quotaErrors = 0
    } catch (e) {
      failed++
      await recordFailure(store, 'classify-restaurant', e, now)
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

  await store.writeRestaurants(restaurants)
  if (classified + excluded > 0) await recordSuccess(store, 'classify-restaurant', now)
  return { classified, excluded, skipped, failed, quotaExhausted }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/jobs/restaurant-classify.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/jobs/restaurant-classify.ts tests/jobs/restaurant-classify.test.ts
git commit -m "feat(restaurant): 판정 잡 (Layer 2~5, 게이트는 gate.ts 재사용)"
```

---

### Task 12: 폐업 감지 · 실주행 시간 (얇은 복사)

**Files:**
- Create: `src/jobs/restaurant-liveness.ts`
- Create: `src/jobs/restaurant-drive-times.ts`
- Test: `tests/jobs/restaurant-liveness.test.ts`
- Test: `tests/jobs/restaurant-drive-times.test.ts`

**Interfaces:**
- Consumes: `placeQuery` (`pipeline/place-query.js`, 무변경), `RestaurantStore` (Task 2)
- Produces: `runRestaurantLiveness(deps, opts)`, `RESTAURANT_LIVENESS_SOURCE`,
  `staleRestaurants(...)`, `runRestaurantDriveTimes(deps, opts)`,
  `restaurantDriveMinutesOf(r)`

`jobs/liveness.ts`(전체)와 `jobs/drive-times.ts`(전체)를 그대로 복사해
`Cafe`→`Restaurant`, `store.readCafes/writeCafes`→`readRestaurants/writeRestaurants`,
소스 이름 `'kakao-local-liveness'`→`'kakao-local-liveness-restaurant'`,
`'kakao-directions'`→`'kakao-directions-restaurant'` 로 바꾼다.

- [ ] **Step 1: liveness 실패 테스트 작성**

```typescript
// tests/jobs/restaurant-liveness.test.ts
import { describe, it, expect } from 'vitest'
import { runRestaurantLiveness } from '../../src/jobs/restaurant-liveness.js'

describe('runRestaurantLiveness', () => {
  it('찾은 식당은 확인 날짜를 새로 쓴다', async () => {
    const now = new Date('2026-09-01')
    let saved = [{
      kakaoPlaceId: '1', name: '소문난식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, attributes: null, tags: ['한식'],
    }]
    let health: unknown[] = []
    const deps = {
      store: {
        readRestaurants: async () => saved,
        writeRestaurants: async (r: typeof saved) => { saved = r },
        appendRaw: async () => 'p',
        readHealth: async () => health as never,
        writeHealth: async (r: unknown[]) => { health = r },
      },
      local: {
        searchKeyword: async () => ({ places: [{ id: '1' } as never], payload: {} }),
      },
      now,
    }
    const r = await runRestaurantLiveness(deps)
    expect(r.seen).toBe(1)
    expect(saved[0]!.lastSeenAt).toBe(now.toISOString())
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/restaurant-liveness.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `restaurant-liveness.ts` 구현** (`jobs/liveness.ts` 전체를 그대로, 이름만 교체)

```typescript
// src/jobs/restaurant-liveness.ts
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'
import { placeQuery } from '../pipeline/place-query.js'
import { recordFailure, recordSuccess } from '../sources/health.js'

export const RESTAURANT_LIVENESS_SOURCE = 'kakao-local-liveness-restaurant'

export interface RestaurantLivenessDeps {
  store: Pick<RestaurantStore, 'readRestaurants' | 'writeRestaurants' | 'appendRaw'>
    & Pick<RestaurantStore, 'readHealth' | 'writeHealth'>
  local: { searchKeyword(query: string, page?: number): Promise<{ places: KakaoPlace[]; payload: unknown }> }
  now?: Date
}

export interface RestaurantLivenessResult {
  checked: number
  seen: number
  missing: number
  failed: number
  stale: { name: string; sigungu: string; days: number }[]
}

export const STALE_DAYS = 21

export function daysUnseen(r: Restaurant, now: Date): number | null {
  const at = r.lastSeenAt ?? null
  if (!at) return null
  return Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000)
}

export function staleRestaurants(rows: Restaurant[], now: Date, days = STALE_DAYS): Restaurant[] {
  return rows.filter((r) => {
    if (r.status !== 'active') return false
    const d = daysUnseen(r, now)
    return d !== null && d > days
  })
}

export async function runRestaurantLiveness(
  deps: RestaurantLivenessDeps,
  opts: { limit?: number } = {},
): Promise<RestaurantLivenessResult> {
  const { store, local, now = new Date() } = deps
  const restaurants = await store.readRestaurants()

  const targets = restaurants
    .filter((r) => r.status === 'active')
    .sort((a, b) => (a.lastSeenAt ?? '').localeCompare(b.lastSeenAt ?? ''))
    .slice(0, opts.limit ?? Infinity)

  let seen = 0
  let missing = 0
  let failed = 0

  for (const r of targets) {
    const query = placeQuery(r as never)
    try {
      const res = await local.searchKeyword(query, 1)
      await store.appendRaw(RESTAURANT_LIVENESS_SOURCE, query, res.payload, now)
      if (res.places.some((p) => p.id === r.kakaoPlaceId)) {
        r.lastSeenAt = now.toISOString()
        seen++
      } else {
        missing++
      }
    } catch (e) {
      failed++
      await recordFailure(store, RESTAURANT_LIVENESS_SOURCE, e, now)
    }
  }

  await store.writeRestaurants(restaurants)
  if (seen > 0) await recordSuccess(store, RESTAURANT_LIVENESS_SOURCE, now)

  return {
    checked: targets.length, seen, missing, failed,
    stale: staleRestaurants(restaurants, now).map((r) => ({
      name: r.name, sigungu: r.sigungu, days: daysUnseen(r, now) ?? 0,
    })),
  }
}
```

- [ ] **Step 4: liveness 테스트 통과 확인**

Run: `npx vitest run tests/jobs/restaurant-liveness.test.ts`
Expected: PASS

- [ ] **Step 5: drive-times 실패 테스트 작성**

```typescript
// tests/jobs/restaurant-drive-times.test.ts
import { describe, it, expect } from 'vitest'
import { runRestaurantDriveTimes } from '../../src/jobs/restaurant-drive-times.js'

describe('runRestaurantDriveTimes', () => {
  it('driveMinutes 가 없는 곳만 잰다', async () => {
    let saved = [{
      kakaoPlaceId: '1', name: '소문난식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, attributes: null, tags: ['한식'],
    }]
    let health: unknown[] = []
    const deps = {
      store: {
        readRestaurants: async () => saved,
        writeRestaurants: async (r: typeof saved) => { saved = r },
        appendRaw: async () => 'p',
        readHealth: async () => health as never,
        writeHealth: async (r: unknown[]) => { health = r },
      },
      directions: {
        route: async () => ({ route: { minutes: 20, km: 8, tollWon: 0 }, payload: {} }),
      },
      now: new Date('2026-09-01'),
    }
    const r = await runRestaurantDriveTimes(deps)
    expect(r.measured).toBe(1)
    expect(saved[0]!.driveMinutes).toBe(20)
  })
})
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/restaurant-drive-times.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 7: `restaurant-drive-times.ts` 구현** (`jobs/drive-times.ts` 전체를 그대로, 이름만 교체)

```typescript
// src/jobs/restaurant-drive-times.ts
import { HOME } from '../pipeline/geo.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { Coord, Route } from '../sources/kakao-directions.js'
import type { Restaurant } from '../restaurant-schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export interface RestaurantDriveDeps {
  store: Pick<RestaurantStore, 'readRestaurants' | 'writeRestaurants' | 'appendRaw'>
    & Pick<RestaurantStore, 'readHealth' | 'writeHealth'>
  directions: { route: (o: Coord, d: Coord) => Promise<{ route: Route | null; payload: unknown }> }
  now?: Date
}

export interface RestaurantDriveResult {
  measured: number
  unroutable: number
  failed: number
}

const FLUSH_EVERY = 25
const RESTAURANT_DIRECTIONS_SOURCE = 'kakao-directions-restaurant'

export async function runRestaurantDriveTimes(
  deps: RestaurantDriveDeps,
  opts: { limit?: number; force?: boolean } = {},
): Promise<RestaurantDriveResult> {
  const { store, directions, now = new Date() } = deps
  const restaurants = await store.readRestaurants()

  const targets = restaurants
    .filter((r) => r.status === 'active')
    .filter((r) => opts.force || r.driveMinutes == null)
    .slice(0, opts.limit ?? Infinity)

  let measured = 0
  let unroutable = 0
  let failed = 0

  for (const [i, r] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeRestaurants(restaurants)
    try {
      const { route, payload } = await directions.route(HOME, { lat: r.lat, lng: r.lng })
      await store.appendRaw(RESTAURANT_DIRECTIONS_SOURCE, `${r.sigungu} ${r.name}`, payload, now)
      if (!route) {
        unroutable++
        continue
      }
      r.driveMinutes = route.minutes
      r.driveKm = route.km
      r.tollWon = route.tollWon
      measured++
    } catch (e) {
      failed++
      await recordFailure(store, RESTAURANT_DIRECTIONS_SOURCE, e, now)
    }
  }

  await store.writeRestaurants(restaurants)
  if (measured > 0) await recordSuccess(store, RESTAURANT_DIRECTIONS_SOURCE, now)
  return { measured, unroutable, failed }
}

export function restaurantDriveMinutesOf(
  r: Pick<Restaurant, 'driveMinutes' | 'driveMinutesEst'>,
): number | null {
  return r.driveMinutes ?? r.driveMinutesEst ?? null
}
```

- [ ] **Step 8: drive-times 테스트 통과 확인**

Run: `npx vitest run tests/jobs/restaurant-drive-times.test.ts`
Expected: PASS

- [ ] **Step 9: watch 감시에 새 소스 등록**

`src/jobs/usage-watch.ts` 의 `WEEKLY_SOURCES` 에 이 태스크와 Task 9·10·11 에서
만든 소스 이름을 전부 더한다 (이미 Task "liveness watch" 작업에서
`LIVENESS_SOURCE` 를 이 배열에 더했던 것과 같은 패턴).

```typescript
// src/jobs/usage-watch.ts 의 WEEKLY_SOURCES 를:
const WEEKLY_SOURCES = ['kakao-local', 'kakao-directions', 'harvest', LIVENESS_SOURCE] as const
// 다음으로 바꾼다:
const WEEKLY_SOURCES = [
  'kakao-local', 'kakao-directions', 'harvest', LIVENESS_SOURCE,
  'kakao-local-restaurant', 'kakao-directions-restaurant', 'harvest-restaurant',
  RESTAURANT_LIVENESS_SOURCE,
] as const
```

`DAILY_SOURCES` 에도 식당 화제량·판정 소스를 더한다:

```typescript
// DAILY_SOURCES 를:
const DAILY_SOURCES = ['kakao-blog', 'classify'] as const
// 다음으로 바꾼다:
const DAILY_SOURCES = [
  'kakao-blog', 'classify', 'kakao-blog-restaurant', 'classify-restaurant',
] as const
```

파일 위쪽 import 에 `RESTAURANT_LIVENESS_SOURCE` 를 추가한다:
```typescript
import { RESTAURANT_LIVENESS_SOURCE } from './restaurant-liveness.js'
```

- [ ] **Step 10: 카페 회귀 확인**

Run: `npm test`
Expected: 43+ test files(카페) 전부 통과 — `usage-watch.test.ts` 의 기존 카페
케이스도 그대로 통과 (배열에 항목만 추가했으므로 카페 소스 판정 로직은 안 바뀜)

- [ ] **Step 11: 커밋**

```bash
git add src/jobs/restaurant-liveness.ts src/jobs/restaurant-drive-times.ts \
  src/jobs/usage-watch.ts tests/jobs/restaurant-liveness.test.ts \
  tests/jobs/restaurant-drive-times.test.ts
git commit -m "feat(restaurant): 폐업 감지·실주행 시간 (얇은 복사) + watch 감시 등록"
```

---

### Task 13: 주간 추천 잡 (suggest)

**Files:**
- Create: `src/jobs/restaurant-suggest.ts`
- Test: `tests/jobs/restaurant-suggest.test.ts`

**Interfaces:**
- Consumes: `hotScore`, `pickWeekendCandidates` (`pipeline/score.js`, 무변경 재사용),
  `restaurantFamilyFit` (Task 6), `passesGate` (`pipeline/gate.js`, 무변경 재사용),
  `restaurantDriveMinutesOf` (Task 12), `RestaurantStore` (Task 2)
- Produces: `runRestaurantWeeklySuggest(deps, opts)`

`jobs/weekly-suggest.ts` 전체(107줄)를 그대로 복사해 `familyFit`→
`restaurantFamilyFit`(Task 6), `driveMinutesOf`→`restaurantDriveMinutesOf`(Task 12),
`store.readCafes`→`readRestaurants`, `store.readSuggestions/writeSuggestions`→
`readRestaurantSuggestions/writeRestaurantSuggestions` 로 바꾼다. `familyFit` 호출의
`menuLevel: a.menuLevel` 자리를 `hasRoom: a.hasRoom, reservable: a.reservable` 로
바꾼다. **`hotScore`·`passesGate`·`pickWeekendCandidates`·`mondayOf` 는 무변경
재사용** — 전부 이미 도메인 무관.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/jobs/restaurant-suggest.test.ts
import { describe, it, expect } from 'vitest'
import { runRestaurantWeeklySuggest } from '../../src/jobs/restaurant-suggest.js'

describe('runRestaurantWeeklySuggest', () => {
  it('게이트를 통과한 active 식당을 점수순으로 뽑는다', async () => {
    const now = new Date('2026-09-01')
    const restaurants = [{
      kakaoPlaceId: '1', name: '소문난식당', sigungu: '부평구', lat: 37.5, lng: 126.7,
      driveMinutes: 20, firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, tags: ['한식'],
      attributes: {
        cuisineType: '한식' as const, evidence: 'e', parkingGrade: 'A' as const,
        parkingEvidence: 'p', hasRoom: true, reservable: true, viewStrength: 0,
        viewTypes: [], outdoorSeating: null, teenAppeal: 3, confidence: 0.8,
        extractedAt: '2026-08-01T00:00:00.000Z', modelVersion: 'test',
      },
    }]
    const buzz = [{
      kakaoPlaceId: '1', capturedAt: '2026-08-30', receivedCount: 10, relevantCount: 8,
      precision: 0.8, spanDays: 20, postsPer30: 15, posts30d: 8, postsPrev: 4,
      firstPostDate: '2026-08-01', latestPostDate: '2026-08-30', acceleration: 1.5,
      suspectAmbiguous: false,
    }]
    const deps = {
      store: {
        readRestaurants: async () => restaurants,
        readRestaurantBuzz: async () => buzz,
        readVisits: async () => [],
        readRestaurantSuggestions: async () => [],
        writeRestaurantSuggestions: async () => {},
      },
      now,
    }
    const { picked } = await runRestaurantWeeklySuggest(deps as never)
    expect(picked).toHaveLength(1)
    expect(picked[0]!.kakaoPlaceId).toBe('1')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/restaurant-suggest.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/jobs/restaurant-suggest.ts
import { hotScore, pickWeekendCandidates } from '../pipeline/score.js'
import { restaurantFamilyFit } from '../pipeline/restaurant-score.js'
import { passesGate } from '../pipeline/gate.js'
import { restaurantDriveMinutesOf } from './restaurant-drive-times.js'
import { mondayOf } from './weekly-suggest.js'
import type { BuzzSnapshot, Suggestion } from '../schema.js'
import type { RestaurantStore } from '../store/restaurant-json-store.js'

export interface RestaurantSuggestDeps {
  store: Pick<
    RestaurantStore,
    'readRestaurants' | 'readRestaurantBuzz' | 'readRestaurantSuggestions'
    | 'writeRestaurantSuggestions'
  >
  now?: Date
}

const KEEP_WEEKS = 12
const DEFAULT_COUNT = 20

export async function runRestaurantWeeklySuggest(
  deps: RestaurantSuggestDeps,
  opts: { count?: number; cityMode?: boolean } = {},
): Promise<{ picked: Suggestion[] }> {
  const { store, now = new Date() } = deps
  const count = opts.count ?? DEFAULT_COUNT
  const restaurants = await store.readRestaurants()
  const buzz = await store.readRestaurantBuzz()

  const latestBuzz = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latestBuzz.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latestBuzz.set(b.kakaoPlaceId, b)
  }

  const scored = restaurants.flatMap((r) => {
    if (r.status !== 'active') return []
    const a = r.attributes
    if (!a) return []
    if (!passesGate({ tags: r.tags, parkingGrade: a.parkingGrade }, opts).pass) return []
    const b = latestBuzz.get(r.kakaoPlaceId)
    if (!b) return []

    const hot = hotScore(b, now)
    const fit = restaurantFamilyFit(
      {
        driveMinutes: restaurantDriveMinutesOf(r) ?? 90,
        parkingGrade: a.parkingGrade,
        hasRoom: a.hasRoom,
        reservable: a.reservable,
        lastVisitedOn: null,
        outdoorOnly: Boolean(a.outdoorSeating),
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    return [{
      id: r.kakaoPlaceId, score: hot * fit, tags: r.tags, region: r.sigungu, hot, fit,
    }]
  })

  const picked = pickWeekendCandidates(scored, count)
  const weekOf = mondayOf(now)
  const rows: Suggestion[] = picked.map((p, i) => ({
    weekOf, kakaoPlaceId: p.id, rank: i + 1, finalScore: Number(p.score.toFixed(3)),
    reason: { hot: Number(p.hot.toFixed(1)), fit: Number(p.fit.toFixed(3)), tags: p.tags },
  }))

  const prev = await store.readRestaurantSuggestions()
  const kept = prev.filter((s) => s.weekOf !== weekOf).slice(-(KEEP_WEEKS * count))
  await store.writeRestaurantSuggestions([...kept, ...rows])
  return { picked: rows }
}
```

**참고**: `mondayOf` 를 `jobs/weekly-suggest.js` 에서 그대로 import 한다 (순수
날짜 함수라 도메인 무관 — export 되어 있는지 확인, 없으면 export 만 추가하는
한 줄 변경으로 충분하다).

- [ ] **Step 4: `mondayOf` export 확인**

`src/jobs/weekly-suggest.ts:16` 을 확인한다 — 이미 `export function mondayOf`
로 선언돼 있으면 이 스텝은 건너뛴다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/jobs/restaurant-suggest.test.ts`
Expected: PASS

- [ ] **Step 6: 카페 회귀 전량 확인**

Run: `npm test`
Expected: 카페 테스트 전부 통과

- [ ] **Step 7: 커밋**

```bash
git add src/jobs/restaurant-suggest.ts tests/jobs/restaurant-suggest.test.ts
git commit -m "feat(restaurant): 주간 추천 잡 (게이트·hotScore 는 재사용)"
```

---

### Task 14: CLI 연결

**Files:**
- Modify: `src/cli/run.ts` (파일 끝 `switch` 문에 새 `case` 만 추가)

**Interfaces:**
- Consumes: Task 9~13 의 모든 `run*` 함수
- Produces: `npm run restaurant-discover`, `restaurant-buzz`, `restaurant-classify`,
  `restaurant-suggest`, `restaurant-liveness`, `restaurant-drive` CLI 명령

기존 `case 'discover'`(`cli/run.ts:94`쯤) 등의 코드 모양을 그대로 따라 새 케이스를
추가한다. **기존 케이스는 한 글자도 안 건드린다.**

- [ ] **Step 1: 새 케이스 추가**

`src/cli/run.ts` 의 기존 `case 'liveness':`/`case 'drive':` 옆에, 같은 `createContext()`
패턴으로 새 케이스를 추가한다 (정확한 삽입 위치는 기존 switch 문 끝, `default:`
바로 앞):

```typescript
case 'restaurant-discover': {
  const ctx = createContext()
  const regions = REGIONS.filter((r) => !r.excluded)
  const skipHarvest = flag(rest, 'skip-harvest') !== undefined
  console.log(`식당 발굴 시작 (${regions.length}개 지역)`)
  const r = await runRestaurantDiscover(ctx, { regions, skipHarvest })
  console.log(`  발굴 ${r.discovered}곳 · 제외 ${r.excluded}곳 · 동명지역 ${r.offRegion}곳`)
  break
}

case 'restaurant-buzz': {
  const ctx = createContext()
  const limit = numFlag(rest, 'limit')
  const r = await runRestaurantDailyBuzz(ctx, { limit })
  console.log(`  갱신 ${r.updated}곳 · 실패 ${r.failed}곳 · 이미지 ${r.images}곳`)
  break
}

case 'restaurant-classify': {
  const ctx = createContext()
  const limit = numFlag(rest, 'limit')
  const redoStale = flag(rest, 'redo') !== undefined
  const r = await runRestaurantClassify(ctx, { limit, redoStale })
  console.log(`  판정 ${r.classified}곳 · 제외 ${r.excluded}곳 · 실패 ${r.failed}곳`)
  if (r.quotaExhausted) console.log('  쿼터 소진으로 중단')
  break
}

case 'restaurant-suggest': {
  const ctx = createContext()
  const r = await runRestaurantWeeklySuggest(ctx)
  console.log(`  후보 ${r.picked.length}곳 선정`)
  break
}

case 'restaurant-liveness': {
  const ctx = createContext()
  const limit = numFlag(rest, 'limit')
  const r = await runRestaurantLiveness(ctx, { limit })
  console.log(`  확인 ${r.checked}곳 · 있음 ${r.seen} · 못 찾음 ${r.missing}`)
  if (r.stale.length) {
    console.log(`  폐업 의심 ${r.stale.length}곳:`)
    for (const s of r.stale.slice(0, 20)) console.log(`    ${s.sigungu} ${s.name} (${s.days}일)`)
  }
  break
}

case 'restaurant-drive': {
  const ctx = createContext()
  const limit = numFlag(rest, 'limit')
  const force = flag(rest, 'force') !== undefined
  const r = await runRestaurantDriveTimes(ctx, { limit, force })
  console.log(`  측정 ${r.measured}곳 / 경로없음 ${r.unroutable}곳`)
  break
}
```

파일 위쪽 import 목록에 다음을 추가한다:

```typescript
import { runRestaurantDiscover } from '../jobs/restaurant-discover.js'
import { runRestaurantDailyBuzz } from '../jobs/restaurant-daily-buzz.js'
import { runRestaurantClassify } from '../jobs/restaurant-classify.js'
import { runRestaurantWeeklySuggest } from '../jobs/restaurant-suggest.js'
import { runRestaurantLiveness } from '../jobs/restaurant-liveness.js'
import { runRestaurantDriveTimes } from '../jobs/restaurant-drive-times.js'
```

**`createContext()` 참고**: 이 함수가 지금 카페 전용 `Store`(`createJsonStore`)를
반환한다면, 식당 케이스에서는 `createRestaurantJsonStore(DATA_DIR)` 로 만든 별도
컨텍스트 객체(`{ store: createRestaurantJsonStore(dataDir), local, blog, llm, now }`)
를 그 자리에서 조립해 넘긴다 — `createContext()` 자체는 안 건드린다.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 카페 회귀 확인**

Run: `npm test`
Expected: 전부 통과

- [ ] **Step 4: `package.json` 에 npm 스크립트 추가**

```json
"restaurant-discover": "tsx --env-file-if-exists=.env src/cli/run.ts restaurant-discover",
"restaurant-buzz": "tsx --env-file-if-exists=.env src/cli/run.ts restaurant-buzz",
"restaurant-classify": "tsx --env-file-if-exists=.env src/cli/run.ts restaurant-classify",
"restaurant-suggest": "tsx --env-file-if-exists=.env src/cli/run.ts restaurant-suggest",
"restaurant-liveness": "tsx --env-file-if-exists=.env src/cli/run.ts restaurant-liveness",
"restaurant-drive": "tsx --env-file-if-exists=.env src/cli/run.ts restaurant-drive"
```

- [ ] **Step 5: 파일럿 지역으로 실제 실행 (수동 확인)**

Run: `npm run restaurant-discover -- --limit 1` (테스트 삼아 1지역만 — 실제
API 키 필요, 로컬 `.env` 에 이미 있음)
Expected: `data/restaurants.json` 생성, 콘솔에 발굴 수 출력. 에러 없이 끝나면
성공.

- [ ] **Step 6: 커밋**

```bash
git add src/cli/run.ts package.json
git commit -m "feat(restaurant): CLI 명령 6종 연결"
```

---

### Task 15: GitHub Actions 워크플로 + 파일럿 지역

**Files:**
- Create: `.github/workflows/daily-buzz-restaurant.yml`
- Create: `.github/workflows/daily-classify-restaurant.yml`
- Create: `.github/workflows/weekly-discover-restaurant.yml`
- Create: `.github/workflows/weekly-drive-restaurant.yml`
- Create: `.github/workflows/weekly-liveness-restaurant.yml`
- Create: `.github/workflows/weekly-suggest-restaurant.yml`

**Interfaces:**
- Consumes: Task 14 의 npm 스크립트

기존 카페 워크플로(`weekly-discover.yml`, `weekly-liveness.yml` 등)를 그대로
복사해 다음만 바꾼다: `name`, `run: npm run discover`→`npm run restaurant-discover`,
**`concurrency.group`을 `data-write`→`restaurant-data-write` 로 바꾼다** (설계
문서 4절 — 다른 파일에 쓰므로 카페 잡과 안 겹치게), 크론 시각은 카페 잡과
30분 이상 띄운다 (같은 `data-write` 그룹이 아니어도, 같은 시각에 두 워크플로가
`npm ci` 를 동시에 돌리면 GitHub Actions 동시 실행 한도에 걸릴 수 있다).

처음엔 **파일럿 지역만** 스캔한다. `weekly-discover-restaurant.yml` 의 실행 스텝을:

```yaml
- run: npm run restaurant-discover -- --pilot
```

로 두고, `src/cli/run.ts` 의 `restaurant-discover` 케이스에 `--pilot` 플래그를
받으면 `REGIONS.filter(...)` 대신 아래처럼 좁힌 지역 목록을 쓰게 한다 (Task 14 의
Step 1 코드에 이 분기를 더한다):

```typescript
const PILOT_SIGUNGU = ['부평구', '계양구', '서구', '김포시', '검단']
const regions = flag(rest, 'pilot') !== undefined
  ? REGIONS.filter((r) => !r.excluded && PILOT_SIGUNGU.includes(r.sigungu))
  : REGIONS.filter((r) => !r.excluded)
```

- [ ] **Step 1: 워크플로 6개 작성** (카페 쪽 대응 파일을 열어 그대로 복사 후 위 규칙대로 치환)

각 워크플로 파일은 대응하는 카페 워크플로(`daily-buzz.yml`,
`daily-classify.yml`, `weekly-discover.yml`, `weekly-drive.yml`,
`weekly-liveness.yml`, `weekly-suggest.yml`)를 열어 `name`·`run`·
`concurrency.group`·크론 시각만 바꿔 그대로 옮긴다. `commit-data.sh` 호출은
새 커밋 메시지 인자만 다르게 준다 (예: `"식당 실존 확인"`). `commit-data.sh`
자체는 `web/src/generated` 를 다시 만드는 스텝(`npm run --silent site`)이 있는데,
**식당은 이 스크립트를 쓰지 않는다** — 대신 각 워크플로 마지막 스텝을 직접
`git add data/ && git commit -m "..." && git push` 로 적는다 (2단계 전까지는
`web/src/generated/site.json` 재생성이 필요 없다).

- [ ] **Step 2: 로컬에서 워크플로 문법 확인**

Run: `cat .github/workflows/weekly-discover-restaurant.yml` 로 육안 확인 —
YAML 문법 오류가 없는지, `concurrency.group`이 `restaurant-data-write`인지 확인.
(실제 실행은 GitHub Actions 에서 스케줄대로 돌 때 확인된다 — 로컬에서 돌릴
수단이 없다.)

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/*-restaurant.yml src/cli/run.ts
git commit -m "feat(restaurant): GitHub Actions 워크플로 6종 (파일럿 지역, 별도 동시성 그룹)"
```

- [ ] **Step 4: 푸시 전 최종 회귀 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 카페 테스트 전부 통과, 타입 에러 없음. 이게 이 계획 전체의 마지막
안전장치다 — 여기서 하나라도 깨지면 푸시하지 않는다.

- [ ] **Step 5: 사용자 확인 후 푸시**

여기서 멈춘다. 사용자에게 "파일럿 지역(부평구·계양구·서구·김포시·검단) 워크플로가
준비됐다, 수동 실행(`workflow_dispatch`)으로 한 번 테스트해볼지, 아니면 예약
스케줄이 도는 걸 기다릴지" 확인한 뒤 푸시한다.

---

## Self-Review 메모 (계획 작성자 기록)

- **스펙 커버리지**: 설계 문서 2절(카페와 다른 점 표)의 5개 항목 전부 태스크로
  매핑됨 (검색어→Task 3, 관련성→Task 3, 제외목록→Task 3, 분류축→Task 4·6,
  프롬프트→Task 7). 3절(데이터 구조)→Task 1·2. 4절(실행 방식)→Task 14·15.
  5절(테스트)→전 태스크에 내장. 6절(범위 밖)은 이 계획에 태스크 없음(의도됨).
- **"카페 영향 0" 검증 지점**: Task 5(buzz.ts)·Task 6 Step 1-2(score.ts export)·
  Task 12 Step 10(usage-watch.ts) — 셋 다 카페 파일을 만지는 유일한 지점이고,
  각각 직후에 `npm test` 전량 통과를 스텝으로 못박아 뒀다.
- **타입 일관성**: `RestaurantStore` 의 메서드 이름(`readRestaurants` 등)이
  Task 2에서 정의된 대로 Task 9~13 전체에서 동일하게 쓰였는지 재확인 완료.
