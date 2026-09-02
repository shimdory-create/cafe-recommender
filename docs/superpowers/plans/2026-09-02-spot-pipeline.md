# 가볼 곳 추천 파이프라인 (1단계: 데이터만) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카페·식당 파이프라인과 나란히 도는 가볼 곳(spot) 데이터 파이프라인을
만든다. 화면에는 아직 아무것도 안 보인다 — 산출물은 `data/spots.json` 등
새 데이터 파일뿐이다.

**Architecture:** 지역·거리·화제량 수식·게이트·폐업 감지 같은 도메인 무관
로직은 카페·식당이 이미 쓰는 그대로 import 해 쓴다 (`pipeline/gate.ts`의
`passesHardGate`/`passesGate`, `pipeline/buzz.ts`의 `computeBuzz`/`pickThumbnail`
— 둘 다 식당을 만들 때 이미 `isRelevant` 주입 인자를 받도록 가산적으로
바뀌어 있어 이번엔 손댈 필요가 없다. `pipeline/score.ts`의 `PARKING_MULT`도
이미 export 되어 있다). 검색어·관련성 판별·태그·LLM 프롬프트 네 곳만 가볼
곳판을 새로 쓴다. 태그는 식당의 단일값(`cuisineType`)과 달리 카페처럼
**다중 선택**이다 — LLM이 후보 10개 중 해당하는 것을 배열로 직접 골라
낸다. 저장소를 직접 읽고 쓰는 잡(liveness·drive-times)은 카페·식당 코드를
전혀 건드리지 않기 위해 얇게 복사한다. **블랙리스트·제외 목록은 1차에
없다** (설계 문서 7절) — 그만큼 식당 계획의 Task 3(제외 목록)·별도
exclude.ts가 이번엔 통째로 빠진다.

**Tech Stack:** TypeScript, Node, Zod, Vitest — 기존 카페·식당 파이프라인과 동일.

**Spec:** [docs/superpowers/specs/2026-09-02-spot-pipeline-design.md](../specs/2026-09-02-spot-pipeline-design.md)

## Global Constraints

- **카페·식당 파이프라인 파일은 이번 계획에서 한 글자도 수정하지 않는다.**
  `computeBuzz`/`pickThumbnail`의 `isRelevant` 인자, `score.ts`의
  `PARKING_MULT` export는 식당 파이프라인 때 이미 가산적으로 끝나 있으므로
  그대로 가져다 쓰기만 한다. 기존 전체 테스트(`npm test`)는 이 계획의 모든
  태스크가 끝난 뒤에도 100% 그대로 통과해야 한다 — 이것이 "카페·식당 영향
  0"의 실측 증거다.
- 검색어는 항상 `"{시도} {시군구} {키워드}"` 형태로 조합한다 (동명 시군구
  문제, 카페·식당 파이프라인과 동일한 이유).
- 새 파일은 기존 파일과 같은 스타일을 따른다 — 순수 함수는 `pipeline/`,
  저장소를 만지는 잡은 `jobs/`, 정적 목록은 `config/`.
- `data/spots.json`, `data/spot-buzz.json`, `data/spot-suggestions.json`이 새
  파일이다. `data/cafes.json`, `data/restaurants.json` 등 기존 파일은
  건드리지 않는다. `data/health.json`, `data/raw/`는 카페·식당과 **공유한다**
  (health는 소스 이름으로만 구분되므로 이미 범용, watch 감시가 가볼 곳
  소스도 같은 틀로 보게 하려면 같은 파일에 있어야 한다).
- 가볼 곳 태그는 **다중 선택**이다 — `assignSpotTags`가 반환하는 배열 길이가
  0이면(=분류 실패) `passesHardGate`가 그대로 배제한다. 식당의 단일값
  `cuisineType`처럼 하나만 고르게 강제하지 않는다.
- 블랙리스트·제외 목록(franchise/category 배제)은 이번 계획에 없다 — 발굴된
  장소는 지역 밖(`belongsToRegion` 탈락)이 아닌 한 전부 `pending_extraction`
  으로 들어간다. 필요해지면 이후 별도 태스크로 추가한다(설계 문서 7절).

---

### Task 1: 가볼 곳 스키마

**Files:**
- Create: `src/spot-schema.ts`
- Test: `tests/spot-schema.test.ts`

**Interfaces:**
- Produces: `SPOT_TAGS`, `SpotTag`(타입), `SpotSchema`, `Spot`(타입),
  `SpotAttributesSchema`, `SpotAttributes`(타입), `HealthSchema`/`Health`(카페
  스키마에서 재수출)

카페의 `CafeAttributesSchema`(`src/schema.ts:9-42`)와 식당의
`RestaurantAttributesSchema`(`src/restaurant-schema.ts:118-136`)를 참고해
같은 필드 이름 규칙을 따르되, 도메인 전용 축만 바꾼다: 단일값 `cuisineType`
자리에 다중값 `tags: SpotTag[]`, `hasRoom`/`reservable` 대신
`stayDuration`/`indoorOutdoor`/`season`.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/spot-schema.test.ts
import { describe, it, expect } from 'vitest'
import { SpotSchema, SpotAttributesSchema, SPOT_TAGS } from '../src/spot-schema.js'

describe('SPOT_TAGS', () => {
  it('10개다', () => {
    expect(SPOT_TAGS).toHaveLength(10)
  })
})

describe('SpotAttributesSchema', () => {
  const base = {
    tags: ['자연/공원'], evidence: 'e', parkingGrade: 'A', parkingEvidence: 'p',
    stayDuration: null, indoorOutdoor: null, season: null, teenAppeal: null,
    confidence: 0.5, extractedAt: '2026-09-02T00:00:00.000Z', modelVersion: 'test',
  }

  it('정해진 태그만 받는다', () => {
    expect(SpotAttributesSchema.safeParse(base).success).toBe(true)
    expect(SpotAttributesSchema.safeParse({ ...base, tags: ['아무거나'] }).success).toBe(false)
  })

  it('태그를 여러 개 동시에 가질 수 있다', () => {
    const multi = { ...base, tags: ['자연/공원', '아이와 가기 좋은 곳'] }
    expect(SpotAttributesSchema.safeParse(multi).success).toBe(true)
  })

  it('태그를 하나도 못 찾으면 빈 배열이다', () => {
    expect(SpotAttributesSchema.safeParse({ ...base, tags: [] }).success).toBe(true)
  })
})

describe('SpotSchema', () => {
  it('신규 발굴 최소 필드로 파싱된다', () => {
    const s = {
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'pending_extraction',
      ambiguousName: false, tags: [],
    }
    expect(SpotSchema.safeParse(s).success).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/spot-schema.test.ts`
Expected: FAIL — `src/spot-schema.ts` 모듈이 없다는 에러.

- [ ] **Step 3: 스키마 작성**

`src/schema.ts`의 `HealthSchema` import 구조를 그대로 따른다(health 타입은
카페 스키마 파일에서 그대로 재수출 — 새로 정의하면 `usage-watch.ts`가 보는
`Health` 타입이 갈라진다).

```typescript
// src/spot-schema.ts
import { z } from 'zod'
import { HealthSchema } from './schema.js'

export { HealthSchema }
export type { Health } from './schema.js'

/** 가볼 곳 성격 태그. 카페 성격 태그와 같은 이유로 여기서 늘리지 않는다(스펙 참고) */
export const SPOT_TAGS = [
  '자연/공원', '관광지/명소', '시장/전통거리', '쇼핑/아울렛', '전시/박물관',
  '소품샵/편집숍', '드라이브', '체험', '계절명소', '아이와 가기 좋은 곳',
] as const
export type SpotTag = (typeof SPOT_TAGS)[number]

export const SpotAttributesSchema = z.object({
  /** 다중 선택 — 카페 성격 태그와 같은 방식. 하나도 못 고르면 빈 배열 */
  tags: z.array(z.enum(SPOT_TAGS)),
  evidence: z.string(),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),
  parkingEvidence: z.string(),
  /** 자유 문구, 예: "1~2시간". 카페의 stayDuration 필드와 같은 형태 */
  stayDuration: z.string().nullable(),
  indoorOutdoor: z.enum(['indoor', 'outdoor', 'mixed']).nullable(),
  season: z.enum(['봄', '여름', '가을', '겨울', '사계절']).nullable(),
  teenAppeal: z.number().min(0).max(5).nullable(),
  confidence: z.number().min(0).max(1),
  extractedAt: z.string(),
  modelVersion: z.string().min(1),
})
export type SpotAttributes = z.infer<typeof SpotAttributesSchema>

export const SpotSchema = z.object({
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
  attributes: SpotAttributesSchema.nullable(),
  /** Layer 4 태그. attributes.tags 가 빈 배열이면 여기도 빈 배열 — "태그 0개 배제" 게이트 그대로 */
  tags: z.array(z.string()),
})
export type Spot = z.infer<typeof SpotSchema>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/spot-schema.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 기존 카페·식당 테스트 회귀 확인**

Run: `npm test`
Expected: 모든 기존 테스트 파일 그대로 통과 (새 파일 추가는 기존 스키마를
안 건드렸으므로 영향 없음)

- [ ] **Step 6: 커밋**

```bash
git add src/spot-schema.ts tests/spot-schema.test.ts
git commit -m "feat(spot): 가볼 곳 스키마 — 10개 다중선택 태그 · 체류시간·실내외·계절"
```

---

### Task 2: 가볼 곳 저장소

**Files:**
- Create: `src/store/spot-json-store.ts`
- Test: `tests/store/spot-json-store.test.ts`

**Interfaces:**
- Consumes: `SpotSchema`, `SpotAttributesSchema` (Task 1), `HealthSchema`
  (`spot-schema.ts`에서 재수출)
- Produces: `SpotStore` 인터페이스, `createSpotJsonStore(dataDir): SpotStore`

`src/store/restaurant-json-store.ts` 전체 구조를 그대로 따른다 (블랙리스트
관련 필드만 뺀다 — 이번 계획엔 블랙리스트가 없다).

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/store/spot-json-store.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSpotJsonStore } from '../../src/store/spot-json-store.js'

let dir: string

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('createSpotJsonStore', () => {
  it('쓴 뒤 읽으면 같은 내용이 온다', async () => {
    dir = await mkdtemp(join(tmpdir(), 'spot-store-'))
    const store = createSpotJsonStore(dir)
    expect(await store.readSpots()).toEqual([])
    const row = {
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'pending_extraction' as const,
      ambiguousName: false, attributes: null, tags: [],
    }
    await store.writeSpots([row])
    expect(await store.readSpots()).toEqual([row])
  })

  it('파일이 없으면 빈 배열이다 (카페·식당 저장소와 같은 동작)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'spot-store-'))
    const store = createSpotJsonStore(dir)
    expect(await store.readSpotBuzz()).toEqual([])
    expect(await store.readSpotSuggestions()).toEqual([])
    expect(await store.readHealth()).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/store/spot-json-store.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/store/spot-json-store.ts
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { SpotSchema, HealthSchema } from '../spot-schema.js'
import { BuzzSnapshotSchema, SuggestionSchema } from '../schema.js'
import type { Spot, Health } from '../spot-schema.js'
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

export interface SpotStore {
  readSpots(): Promise<Spot[]>
  writeSpots(rows: Spot[]): Promise<void>
  readSpotBuzz(): Promise<BuzzSnapshot[]>
  writeSpotBuzz(rows: BuzzSnapshot[]): Promise<void>
  readSpotSuggestions(): Promise<Suggestion[]>
  writeSpotSuggestions(rows: Suggestion[]): Promise<void>
  readHealth(): Promise<Health[]>
  writeHealth(rows: Health[]): Promise<void>
  appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
}

export function createSpotJsonStore(dataDir: string): SpotStore {
  return {
    readSpots: () => readArray(dataDir, 'spots.json', SpotSchema),
    writeSpots: (r) => writeArray(dataDir, 'spots.json', r),

    readSpotBuzz: () => readArray(dataDir, 'spot-buzz.json', BuzzSnapshotSchema),
    writeSpotBuzz: (r) => writeArray(dataDir, 'spot-buzz.json', r),

    readSpotSuggestions: () => readArray(dataDir, 'spot-suggestions.json', SuggestionSchema),
    writeSpotSuggestions: (r) => writeArray(dataDir, 'spot-suggestions.json', r),

    // health·raw 는 카페·식당과 같은 data/ 를 가리킨다 — 파일도 그대로 공유한다
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

Run: `npx vitest run tests/store/spot-json-store.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/store/spot-json-store.ts tests/store/spot-json-store.test.ts
git commit -m "feat(spot): 가볼 곳 전용 JSON 저장소 (health·raw 는 공유)"
```

---

### Task 3: 검색어·관련성 판별

**Files:**
- Create: `src/config/spot-keywords.ts`
- Create: `src/pipeline/spot-relevance.ts`
- Test: `tests/pipeline/spot-relevance.test.ts`

**Interfaces:**
- Produces: `SPOT_SEARCH_KEYWORDS`, `spotCurationQueries(regionLabel)`,
  `isSpotRelevant(doc, name)`, `isAmbiguousSpotName(name)`

`config/restaurant-keywords.ts`, `pipeline/restaurant-relevance.ts`를 그대로
구조를 따라 복사해 문맥어·검색어만 바꾼다. **이번 계획엔 별도
`spot-exclude.ts`가 없다** — 블랙리스트·제외 목록이 1차 범위 밖이기 때문
(Global Constraints 참고).

- [ ] **Step 1: 검색어 작성 (테스트 불필요 — 정적 목록)**

```typescript
// src/config/spot-keywords.ts
export const SPOT_SEARCH_KEYWORDS = [
  '관광명소', '공원', '전시관', '박물관', '테마파크', '체험학습장',
  '전통시장', '아울렛',
] as const

export function spotCurationQueries(regionLabel: string): string[] {
  return [
    `${regionLabel} 가볼만한곳`,
    `${regionLabel} 나들이 추천`,
    `${regionLabel} 아이와 가볼만한곳`,
  ]
}
```

- [ ] **Step 2: 관련성 판별 실패 테스트 작성**

```typescript
// tests/pipeline/spot-relevance.test.ts
import { describe, it, expect } from 'vitest'
import { isSpotRelevant } from '../../src/pipeline/spot-relevance.js'

const doc = (title: string, contents = '') => ({
  title, contents, dateTime: new Date(), thumbnail: '',
} as never)

describe('isSpotRelevant', () => {
  it('상호명 + 가볼 곳 문맥어가 있으면 관련 있다', () => {
    expect(isSpotRelevant(doc('부평 아무개공원 다녀왔어요 나들이'), '아무개공원')).toBe(true)
  })

  it('문맥어가 없으면 관련 없다 (상호명만으로는 부족)', () => {
    expect(isSpotRelevant(doc('아무개공원 근처 맛집'), '아무개공원')).toBe(false)
  })

  it('상호명이 아예 없으면 관련 없다', () => {
    expect(isSpotRelevant(doc('오늘 나들이 다녀옴'), '아무개공원')).toBe(false)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/spot-relevance.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 관련성 판별 구현**

`pipeline/restaurant-relevance.ts` 전체를 복사하고 `RESTAURANT_CONTEXT`와
`AMBIGUOUS_NAMES`만 바꾼다. `splitBranch`(지점 분리)는 가볼 곳도 "OO
본점/지점" 표기가 드물게 있으므로(예: 카페형 전시관) 그대로 둔다.

```typescript
// src/pipeline/spot-relevance.ts
import type { BlogDoc } from '../sources/kakao-blog.js'

const SPOT_CONTEXT = ['나들이', '가볼만한곳', '명소', '데이트', '산책', '구경'] as const

const AMBIGUOUS_NAMES = new Set([
  '공원', '전시관', '박물관', '시장', '아울렛', '테마파크',
])

const squeeze = (s: string) => s.replace(/\s+/g, '')

export function splitBranch(name: string): { base: string; branch: string } {
  const n = name.trim()
  const m = /^(.+?)\s+([가-힣A-Za-z0-9]{2,}?)(본점|지점|점)$/.exec(n)
  if (!m) return { base: n, branch: '' }
  return { base: m[1]!.trim(), branch: m[2]! }
}

export function isSpotRelevant(doc: BlogDoc, name: string): boolean {
  const hay = squeeze(`${doc.title} ${doc.contents}`)
  const needle = squeeze(name)
  if (!needle) return false
  if (!hay.includes(needle)) {
    const { base, branch } = splitBranch(name)
    if (!branch || !hay.includes(squeeze(base)) || !hay.includes(branch)) return false
  }
  return SPOT_CONTEXT.some((w) => hay.includes(w))
}

export function isAmbiguousSpotName(name: string): boolean {
  const n = squeeze(name)
  return n.length <= 2 || AMBIGUOUS_NAMES.has(n)
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/spot-relevance.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/config/spot-keywords.ts src/pipeline/spot-relevance.ts \
  tests/pipeline/spot-relevance.test.ts
git commit -m "feat(spot): 검색어·관련성 판별 (제외 목록은 1차 범위 밖)"
```

---

### Task 4: 태그(다중 선택) 부여 — 게이트는 그대로 재사용

**Files:**
- Create: `src/pipeline/spot-tag.ts`
- Test: `tests/pipeline/spot-tag.test.ts`

**Interfaces:**
- Consumes: `SpotAttributes` (Task 1)
- Produces: `assignSpotTags(a: SpotAttributes): string[]`

**`pipeline/gate.ts`는 이 태스크에서 전혀 안 건드린다.** `passesGate`/
`passesHardGate`는 이미 `tags: string[]` + `parkingGrade`만 보는 범용
함수라(`gate.ts:1-4`의 `GateInput`), `assignSpotTags`가 만든 태그 배열을
그대로 넣으면 "태그 0개 배제"가 자동으로 성립한다 — 식당 때와 똑같은
재사용이다. 카페·식당과 다른 점은 이 배열이 **길이 1 이상 여러 개**일 수
있다는 것뿐이고, 게이트 코드 입장에서는 배열 길이만 보므로 차이가 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/pipeline/spot-tag.test.ts
import { describe, it, expect } from 'vitest'
import { assignSpotTags } from '../../src/pipeline/spot-tag.js'
import { passesHardGate } from '../../src/pipeline/gate.js'
import type { SpotAttributes } from '../../src/spot-schema.js'

const base: SpotAttributes = {
  tags: ['자연/공원'], evidence: 'e', parkingGrade: 'A', parkingEvidence: 'p',
  stayDuration: null, indoorOutdoor: null, season: null, teenAppeal: null,
  confidence: 0.5, extractedAt: '2026-09-02T00:00:00.000Z', modelVersion: 'test',
}

describe('assignSpotTags', () => {
  it('추출된 태그를 그대로 낸다', () => {
    expect(assignSpotTags(base)).toEqual(['자연/공원'])
  })

  it('여러 태그를 동시에 가질 수 있다 (다중 선택)', () => {
    const multi = { ...base, tags: ['자연/공원', '아이와 가기 좋은 곳'] as const }
    const tags = assignSpotTags(multi as SpotAttributes)
    expect(tags).toContain('자연/공원')
    expect(tags).toContain('아이와 가기 좋은 곳')
    expect(tags).toHaveLength(2)
  })

  it('태그를 하나도 못 고르면 빈 배열이고, 그러면 기존 게이트가 배제한다', () => {
    const tags = assignSpotTags({ ...base, tags: [] })
    expect(tags).toEqual([])
    expect(passesHardGate({ tags, parkingGrade: 'A' }).pass).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/spot-tag.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/pipeline/spot-tag.ts
import type { SpotAttributes } from '../spot-schema.js'

export function assignSpotTags(a: SpotAttributes): string[] {
  return [...new Set(a.tags)]
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/spot-tag.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/spot-tag.ts tests/pipeline/spot-tag.test.ts
git commit -m "feat(spot): 다중 선택 태그 (게이트는 gate.ts 그대로 재사용)"
```

---

### Task 5: 가족적합도 스코어링 — `score.ts`는 무변경 재사용

**Files:**
- Create: `src/pipeline/spot-score.ts`
- Test: `tests/pipeline/spot-score.test.ts`

**Interfaces:**
- Consumes: `PARKING_MULT` (`pipeline/score.ts`, **이미 export 되어 있음 —
  이번 계획에서 `score.ts`를 손대지 않는다**), `hotScore`,
  `pickWeekendCandidates` (`pipeline/score.ts`, 무변경 재사용)
- Produces: `spotFamilyFit(input, now): number`

식당의 `restaurantFamilyFit`(`pipeline/restaurant-score.ts`)의 `hasRoom`/
`reservable` 보너스 자리를 "아이와 가기 좋은 곳" 태그 보유 여부로 바꾼
버전이다. 거리·주차·재방문·계절(실외 전용 장소의 혹서·혹한 할인)·10대
선호 항은 로직이 동일하므로 그대로 복사한다. **이 계절 할인은 설계
문서에서 "만들지 않기로 한" 새 `season` 필드 기반 랭킹과는 다르다** — 카페·
식당 때부터 이미 있던 `outdoorOnly` 기반 혹서기 할인 로직을 그대로
재사용하는 것뿐이며, 실외 여부는 새로 추가하는 `indoorOutdoor` 필드에서
가져온다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/pipeline/spot-score.test.ts
import { describe, it, expect } from 'vitest'
import { spotFamilyFit } from '../../src/pipeline/spot-score.js'

const base = {
  driveMinutes: 30, parkingGrade: 'A' as const, hasKidsTag: false,
  lastVisitedOn: null, outdoorOnly: false, teenAppeal: 2,
}

describe('spotFamilyFit', () => {
  it('"아이와 가기 좋은 곳" 태그가 있으면 점수가 오른다', () => {
    const now = new Date('2026-09-02')
    const withKids = spotFamilyFit({ ...base, hasKidsTag: true }, now)
    const without = spotFamilyFit(base, now)
    expect(withKids).toBeGreaterThan(without)
  })

  it('주차 D 는 0점 — 카페·식당과 같은 규칙', () => {
    const now = new Date('2026-09-02')
    expect(spotFamilyFit({ ...base, parkingGrade: 'D' }, now)).toBe(0)
  })

  it('실외 전용은 혹서기에 점수가 깎인다', () => {
    const summer = new Date('2026-08-01')
    const outdoor = spotFamilyFit({ ...base, outdoorOnly: true }, summer)
    const indoor = spotFamilyFit({ ...base, outdoorOnly: false }, summer)
    expect(outdoor).toBeLessThan(indoor)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/spot-score.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/pipeline/spot-score.ts
import { PARKING_MULT } from './score.js'

const DAY = 86_400_000
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export interface SpotFitInput {
  driveMinutes: number
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  /** "아이와 가기 좋은 곳" 태그 보유 여부 — 식당의 hasRoom/reservable 자리 */
  hasKidsTag: boolean
  lastVisitedOn: string | null
  outdoorOnly: boolean
  teenAppeal: number
}

/**
 * 식당의 hasRoom/reservable 보너스 자리를 "아이와 가기 좋은 곳" 태그
 * 보유 여부로 바꿨다 (설계 문서 3절 — 가족적합도 보너스는 주차+이동시간+
 * 이 태그).
 */
export function spotFamilyFit(i: SpotFitInput, now: Date): number {
  const distance = Math.exp(-Math.max(i.driveMinutes, 0) / 70)
  const parking = PARKING_MULT[i.parkingGrade]
  const kidsBonus = i.hasKidsTag ? 1.2 : 1.0

  let unvisited = 1.0
  if (i.lastVisitedOn) {
    const days = (now.getTime() - new Date(i.lastVisitedOn).getTime()) / DAY
    unvisited = days <= 180 ? 0.15 : days <= 365 ? 0.5 : 0.8
  }

  const month = now.getUTCMonth() + 1
  const harsh = (month >= 7 && month <= 8) || month === 12 || month <= 2
  const season = i.outdoorOnly ? (harsh ? 0.5 : 1.2) : 1.0

  const teen = 0.85 + 0.03 * clamp(i.teenAppeal, 0, 5)

  return distance * parking * kidsBonus * unvisited * season * teen
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/spot-score.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 카페·식당 회귀 확인 (score.ts 를 안 건드렸는지 확인)**

Run: `npm test`
Expected: 모든 기존 테스트 그대로 통과

- [ ] **Step 6: 커밋**

```bash
git add src/pipeline/spot-score.ts tests/pipeline/spot-score.test.ts
git commit -m "feat(spot): 가족적합도 — 아이와 가기 좋은 곳 태그 보너스"
```

---

### Task 6: LLM 프롬프트

**Files:**
- Modify: `src/llm/prompts.ts` (파일 끝에 새 export만 추가 — 기존 함수는 안 건드림)
- Test: `tests/llm/spot-prompts.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 문자열 조립)
- Produces: `buildSpotExtractPrompt(input): string`, `buildSpotHarvestPrompt(regionLabel, snippets): string`, `SPOT_PROMPT_VERSION`

`buildRestaurantExtractPrompt`/`buildRestaurantHarvestPrompt`(`llm/prompts.ts`
끝부분, Task 7 of the restaurant plan)를 참고해 규칙 문구만 가볼 곳에 맞게
바꾼다. `PROMPT_VERSION`/`RESTAURANT_PROMPT_VERSION`은 안 건드리고 별도
상수를 새로 낸다 — 세 도메인의 프롬프트를 독립적으로 개정할 수 있어야
한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/llm/spot-prompts.test.ts
import { describe, it, expect } from 'vitest'
import { buildSpotExtractPrompt } from '../../src/llm/prompts.js'

describe('buildSpotExtractPrompt', () => {
  it('장소 이름과 태그 규칙을 포함한다', () => {
    const p = buildSpotExtractPrompt({
      name: '아무개공원', sigungu: '부평구', categoryName: '여가시설 > 공원',
      snippets: ['아이들이랑 산책하기 좋았어요'], parkingSnippets: [],
    })
    expect(p).toContain('아무개공원')
    expect(p).toContain('tags')
    expect(p).toContain('자연/공원')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/llm/spot-prompts.test.ts`
Expected: FAIL — export 없음

- [ ] **Step 3: `src/llm/prompts.ts` 파일 끝에 추가**

```typescript
// src/llm/prompts.ts 끝에 추가

export const SPOT_PROMPT_VERSION = 's1'

export interface SpotExtractPromptInput {
  name: string
  sigungu: string
  categoryName: string
  snippets: string[]
  parkingSnippets: string[]
}

export function buildSpotExtractPrompt(i: SpotExtractPromptInput): string {
  const body = i.snippets.length
    ? i.snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')
    : '(후기 없음)'
  const parking = i.parkingSnippets.length
    ? i.parkingSnippets.map((s, n) => `[P${n + 1}] ${s}`).join('\n')
    : '(주차 언급 없음)'

  return `너는 한국의 가볼 곳(공원·관광지·시장·전시관 등)을 구조화하는
도구다. 아래 블로그 후기에서만 근거를 찾아 JSON 으로 답하라.

장소: ${i.name}
지역: ${i.sigungu}
카카오 분류: ${i.categoryName}

--- 블로그 후기 ---
${body}

--- 주차 관련 후기 ---
${parking}

규칙:
1. 후기에 없는 것을 추측하지 마라. 모르면 null 을 쓰거나 빈 배열을 쓰고,
   parkingGrade 는 "?" 를 쓴다.
2. evidence 에는 판단 근거가 된 원문을 그대로 인용하라. 요약하지 마라.
   비워두지 마라.
3. parkingEvidence 에도 주차 판단의 근거 원문을 인용하라. 근거가 없으면
   빈 문자열.
4. tags: 다음 10개 중 후기 내용과 실제로 맞는 것만 여러 개 골라라(하나도
   없으면 빈 배열). 후기에 근거가 없는 태그는 넣지 마라.
   자연/공원, 관광지/명소, 시장/전통거리, 쇼핑/아울렛, 전시/박물관,
   소품샵/편집숍, 드라이브, 체험, 계절명소, 아이와 가기 좋은 곳
5. stayDuration: 후기에 체류시간을 가늠할 언급이 있으면 "1~2시간" 처럼
   짧은 문구로. 없으면 null.
6. indoorOutdoor: 실내 시설이면 "indoor", 야외면 "outdoor", 둘 다 섞여
   있으면 "mixed". 언급이 불충분하면 null.
7. season: 특정 계절에만 좋다는 언급이 뚜렷하면 그 계절, 사계절 다 좋다는
   언급이면 "사계절". 판단할 근거가 없으면 null. 추측하지 마라.
8. parkingGrade — 차로 가는 가족이 헛걸음하지 않는 것이 목적이다. 후하게
   주지 마라. A = 전용 주차장이 넉넉하다. B = 협소하거나 공용 주차장.
   "1시간 무료" 처럼 조건부 무료는 최대 B. C = 5대 미만이거나 인근 유료
   주차장 의존. D = 주차 불가 명시. ? = 언급 없음.
9. teenAppeal: 중고생이 좋아할 요소가 많을수록 높게. 0~5. 판단 근거가
   없으면 null.
10. confidence: 후기 정보가 빈약하면 낮게. 0~1.`
}

export function buildSpotHarvestPrompt(regionLabel: string, snippets: string[]): string {
  return `아래는 "${regionLabel}" 가볼 곳(공원·관광지·시장·전시관 등)을
소개하는 블로그 글 조각들이다. 글에서 실제 장소 이름만 뽑아 JSON 으로
답하라.

${snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')}

규칙:
1. 장소 이름만 뽑는다. "나들이", "가볼만한곳", "명소" 같은 일반어는
   제외한다.
2. 지역명("${regionLabel}")을 이름에 붙이지 마라.
3. 확실하지 않으면 넣지 마라. 적게 뽑는 편이 낫다.
4. 같은 장소가 여러 번 나오면 한 번만 넣는다.`
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/llm/spot-prompts.test.ts`
Expected: PASS

- [ ] **Step 5: 카페·식당 회귀 확인 (파일 끝에 추가만 했는지 확인)**

Run: `npm test`
Expected: 모든 기존 테스트 그대로 통과

- [ ] **Step 6: 커밋**

```bash
git add src/llm/prompts.ts tests/llm/spot-prompts.test.ts
git commit -m "feat(spot): LLM 추출 프롬프트 (다중 태그·체류시간·실내외·계절)"
```

---

### Task 7: 속성 추출 헬퍼

**Files:**
- Create: `src/pipeline/spot-extract.ts`
- Test: `tests/pipeline/spot-extract.test.ts`

**Interfaces:**
- Consumes: `buildSpotExtractPrompt`, `SPOT_PROMPT_VERSION` (Task 6),
  `SpotAttributesSchema` (Task 1), `LlmClient` (`src/llm/types.js`, 무변경)
- Produces: `extractSpotAttributes(deps, input): Promise<SpotAttributes>`

`pipeline/restaurant-extract.ts` 전체 구조를 그대로 복사한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/pipeline/spot-extract.test.ts
import { describe, it, expect } from 'vitest'
import { extractSpotAttributes } from '../../src/pipeline/spot-extract.js'

const fakeLlm = {
  modelVersion: 'fake-1',
  extract: async () => ({
    tags: ['자연/공원'], evidence: 'e', parkingGrade: 'A' as const, parkingEvidence: 'p',
    stayDuration: '1~2시간', indoorOutdoor: 'outdoor' as const, season: null,
    teenAppeal: 3, confidence: 0.8,
  }),
}

describe('extractSpotAttributes', () => {
  it('LLM 응답에 extractedAt·modelVersion 을 붙인다', async () => {
    const now = new Date('2026-09-02T00:00:00.000Z')
    const a = await extractSpotAttributes(
      { llm: fakeLlm as never, now },
      { name: '아무개공원', sigungu: '부평구', categoryName: '', snippets: [], parkingSnippets: [] },
    )
    expect(a.extractedAt).toBe('2026-09-02T00:00:00.000Z')
    expect(a.modelVersion).toContain('fake-1')
    expect(a.tags).toEqual(['자연/공원'])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/pipeline/spot-extract.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/pipeline/spot-extract.ts
import { SpotAttributesSchema, type SpotAttributes } from '../spot-schema.js'
import {
  buildSpotExtractPrompt, SPOT_PROMPT_VERSION, type SpotExtractPromptInput,
} from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'

export const LlmSpotAttributesSchema = SpotAttributesSchema.omit({
  extractedAt: true,
  modelVersion: true,
})

export async function extractSpotAttributes(
  deps: { llm: LlmClient; now?: Date },
  input: SpotExtractPromptInput,
): Promise<SpotAttributes> {
  const { llm, now = new Date() } = deps
  const raw = await llm.extract({
    prompt: buildSpotExtractPrompt(input),
    schema: LlmSpotAttributesSchema,
    maxRetries: 3,
    escalateTo: 'gemini-3.6-flash',
  })
  return SpotAttributesSchema.parse({
    ...raw,
    extractedAt: now.toISOString(),
    modelVersion: `${llm.modelVersion}+${SPOT_PROMPT_VERSION}`,
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/pipeline/spot-extract.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/spot-extract.ts tests/pipeline/spot-extract.test.ts
git commit -m "feat(spot): LLM 속성 추출 헬퍼"
```

---

### Task 8: 발굴 잡 (discover)

**Files:**
- Create: `src/pipeline/spot-harvest.ts`
- Create: `src/jobs/spot-discover.ts`
- Test: `tests/jobs/spot-discover.test.ts`

**Interfaces:**
- Consumes: `SpotStore` (Task 2), `SPOT_SEARCH_KEYWORDS`, `spotCurationQueries`
  (Task 3), `isAmbiguousSpotName` (Task 3), `buildSpotHarvestPrompt` (Task 6),
  도메인 무관 재사용: `regionLabel`/`Region`(`config/regions.js`), `HOME`/
  `haversineKm`/`estimateDriveMinutes`(`pipeline/geo.js`), `belongsToRegion`
  (`pipeline/region-match.js`), `resolveSigungu`(`pipeline/district.js`),
  `recordSuccess`/`recordFailure`(`sources/health.js`)
- Produces: `harvestCuratedSpots(deps, region)`, `runSpotDiscover(deps, opts)`,
  `spotNaverMapUrl(sigungu, name)`

`pipeline/restaurant-harvest.ts`와 `jobs/restaurant-discover.ts`를 그대로
구조를 따라 복사한다. **식당판과 다른 유일한 지점**: `evaluateRestaurantExclusion`
호출이 없다 — 블랙리스트가 없으므로 지역 안(`belongsToRegion`)이면 전부
`pending_extraction`으로 들어간다. health 소스 이름은 `'kakao-local-spot'`/
`'harvest-spot'`로 바꾼다(Task 12에서 이 이름들을 다시 쓴다).

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/jobs/spot-discover.test.ts
import { describe, it, expect } from 'vitest'
import { runSpotDiscover } from '../../src/jobs/spot-discover.js'
import type { Region } from '../../src/config/regions.js'

const region: Region = { sido: '인천', sigungu: '부평구', excluded: false } as Region

function harness() {
  let saved: unknown[] = []
  let health: unknown[] = []
  const deps = {
    store: {
      readSpots: async () => saved as never,
      writeSpots: async (r: unknown[]) => { saved = r },
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    local: {
      searchKeyword: async () => ({
        places: [{
          id: '1', placeName: '아무개공원', roadAddressName: '인천 부평구 1',
          addressName: '인천 부평구 1', lat: 37.5, lng: 126.7, categoryName: '여가시설 > 공원',
          placeUrl: '', phone: '',
        }],
        isEnd: true, payload: {},
      }),
    },
    blog: { search: async () => ({ docs: [], payload: {} }) },
    llm: { modelVersion: 'fake-1', extract: async () => ({ names: [] }) } as never,
    now: new Date('2026-09-02'),
  }
  return { deps, saved: () => saved }
}

describe('runSpotDiscover', () => {
  it('카카오 키워드 검색으로 찾은 장소를 pending_extraction 으로 넣는다', async () => {
    const h = harness()
    const r = await runSpotDiscover(h.deps, { regions: [region], skipHarvest: true })
    expect(r.discovered).toBe(1)
    expect((h.saved()[0] as { status: string }).status).toBe('pending_extraction')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/spot-discover.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `spot-harvest.ts` 구현**

```typescript
// src/pipeline/spot-harvest.ts
import { z } from 'zod'
import { spotCurationQueries } from '../config/spot-keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { buildSpotHarvestPrompt } from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { SpotStore } from '../store/spot-json-store.js'

const HarvestSchema = z.object({
  names: z.array(z.string().min(1)).max(40),
})

export interface SpotHarvestDeps {
  blog: {
    search: (
      q: string, o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  local: { searchKeyword: (q: string, page: number) => Promise<{ places: KakaoPlace[] }> }
  llm: LlmClient
  store: Pick<SpotStore, 'appendRaw'>
}

export async function harvestCuratedSpots(
  deps: SpotHarvestDeps,
  region: Region,
): Promise<{ names: string[]; places: KakaoPlace[] }> {
  const { blog, local, llm, store } = deps
  const label = regionLabel(region)

  const snippets: string[] = []
  for (const q of spotCurationQueries(label)) {
    const res = await blog.search(q, { size: 30, sort: 'accuracy' })
    await store.appendRaw('kakao-blog-curation-spot', q, res.payload)
    snippets.push(...res.docs.map((d) => `${d.title} ${d.contents}`))
  }
  if (snippets.length === 0) return { names: [], places: [] }

  const { names } = await llm.extract({
    prompt: buildSpotHarvestPrompt(label, snippets),
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

- [ ] **Step 4: `spot-discover.ts` 구현**

```typescript
// src/jobs/spot-discover.ts
import { SPOT_SEARCH_KEYWORDS } from '../config/spot-keywords.js'
import { regionLabel, type Region } from '../config/regions.js'
import { HOME, haversineKm, estimateDriveMinutes } from '../pipeline/geo.js'
import { belongsToRegion } from '../pipeline/region-match.js'
import { isAmbiguousSpotName } from '../pipeline/spot-relevance.js'
import { harvestCuratedSpots } from '../pipeline/spot-harvest.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import { resolveSigungu } from '../pipeline/district.js'
import type { Spot } from '../spot-schema.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { LlmClient } from '../llm/types.js'
import type { SpotStore } from '../store/spot-json-store.js'

export interface SpotDiscoverDeps {
  store: Pick<SpotStore, 'readSpots' | 'writeSpots' | 'appendRaw' | 'readHealth' | 'writeHealth'>
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

export interface SpotDiscoverResult {
  discovered: number
  offRegion: number
  total: number
  errors: string[]
}

export const spotNaverMapUrl = (sigungu: string, name: string) =>
  `https://map.naver.com/p/search/${encodeURIComponent(`${sigungu} ${name}`)}`

function toSpot(p: KakaoPlace, region: Region, now: Date): Spot {
  const straightKm = haversineKm(HOME, { lat: p.lat, lng: p.lng })
  const sigungu = resolveSigungu({
    roadAddress: p.roadAddressName, address: p.addressName, scanned: region.sigungu,
  })
  return {
    kakaoPlaceId: p.id, name: p.placeName, sigungu,
    roadAddress: p.roadAddressName || null, address: p.addressName || null,
    lat: p.lat, lng: p.lng, categoryName: p.categoryName || null,
    kakaoPlaceUrl: p.placeUrl || null, naverMapUrl: spotNaverMapUrl(sigungu, p.placeName),
    phone: p.phone || null, straightKm: Number(straightKm.toFixed(2)),
    driveMinutesEst: estimateDriveMinutes(straightKm), firstSeenAt: now.toISOString(),
    status: 'pending_extraction', excludeReason: null,
    ambiguousName: isAmbiguousSpotName(p.placeName), attributes: null, tags: [],
  }
}

export async function runSpotDiscover(
  deps: SpotDiscoverDeps,
  opts: { regions: Region[]; skipHarvest?: boolean },
): Promise<SpotDiscoverResult> {
  const { store, local, blog, llm, now = new Date() } = deps
  const errors: string[] = []
  const existing = await store.readSpots()
  const byId = new Map<string, Spot>(existing.map((s) => [s.kakaoPlaceId, s]))
  let discovered = 0
  const offRegionIds = new Set<string>()

  const add = (p: KakaoPlace, region: Region) => {
    if (!p.id || byId.has(p.id)) return
    if (!belongsToRegion(p, region)) {
      offRegionIds.add(p.id)
      return
    }
    byId.set(p.id, toSpot(p, region, now))
    discovered++
  }

  for (const region of opts.regions) {
    try {
      for (const kw of SPOT_SEARCH_KEYWORDS) {
        const query = `${regionLabel(region)} ${kw}`
        for (let page = 1; page <= 3; page++) {
          const res = await local.searchKeyword(query, page)
          await store.appendRaw('kakao-local-spot', query, res.payload, now)
          res.places.forEach((p) => add(p, region))
          if (res.isEnd) break
        }
      }
      await recordSuccess(store, 'kakao-local-spot', now)
    } catch (e) {
      errors.push(`${region.sigungu}: ${(e as Error).message}`)
      await recordFailure(store, 'kakao-local-spot', e, now)
    }

    if (opts.skipHarvest) continue
    try {
      const harvested = await harvestCuratedSpots({ blog, local, llm, store }, region)
      harvested.places.forEach((p) => add(p, region))
      await recordSuccess(store, 'harvest-spot', now)
    } catch (e) {
      errors.push(`${region.sigungu} 수확: ${(e as Error).message}`)
      await recordFailure(store, 'harvest-spot', e, now)
    }
  }

  await store.writeSpots([...byId.values()])
  return { discovered, offRegion: offRegionIds.size, total: byId.size, errors }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/jobs/spot-discover.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/pipeline/spot-harvest.ts src/jobs/spot-discover.ts \
  tests/jobs/spot-discover.test.ts
git commit -m "feat(spot): 발굴 잡 (그물 A + 그물 C, 제외 목록 없음)"
```

---

### Task 9: 화제량 잡 (daily-buzz)

**Files:**
- Create: `src/jobs/spot-daily-buzz.ts`
- Test: `tests/jobs/spot-daily-buzz.test.ts`

**Interfaces:**
- Consumes: `computeBuzz`, `pickThumbnail` (`pipeline/buzz.js`, **이미
  `isRelevant` 옵션을 받는 상태 그대로 재사용 — 이번 계획에서 손대지
  않는다**), `isSpotRelevant` (Task 3), `SpotStore` (Task 2)
- Produces: `runSpotDailyBuzz(deps, opts)`

`jobs/restaurant-daily-buzz.ts` 전체를 그대로 복사해 `Restaurant`→`Spot`,
`readRestaurants/writeRestaurants`→`readSpots/writeSpots`,
`readRestaurantBuzz/writeRestaurantBuzz`→`readSpotBuzz/writeSpotBuzz`,
`isRestaurantRelevant`→`isSpotRelevant`, health 소스 이름
`'kakao-blog-restaurant'`→`'kakao-blog-spot'`로 바꾼다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/jobs/spot-daily-buzz.test.ts
import { describe, it, expect } from 'vitest'
import { runSpotDailyBuzz } from '../../src/jobs/spot-daily-buzz.js'

function harness() {
  let spots = [{
    kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
    firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'active' as const,
    ambiguousName: false, attributes: null, tags: ['자연/공원'],
  }]
  let buzz: unknown[] = []
  let health: unknown[] = []
  const deps = {
    store: {
      readSpots: async () => spots,
      writeSpots: async (r: typeof spots) => { spots = r },
      readSpotBuzz: async () => buzz as never,
      writeSpotBuzz: async (r: unknown[]) => { buzz = r },
      appendRaw: async () => 'p',
      readHealth: async () => health as never,
      writeHealth: async (r: unknown[]) => { health = r },
    },
    blog: {
      search: async () => ({
        docs: [{
          title: '아무개공원 나들이 후기', contents: '아이들이랑 정말 좋았다',
          dateTime: new Date('2026-08-30'), thumbnail: 'https://img/1',
        }],
        payload: {},
      }),
    },
    now: new Date('2026-09-02'),
  }
  return { deps, buzz: () => buzz }
}

describe('runSpotDailyBuzz', () => {
  it('가볼 곳 관련성 판별로 화제량을 잰다', async () => {
    const h = harness()
    const r = await runSpotDailyBuzz(h.deps)
    expect(r.updated).toBe(1)
    expect((h.buzz()[0] as { relevantCount: number }).relevantCount).toBe(1)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/spot-daily-buzz.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/jobs/spot-daily-buzz.ts
import { computeBuzz, pickThumbnail } from '../pipeline/buzz.js'
import { isSpotRelevant } from '../pipeline/spot-relevance.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BlogDoc } from '../sources/kakao-blog.js'
import type { BuzzSnapshot } from '../schema.js'
import type { SpotStore } from '../store/spot-json-store.js'

export const PENDING_PER_DAY = 800

export interface SpotDailyBuzzDeps {
  store: Pick<
    SpotStore,
    'readSpots' | 'writeSpots' | 'readSpotBuzz' | 'writeSpotBuzz'
    | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: { search: (q: string, o?: object) => Promise<{ docs: BlogDoc[]; payload: unknown }> }
  now?: Date
}

export interface SpotDailyBuzzResult {
  updated: number
  failed: number
  dropped: number
  images: number
  active: number
  rotated: number
}

export async function runSpotDailyBuzz(
  deps: SpotDailyBuzzDeps,
  opts: { limit?: number; pendingPerDay?: number } = {},
): Promise<SpotDailyBuzzResult> {
  const { store, blog, now = new Date() } = deps
  const spots = await store.readSpots()
  const rows = await store.readSpotBuzz()

  const active = spots.filter((s) => s.status === 'active')
  const measuredAt = new Map(rows.map((r) => [r.kakaoPlaceId, r.capturedAt]))
  const pending = spots
    .filter((s) => s.status === 'pending_extraction')
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
  const activeTargets = targets.filter((s) => s.status === 'active').length
  const capturedAt = now.toISOString().slice(0, 10)
  let updated = 0
  let failed = 0
  let images = 0

  for (const s of targets) {
    try {
      const query = `${s.sigungu} ${s.name}`
      const res = await blog.search(query, { size: 50, sort: 'recency' })
      await store.appendRaw('kakao-blog-spot', query, res.payload, now)

      const m = computeBuzz({
        docs: res.docs, cafeName: s.name, now, isRelevant: isSpotRelevant,
      })
      const snap: BuzzSnapshot = { kakaoPlaceId: s.kakaoPlaceId, capturedAt, ...m }
      const i = rows.findIndex(
        (row) => row.kakaoPlaceId === s.kakaoPlaceId && row.capturedAt === capturedAt,
      )
      if (i >= 0) rows[i] = snap
      else rows.push(snap)
      updated++

      const thumb = pickThumbnail({
        docs: res.docs, cafeName: s.name, isRelevant: isSpotRelevant,
      })
      if (thumb && thumb !== s.imageUrl) {
        s.imageUrl = thumb
        images++
      }
    } catch (e) {
      failed++
      await recordFailure(store, 'kakao-blog-spot', e, now)
    }
  }

  const latest = new Map<string, BuzzSnapshot>()
  for (const row of rows) {
    const prev = latest.get(row.kakaoPlaceId)
    if (!prev || row.capturedAt > prev.capturedAt) latest.set(row.kakaoPlaceId, row)
  }
  const kept = [...latest.values()]
  const dropped = rows.length - kept.length

  await store.writeSpotBuzz(kept)
  if (images > 0) await store.writeSpots(spots)
  if (updated > 0) await recordSuccess(store, 'kakao-blog-spot', now)
  return {
    updated, failed, dropped, images,
    active: activeTargets, rotated: targets.length - activeTargets,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/jobs/spot-daily-buzz.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/jobs/spot-daily-buzz.ts tests/jobs/spot-daily-buzz.test.ts
git commit -m "feat(spot): 일일 화제량 잡 (buzz.ts 의 isRelevant 주입 재사용)"
```

---

### Task 10: 판정 잡 (classify)

**Files:**
- Create: `src/jobs/spot-classify.ts`
- Test: `tests/jobs/spot-classify.test.ts`

**Interfaces:**
- Consumes: `passesLayer2` (`pipeline/buzz.js`, 무변경 재사용),
  `extractSpotAttributes` (Task 7), `assignSpotTags` (Task 4), `passesHardGate`
  (`pipeline/gate.js`, **무변경 재사용**), `SpotStore` (Task 2)
- Produces: `runSpotClassify(deps, opts)`, `orderPendingSpots(...)`

`jobs/restaurant-classify.ts` 전체를 그대로 복사해 `Restaurant`→`Spot`,
`extractRestaurantAttributes`→`extractSpotAttributes`, `assignRestaurantTags`→
`assignSpotTags`, `readRestaurants/writeRestaurants`→`readSpots/writeSpots`,
health 소스 이름 `'classify-restaurant'`→`'classify-spot'`로 바꾼다.
**`passesLayer2`와 `passesHardGate`는 import 출처를 그대로 카페 파이프라인
(`pipeline/buzz.js`, `pipeline/gate.js`)에 둔다** — 식당 때와 같은 이유로
이미 범용이라 복사할 이유가 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/jobs/spot-classify.test.ts
import { describe, it, expect } from 'vitest'
import { runSpotClassify } from '../../src/jobs/spot-classify.js'

function harness() {
  let spots = [{
    kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
    firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'pending_extraction' as const,
    ambiguousName: false, attributes: null, tags: [],
  }]
  let health: unknown[] = []
  const deps = {
    store: {
      readSpots: async () => spots,
      writeSpots: async (r: typeof spots) => { spots = r },
      readSpotBuzz: async () => [{
        kakaoPlaceId: '1', capturedAt: '2026-09-02', receivedCount: 10, relevantCount: 8,
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
        tags: ['자연/공원'], evidence: 'e', parkingGrade: 'A' as const, parkingEvidence: 'p',
        stayDuration: '1~2시간', indoorOutdoor: 'outdoor' as const, season: null,
        teenAppeal: 3, confidence: 0.8,
      }),
    } as never,
    now: new Date('2026-09-02'),
  }
  return { deps, spots: () => spots }
}

describe('runSpotClassify', () => {
  it('화제량 컷을 통과하면 판정해서 active 로 만든다', async () => {
    const h = harness()
    const r = await runSpotClassify(h.deps)
    expect(r.classified).toBe(1)
    expect(h.spots()[0]!.status).toBe('active')
    expect(h.spots()[0]!.tags).toContain('자연/공원')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/spot-classify.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/jobs/spot-classify.ts
import { SPOT_PROMPT_VERSION } from '../llm/prompts.js'
import { passesLayer2 } from '../pipeline/buzz.js'
import { extractSpotAttributes } from '../pipeline/spot-extract.js'
import { assignSpotTags } from '../pipeline/spot-tag.js'
import { passesHardGate } from '../pipeline/gate.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import { SourceError } from '../sources/rate-limiter.js'
import type { BuzzSnapshot } from '../schema.js'
import type { Spot } from '../spot-schema.js'
import type { LlmClient } from '../llm/types.js'
import type { SpotStore } from '../store/spot-json-store.js'

export interface SpotClassifyDeps {
  store: Pick<
    SpotStore,
    'readSpots' | 'writeSpots' | 'readSpotBuzz' | 'appendRaw' | 'readHealth' | 'writeHealth'
  >
  blog: {
    search: (
      q: string, o?: object,
    ) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }>
  }
  llm: LlmClient
  now?: Date
}

export interface SpotClassifyResult {
  classified: number
  excluded: number
  skipped: number
  failed: number
  quotaExhausted: boolean
}

const QUOTA_GIVE_UP = 3
const FLUSH_EVERY = 20
const NEAR_SHARE = 0.3

export function isStaleSpotExtraction(s: Spot): boolean {
  return s.attributes !== null && !s.attributes.modelVersion.endsWith(`+${SPOT_PROMPT_VERSION}`)
}

const driveOf = (s: Spot): number =>
  s.driveMinutes ?? s.driveMinutesEst ?? Number.POSITIVE_INFINITY

export function orderPendingSpots(
  pending: Spot[],
  latest: Map<string, BuzzSnapshot>,
  opts: { order: 'hot' | 'near' | 'file' | 'mixed'; limit?: number },
): Spot[] {
  const { order, limit } = opts
  if (order === 'file') return pending

  const rate = (s: Spot) => latest.get(s.kakaoPlaceId)?.postsPer30 ?? -1
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
  const out: Spot[] = []
  for (const s of byNear) {
    if (out.length >= nearQuota) break
    picked.add(s.kakaoPlaceId)
    out.push(s)
  }
  for (const s of byHot) {
    if (picked.has(s.kakaoPlaceId)) continue
    out.push(s)
  }
  return out
}

export async function runSpotClassify(
  deps: SpotClassifyDeps,
  opts: { limit?: number; redoStale?: boolean; order?: 'hot' | 'near' | 'file' | 'mixed' } = {},
): Promise<SpotClassifyResult> {
  const { store, blog, llm, now = new Date() } = deps
  const spots = await store.readSpots()
  const buzz = await store.readSpotBuzz()

  const latest = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latest.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latest.set(b.kakaoPlaceId, b)
  }

  const stale = opts.redoStale ? spots.filter(isStaleSpotExtraction) : []
  const pending = spots.filter((s) => s.status === 'pending_extraction')
  const ordered = orderPendingSpots(pending, latest, {
    order: opts.order ?? 'mixed', limit: opts.limit,
  })
  const targets: Spot[] = [...stale, ...ordered].slice(0, opts.limit ?? Infinity)

  let classified = 0
  let excluded = 0
  let skipped = 0
  let failed = 0
  let quotaErrors = 0
  let quotaExhausted = false

  for (const [i, s] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeSpots(spots)
    try {
      const b = latest.get(s.kakaoPlaceId)
      if (!b) {
        skipped++
        continue
      }

      const l2 = passesLayer2(b, { now, driveMinutes: driveOf(s) })
      if (!l2.pass) {
        s.status = 'excluded_auto'
        s.excludeReason = l2.reason ?? 'Layer 2 탈락'
        excluded++
        continue
      }

      const parkingQuery = `${s.sigungu} ${s.name} 주차`
      const parkingRes = await blog.search(parkingQuery, { size: 10, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-parking-spot', parkingQuery, parkingRes.payload, now)

      const mainQuery = `${s.sigungu} ${s.name}`
      const mainRes = await blog.search(mainQuery, { size: 15, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-extract-spot', mainQuery, mainRes.payload, now)

      const attributes = await extractSpotAttributes({ llm, now }, {
        name: s.name, sigungu: s.sigungu, categoryName: s.categoryName ?? '',
        snippets: mainRes.docs.map((d) => `${d.title} ${d.contents}`),
        parkingSnippets: parkingRes.docs.map((d) => `${d.title} ${d.contents}`),
      })
      s.attributes = attributes
      s.tags = assignSpotTags(attributes)

      const gate = passesHardGate({ tags: s.tags, parkingGrade: attributes.parkingGrade })
      if (!gate.pass) {
        s.status = 'excluded_auto'
        s.excludeReason = gate.reason ?? 'Layer 5 탈락'
        excluded++
      } else {
        s.status = 'active'
        s.excludeReason = null
        classified++
      }
      quotaErrors = 0
    } catch (e) {
      failed++
      await recordFailure(store, 'classify-spot', e, now)
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

  await store.writeSpots(spots)
  if (classified + excluded > 0) await recordSuccess(store, 'classify-spot', now)
  return { classified, excluded, skipped, failed, quotaExhausted }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/jobs/spot-classify.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/jobs/spot-classify.ts tests/jobs/spot-classify.test.ts
git commit -m "feat(spot): 판정 잡 (Layer 2~5, 게이트는 gate.ts 재사용)"
```

---

### Task 11: 폐업 감지 · 실주행 시간 (얇은 복사)

**Files:**
- Create: `src/jobs/spot-liveness.ts`
- Create: `src/jobs/spot-drive-times.ts`
- Modify: `src/jobs/usage-watch.ts`
- Test: `tests/jobs/spot-liveness.test.ts`
- Test: `tests/jobs/spot-drive-times.test.ts`

**Interfaces:**
- Consumes: `placeQuery` (`pipeline/place-query.js`, 무변경), `SpotStore` (Task 2)
- Produces: `runSpotLiveness(deps, opts)`, `SPOT_LIVENESS_SOURCE`,
  `staleSpots(...)`, `runSpotDriveTimes(deps, opts)`, `spotDriveMinutesOf(s)`

`jobs/restaurant-liveness.ts`와 `jobs/restaurant-drive-times.ts`를 그대로
복사해 `Restaurant`→`Spot`, `readRestaurants/writeRestaurants`→
`readSpots/writeSpots`, 소스 이름 `'kakao-local-liveness-restaurant'`→
`'kakao-local-liveness-spot'`, `'kakao-directions-restaurant'`→
`'kakao-directions-spot'`로 바꾼다.

- [ ] **Step 1: liveness 실패 테스트 작성**

```typescript
// tests/jobs/spot-liveness.test.ts
import { describe, it, expect } from 'vitest'
import { runSpotLiveness } from '../../src/jobs/spot-liveness.js'

describe('runSpotLiveness', () => {
  it('찾은 장소는 확인 날짜를 새로 쓴다', async () => {
    const now = new Date('2026-09-02')
    let saved = [{
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, attributes: null, tags: ['자연/공원'],
    }]
    let health: unknown[] = []
    const deps = {
      store: {
        readSpots: async () => saved,
        writeSpots: async (r: typeof saved) => { saved = r },
        appendRaw: async () => 'p',
        readHealth: async () => health as never,
        writeHealth: async (r: unknown[]) => { health = r },
      },
      local: {
        searchKeyword: async () => ({ places: [{ id: '1' } as never], payload: {} }),
      },
      now,
    }
    const r = await runSpotLiveness(deps)
    expect(r.seen).toBe(1)
    expect(saved[0]!.lastSeenAt).toBe(now.toISOString())
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/spot-liveness.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `spot-liveness.ts` 구현**

```typescript
// src/jobs/spot-liveness.ts
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { Spot } from '../spot-schema.js'
import type { SpotStore } from '../store/spot-json-store.js'
import { placeQuery } from '../pipeline/place-query.js'
import { recordFailure, recordSuccess } from '../sources/health.js'

export const SPOT_LIVENESS_SOURCE = 'kakao-local-liveness-spot'

export interface SpotLivenessDeps {
  store: Pick<SpotStore, 'readSpots' | 'writeSpots' | 'appendRaw'>
    & Pick<SpotStore, 'readHealth' | 'writeHealth'>
  local: { searchKeyword(query: string, page?: number): Promise<{ places: KakaoPlace[]; payload: unknown }> }
  now?: Date
}

export interface SpotLivenessResult {
  checked: number
  seen: number
  missing: number
  failed: number
  stale: { name: string; sigungu: string; days: number }[]
}

export const STALE_DAYS = 21

export function daysUnseen(s: Spot, now: Date): number | null {
  const at = s.lastSeenAt ?? null
  if (!at) return null
  return Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000)
}

export function staleSpots(rows: Spot[], now: Date, days = STALE_DAYS): Spot[] {
  return rows.filter((s) => {
    if (s.status !== 'active') return false
    const d = daysUnseen(s, now)
    return d !== null && d > days
  })
}

export async function runSpotLiveness(
  deps: SpotLivenessDeps,
  opts: { limit?: number } = {},
): Promise<SpotLivenessResult> {
  const { store, local, now = new Date() } = deps
  const spots = await store.readSpots()

  const targets = spots
    .filter((s) => s.status === 'active')
    .sort((a, b) => (a.lastSeenAt ?? '').localeCompare(b.lastSeenAt ?? ''))
    .slice(0, opts.limit ?? Infinity)

  let seen = 0
  let missing = 0
  let failed = 0

  for (const s of targets) {
    const query = placeQuery(s as never)
    try {
      const res = await local.searchKeyword(query, 1)
      await store.appendRaw(SPOT_LIVENESS_SOURCE, query, res.payload, now)
      if (res.places.some((p) => p.id === s.kakaoPlaceId)) {
        s.lastSeenAt = now.toISOString()
        seen++
      } else {
        missing++
      }
    } catch (e) {
      failed++
      await recordFailure(store, SPOT_LIVENESS_SOURCE, e, now)
    }
  }

  await store.writeSpots(spots)
  if (seen > 0) await recordSuccess(store, SPOT_LIVENESS_SOURCE, now)

  return {
    checked: targets.length, seen, missing, failed,
    stale: staleSpots(spots, now).map((s) => ({
      name: s.name, sigungu: s.sigungu, days: daysUnseen(s, now) ?? 0,
    })),
  }
}
```

- [ ] **Step 4: liveness 테스트 통과 확인**

Run: `npx vitest run tests/jobs/spot-liveness.test.ts`
Expected: PASS

- [ ] **Step 5: drive-times 실패 테스트 작성**

```typescript
// tests/jobs/spot-drive-times.test.ts
import { describe, it, expect } from 'vitest'
import { runSpotDriveTimes } from '../../src/jobs/spot-drive-times.js'

describe('runSpotDriveTimes', () => {
  it('driveMinutes 가 없는 곳만 잰다', async () => {
    let saved = [{
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      firstSeenAt: '2026-09-02T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, attributes: null, tags: ['자연/공원'],
    }]
    let health: unknown[] = []
    const deps = {
      store: {
        readSpots: async () => saved,
        writeSpots: async (r: typeof saved) => { saved = r },
        appendRaw: async () => 'p',
        readHealth: async () => health as never,
        writeHealth: async (r: unknown[]) => { health = r },
      },
      directions: {
        route: async () => ({ route: { minutes: 20, km: 8, tollWon: 0 }, payload: {} }),
      },
      now: new Date('2026-09-02'),
    }
    const r = await runSpotDriveTimes(deps)
    expect(r.measured).toBe(1)
    expect(saved[0]!.driveMinutes).toBe(20)
  })
})
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/spot-drive-times.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 7: `spot-drive-times.ts` 구현**

```typescript
// src/jobs/spot-drive-times.ts
import { HOME } from '../pipeline/geo.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { Coord, Route } from '../sources/kakao-directions.js'
import type { Spot } from '../spot-schema.js'
import type { SpotStore } from '../store/spot-json-store.js'

export interface SpotDriveDeps {
  store: Pick<SpotStore, 'readSpots' | 'writeSpots' | 'appendRaw'>
    & Pick<SpotStore, 'readHealth' | 'writeHealth'>
  directions: { route: (o: Coord, d: Coord) => Promise<{ route: Route | null; payload: unknown }> }
  now?: Date
}

export interface SpotDriveResult {
  measured: number
  unroutable: number
  failed: number
}

const FLUSH_EVERY = 25
const SPOT_DIRECTIONS_SOURCE = 'kakao-directions-spot'

export async function runSpotDriveTimes(
  deps: SpotDriveDeps,
  opts: { limit?: number; force?: boolean } = {},
): Promise<SpotDriveResult> {
  const { store, directions, now = new Date() } = deps
  const spots = await store.readSpots()

  const targets = spots
    .filter((s) => s.status === 'active')
    .filter((s) => opts.force || s.driveMinutes == null)
    .slice(0, opts.limit ?? Infinity)

  let measured = 0
  let unroutable = 0
  let failed = 0

  for (const [i, s] of targets.entries()) {
    if (i > 0 && i % FLUSH_EVERY === 0) await store.writeSpots(spots)
    try {
      const { route, payload } = await directions.route(HOME, { lat: s.lat, lng: s.lng })
      await store.appendRaw(SPOT_DIRECTIONS_SOURCE, `${s.sigungu} ${s.name}`, payload, now)
      if (!route) {
        unroutable++
        continue
      }
      s.driveMinutes = route.minutes
      s.driveKm = route.km
      s.tollWon = route.tollWon
      measured++
    } catch (e) {
      failed++
      await recordFailure(store, SPOT_DIRECTIONS_SOURCE, e, now)
    }
  }

  await store.writeSpots(spots)
  if (measured > 0) await recordSuccess(store, SPOT_DIRECTIONS_SOURCE, now)
  return { measured, unroutable, failed }
}

export function spotDriveMinutesOf(
  s: Pick<Spot, 'driveMinutes' | 'driveMinutesEst'>,
): number | null {
  return s.driveMinutes ?? s.driveMinutesEst ?? null
}
```

- [ ] **Step 8: drive-times 테스트 통과 확인**

Run: `npx vitest run tests/jobs/spot-drive-times.test.ts`
Expected: PASS

- [ ] **Step 9: watch 감시에 새 소스 등록 (`MUTATING`에도 처음부터 `spot-liveness` 를 넣는다 — Task 13에서 확인)**

`src/jobs/usage-watch.ts`의 `WEEKLY_SOURCES`·`DAILY_SOURCES`에 이 태스크와
Task 8·9·10에서 만든 소스 이름을 전부 더한다.

```typescript
// src/jobs/usage-watch.ts 위쪽 import 에 추가:
import { SPOT_LIVENESS_SOURCE } from './spot-liveness.js'
```

```typescript
// DAILY_SOURCES 를:
const DAILY_SOURCES = [
  'kakao-blog', 'classify', 'kakao-blog-restaurant', 'classify-restaurant',
] as const
// 다음으로 바꾼다:
const DAILY_SOURCES = [
  'kakao-blog', 'classify', 'kakao-blog-restaurant', 'classify-restaurant',
  'kakao-blog-spot', 'classify-spot',
] as const
```

```typescript
// WEEKLY_SOURCES 를:
const WEEKLY_SOURCES = [
  'kakao-local', 'kakao-directions', 'harvest', LIVENESS_SOURCE,
  'kakao-local-restaurant', 'kakao-directions-restaurant', 'harvest-restaurant',
  RESTAURANT_LIVENESS_SOURCE,
] as const
// 다음으로 바꾼다:
const WEEKLY_SOURCES = [
  'kakao-local', 'kakao-directions', 'harvest', LIVENESS_SOURCE,
  'kakao-local-restaurant', 'kakao-directions-restaurant', 'harvest-restaurant',
  RESTAURANT_LIVENESS_SOURCE,
  'kakao-local-spot', 'kakao-directions-spot', 'harvest-spot',
  SPOT_LIVENESS_SOURCE,
] as const
```

- [ ] **Step 10: 카페·식당 회귀 확인**

Run: `npm test`
Expected: 모든 기존 테스트 그대로 통과 — `usage-watch.test.ts`의 기존
카페·식당 케이스도 그대로 통과 (배열에 항목만 추가했으므로 판정 로직은
안 바뀜)

- [ ] **Step 11: 커밋**

```bash
git add src/jobs/spot-liveness.ts src/jobs/spot-drive-times.ts \
  src/jobs/usage-watch.ts tests/jobs/spot-liveness.test.ts \
  tests/jobs/spot-drive-times.test.ts
git commit -m "feat(spot): 폐업 감지·실주행 시간 (얇은 복사) + watch 감시 등록"
```

---

### Task 12: 주간 추천 잡 (suggest)

**Files:**
- Create: `src/jobs/spot-suggest.ts`
- Test: `tests/jobs/spot-suggest.test.ts`

**Interfaces:**
- Consumes: `hotScore`, `pickWeekendCandidates`, `mondayOf` (`pipeline/score.js`/
  `jobs/weekly-suggest.js`, 무변경 재사용), `spotFamilyFit` (Task 5),
  `passesGate` (`pipeline/gate.js`, 무변경 재사용), `spotDriveMinutesOf`
  (Task 11), `SpotStore` (Task 2)
- Produces: `runSpotWeeklySuggest(deps, opts)`

`jobs/restaurant-suggest.ts` 전체를 그대로 복사해 `restaurantFamilyFit`→
`spotFamilyFit`(Task 5), `restaurantDriveMinutesOf`→`spotDriveMinutesOf`
(Task 11), `readRestaurants`→`readSpots`, `readRestaurantSuggestions/
writeRestaurantSuggestions`→`readSpotSuggestions/writeSpotSuggestions`로
바꾼다. `familyFit` 호출의 `hasRoom: a.hasRoom, reservable: a.reservable`
자리를 `hasKidsTag: r.tags.includes('아이와 가기 좋은 곳')`로 바꾼다.
**`hotScore`·`passesGate`·`pickWeekendCandidates`·`mondayOf`는 무변경
재사용** — 전부 이미 도메인 무관.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/jobs/spot-suggest.test.ts
import { describe, it, expect } from 'vitest'
import { runSpotWeeklySuggest } from '../../src/jobs/spot-suggest.js'

describe('runSpotWeeklySuggest', () => {
  it('게이트를 통과한 active 장소를 점수순으로 뽑는다', async () => {
    const now = new Date('2026-09-02')
    const spots = [{
      kakaoPlaceId: '1', name: '아무개공원', sigungu: '부평구', lat: 37.5, lng: 126.7,
      driveMinutes: 20, firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active' as const,
      ambiguousName: false, tags: ['자연/공원', '아이와 가기 좋은 곳'],
      attributes: {
        tags: ['자연/공원', '아이와 가기 좋은 곳'] as const, evidence: 'e',
        parkingGrade: 'A' as const, parkingEvidence: 'p', stayDuration: '1~2시간',
        indoorOutdoor: 'outdoor' as const, season: null, teenAppeal: 3, confidence: 0.8,
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
        readSpots: async () => spots,
        readSpotBuzz: async () => buzz,
        readVisits: async () => [],
        readSpotSuggestions: async () => [],
        writeSpotSuggestions: async () => {},
      },
      now,
    }
    const { picked } = await runSpotWeeklySuggest(deps as never)
    expect(picked).toHaveLength(1)
    expect(picked[0]!.kakaoPlaceId).toBe('1')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/jobs/spot-suggest.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/jobs/spot-suggest.ts
import { hotScore, pickWeekendCandidates } from '../pipeline/score.js'
import { spotFamilyFit } from '../pipeline/spot-score.js'
import { passesGate } from '../pipeline/gate.js'
import { spotDriveMinutesOf } from './spot-drive-times.js'
import { mondayOf } from './weekly-suggest.js'
import type { BuzzSnapshot, Suggestion } from '../schema.js'
import type { SpotStore } from '../store/spot-json-store.js'

export interface SpotSuggestDeps {
  store: Pick<
    SpotStore, 'readSpots' | 'readSpotBuzz' | 'readSpotSuggestions' | 'writeSpotSuggestions'
  >
  now?: Date
}

const KEEP_WEEKS = 12
const DEFAULT_COUNT = 20

export async function runSpotWeeklySuggest(
  deps: SpotSuggestDeps,
  opts: { count?: number; cityMode?: boolean } = {},
): Promise<{ picked: Suggestion[] }> {
  const { store, now = new Date() } = deps
  const count = opts.count ?? DEFAULT_COUNT
  const spots = await store.readSpots()
  const buzz = await store.readSpotBuzz()

  const latestBuzz = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latestBuzz.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latestBuzz.set(b.kakaoPlaceId, b)
  }

  const scored = spots.flatMap((s) => {
    if (s.status !== 'active') return []
    const a = s.attributes
    if (!a) return []
    if (!passesGate({ tags: s.tags, parkingGrade: a.parkingGrade }, opts).pass) return []
    const b = latestBuzz.get(s.kakaoPlaceId)
    if (!b) return []

    const hot = hotScore(b, now)
    const fit = spotFamilyFit(
      {
        driveMinutes: spotDriveMinutesOf(s) ?? 90,
        parkingGrade: a.parkingGrade,
        hasKidsTag: s.tags.includes('아이와 가기 좋은 곳'),
        lastVisitedOn: null,
        outdoorOnly: a.indoorOutdoor === 'outdoor',
        teenAppeal: a.teenAppeal ?? 2,
      },
      now,
    )

    return [{
      id: s.kakaoPlaceId, score: hot * fit, tags: s.tags, region: s.sigungu, hot, fit,
    }]
  })

  const picked = pickWeekendCandidates(scored, count)
  const weekOf = mondayOf(now)
  const rows: Suggestion[] = picked.map((p, i) => ({
    weekOf, kakaoPlaceId: p.id, rank: i + 1, finalScore: Number(p.score.toFixed(3)),
    reason: { hot: Number(p.hot.toFixed(1)), fit: Number(p.fit.toFixed(3)), tags: p.tags },
  }))

  const prev = await store.readSpotSuggestions()
  const kept = prev.filter((r) => r.weekOf !== weekOf).slice(-(KEEP_WEEKS * count))
  await store.writeSpotSuggestions([...kept, ...rows])
  return { picked: rows }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/jobs/spot-suggest.test.ts`
Expected: PASS

- [ ] **Step 5: 카페·식당 회귀 전량 확인**

Run: `npm test`
Expected: 모든 기존 테스트 그대로 통과

- [ ] **Step 6: 커밋**

```bash
git add src/jobs/spot-suggest.ts tests/jobs/spot-suggest.test.ts
git commit -m "feat(spot): 주간 추천 잡 (게이트·hotScore 는 재사용)"
```

---

### Task 13: CLI 연결

**Files:**
- Modify: `src/cli/run.ts` (파일 끝 `switch`문에 새 `case`만 추가)
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 8~12의 모든 `run*` 함수
- Produces: `npm run spot-discover`, `spot-buzz`, `spot-classify`,
  `spot-suggest`, `spot-liveness`, `spot-drive` CLI 명령

기존 `case 'restaurant-discover':` 등의 코드 모양을 그대로 따라 새 케이스를
추가한다. **기존 케이스는 한 글자도 안 건드린다.** `--pilot` 플래그도 식당
때와 같은 이유로 처음부터 넣는다 — 새로운 LLM 분류 작업이라 전체 지역을
한 번에 스캔하지 않는다(설계 문서 4절).

- [ ] **Step 1: 새 케이스 추가**

`src/cli/run.ts`의 기존 `case 'restaurant-drive':` 바로 다음, `default:`
바로 앞에 추가한다:

```typescript
case 'spot-discover': {
  const base = createContext()
  const ctx = {
    store: createSpotJsonStore(base.env.DATA_DIR),
    local: base.local,
    blog: base.blog,
    llm: base.llm,
  }
  // --pilot: 처음엔 가까운 시군구 5곳만 스캔한다 (파일럿 지역, 설계 문서 4절).
  const PILOT_SIGUNGU = ['부평구', '계양구', '서구', '김포시', '검단구']
  const regions = flag(rest, 'pilot') !== undefined
    ? REGIONS.filter((r) => !r.excluded && PILOT_SIGUNGU.includes(r.sigungu))
    : REGIONS.filter((r) => !r.excluded)
  const skipHarvest = flag(rest, 'skip-harvest') !== undefined
  console.log(`가볼 곳 발굴 시작 (${regions.length}개 지역)`)
  const r = await runSpotDiscover(ctx, { regions, skipHarvest })
  console.log(`  발굴 ${r.discovered}곳 · 동명지역 ${r.offRegion}곳`)
  break
}

case 'spot-buzz': {
  const base = createContext()
  const ctx = {
    store: createSpotJsonStore(base.env.DATA_DIR),
    blog: base.blog,
  }
  const limit = numFlag(rest, 'limit')
  const r = await runSpotDailyBuzz(ctx, { limit })
  console.log(`  갱신 ${r.updated}곳 · 실패 ${r.failed}곳 · 이미지 ${r.images}곳`)
  break
}

case 'spot-classify': {
  const base = createContext()
  const ctx = {
    store: createSpotJsonStore(base.env.DATA_DIR),
    blog: base.blog,
    llm: base.llm,
  }
  const limit = numFlag(rest, 'limit')
  const redoStale = flag(rest, 'redo') !== undefined
  const r = await runSpotClassify(ctx, { limit, redoStale })
  console.log(`  판정 ${r.classified}곳 · 제외 ${r.excluded}곳 · 실패 ${r.failed}곳`)
  if (r.quotaExhausted) console.log('  쿼터 소진으로 중단')
  break
}

case 'spot-suggest': {
  const base = createContext()
  const ctx = {
    store: createSpotJsonStore(base.env.DATA_DIR),
  }
  const r = await runSpotWeeklySuggest(ctx)
  console.log(`  후보 ${r.picked.length}곳 선정`)
  break
}

case 'spot-liveness': {
  const base = createContext()
  const ctx = {
    store: createSpotJsonStore(base.env.DATA_DIR),
    local: base.local,
  }
  const limit = numFlag(rest, 'limit')
  const r = await runSpotLiveness(ctx, { limit })
  console.log(`  확인 ${r.checked}곳 · 있음 ${r.seen} · 못 찾음 ${r.missing}`)
  if (r.stale.length) {
    console.log(`  폐업 의심 ${r.stale.length}곳:`)
    for (const s of r.stale.slice(0, 20)) console.log(`    ${s.sigungu} ${s.name} (${s.days}일)`)
  }
  break
}

case 'spot-drive': {
  const base = createContext()
  const ctx = {
    store: createSpotJsonStore(base.env.DATA_DIR),
    directions: base.directions,
  }
  const limit = numFlag(rest, 'limit')
  const force = flag(rest, 'force') !== undefined
  const r = await runSpotDriveTimes(ctx, { limit, force })
  console.log(`  측정 ${r.measured}곳 / 경로없음 ${r.unroutable}곳`)
  break
}
```

파일 위쪽 import 목록에 다음을 추가한다:

```typescript
import { createSpotJsonStore } from '../store/spot-json-store.js'
import { runSpotDiscover } from '../jobs/spot-discover.js'
import { runSpotDailyBuzz } from '../jobs/spot-daily-buzz.js'
import { runSpotClassify } from '../jobs/spot-classify.js'
import { runSpotWeeklySuggest } from '../jobs/spot-suggest.js'
import { runSpotLiveness } from '../jobs/spot-liveness.js'
import { runSpotDriveTimes } from '../jobs/spot-drive-times.js'
```

`default:`의 사용법 문자열에도 새 명령을 추가한다:

```typescript
default:
  die(
    '사용법: tsx src/cli/run.ts'
      + ' <discover|buzz|classify|label|drive|suggest|site|notify|visited|inspect|health|watch|audit|normalize|hide'
      + '|restaurant-discover|restaurant-buzz|restaurant-classify|restaurant-suggest'
      + '|restaurant-liveness|restaurant-drive'
      + '|spot-discover|spot-buzz|spot-classify|spot-suggest|spot-liveness|spot-drive>',
  )
```

**`MUTATING`에 6개를 전부 처음부터 넣는다** — 식당 1단계 때
`restaurant-liveness`를 빠뜨렸다가 최종 리뷰에서 뒤늦게 고쳤던 실수를
이번엔 계획 단계부터 반영한다:

```typescript
// src/cli/run.ts 의 MUTATING 을:
const MUTATING = new Set([
  'discover', 'buzz', 'classify', 'drive', 'suggest', 'visited', 'hide', 'label',
  'restaurant-discover', 'restaurant-buzz', 'restaurant-classify', 'restaurant-drive', 'restaurant-suggest',
  'restaurant-liveness',
])
// 다음으로 바꾼다:
const MUTATING = new Set([
  'discover', 'buzz', 'classify', 'drive', 'suggest', 'visited', 'hide', 'label',
  'restaurant-discover', 'restaurant-buzz', 'restaurant-classify', 'restaurant-drive', 'restaurant-suggest',
  'restaurant-liveness',
  'spot-discover', 'spot-buzz', 'spot-classify', 'spot-drive', 'spot-suggest', 'spot-liveness',
])
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 카페·식당 회귀 확인**

Run: `npm test`
Expected: 모든 기존 테스트 그대로 통과

- [ ] **Step 4: `package.json`에 npm 스크립트 추가**

```json
"spot-discover": "tsx --env-file-if-exists=.env src/cli/run.ts spot-discover",
"spot-buzz": "tsx --env-file-if-exists=.env src/cli/run.ts spot-buzz",
"spot-classify": "tsx --env-file-if-exists=.env src/cli/run.ts spot-classify",
"spot-suggest": "tsx --env-file-if-exists=.env src/cli/run.ts spot-suggest",
"spot-liveness": "tsx --env-file-if-exists=.env src/cli/run.ts spot-liveness",
"spot-drive": "tsx --env-file-if-exists=.env src/cli/run.ts spot-drive"
```

- [ ] **Step 5: 파일럿 지역으로 실제 실행 (수동 확인)**

Run: `npm run spot-discover -- --pilot` (실제 API 키 필요, 로컬 `.env`에
이미 있음)
Expected: `data/spots.json` 생성, 콘솔에 발굴 수 출력. 에러 없이 끝나면
성공.

- [ ] **Step 6: 커밋**

```bash
git add src/cli/run.ts package.json
git commit -m "feat(spot): CLI 명령 6종 연결 (MUTATING 에 처음부터 전부 등록)"
```

---

### Task 14: GitHub Actions 워크플로 6종

**Files:**
- Create: `.github/workflows/daily-buzz-spot.yml`
- Create: `.github/workflows/daily-classify-spot.yml`
- Create: `.github/workflows/weekly-discover-spot.yml`
- Create: `.github/workflows/weekly-drive-spot.yml`
- Create: `.github/workflows/weekly-liveness-spot.yml`
- Create: `.github/workflows/weekly-suggest-spot.yml`

**Interfaces:**
- Consumes: Task 13의 npm 스크립트, `scripts/commit-data.sh`(무변경 재사용)

식당의 최종 워크플로(`*-restaurant.yml`, 이미 `commit-data.sh`를 쓰고
`concurrency.group: data-write`를 카페와 공유하는 상태)를 그대로 복사해
`name`·`run`·주석·크론 시각만 바꾼다. **처음부터 공용 `data-write` 그룹과
`commit-data.sh`를 쓴다** — 식당 1단계 때는 별도 그룹과 직접 커밋 스텝으로
시작했다가 2단계에서 뒤늦게 통합해야 했던 시행착오를 이번엔 계획 단계부터
피한다(설계 문서 4절). 크론 시각은 카페·식당과 최소 30분 이상 띄운다.

- [ ] **Step 1: `daily-buzz-spot.yml` 작성**

```yaml
name: daily-buzz-spot
on:
  schedule:
    # 20:23 UTC. daily-buzz-restaurant(19:50 UTC)와 33분 차이 — 같은
    # data-write 그룹이라 실제 동시 실행은 안 되지만, npm ci 대기 시간을
    # 줄이려고 시각을 띄운다.
    - cron: '23 20 * * *'
  workflow_dispatch:

# data/ 를 쓰는 워크플로는 전부 하나씩 돈다 — 카페·식당과 같은 data-write
# 그룹을 공유한다 (daily-buzz-restaurant.yml 주석 참고. 세 도메인 모두
# web/src/generated/ 를 재생성으로 처리하므로 동시에 쓰면 서로의 결과를
# 덮어쓴다).
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
      - run: npm run spot-buzz
        env:
          KAKAO_REST_API_KEY: ${{ secrets.KAKAO_REST_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      # 커밋·푸시 규칙은 scripts/commit-data.sh 한 곳에 있다 — 카페·식당과 공용.
      - name: 데이터 커밋
        run: bash scripts/commit-data.sh "가볼 곳 화제량 갱신"
```

- [ ] **Step 2: `daily-classify-spot.yml` 작성**

```yaml
name: daily-classify-spot
on:
  schedule:
    # 22:29 UTC. daily-classify-restaurant(21:56 UTC)와 33분 차이.
    - cron: '29 22 * * *'
  workflow_dispatch:

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
      - run: npm run spot-classify -- --limit 200 --redo
        env:
          KAKAO_REST_API_KEY: ${{ secrets.KAKAO_REST_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - name: 데이터 커밋
        run: bash scripts/commit-data.sh "가볼 곳 판정 갱신"
```

- [ ] **Step 3: `weekly-discover-spot.yml` 작성 (파일럿 지역으로 시작)**

```yaml
name: weekly-discover-spot
on:
  schedule:
    # 일 20:43 UTC. weekly-discover-restaurant(일 20:10 UTC)와 33분 차이.
    - cron: '43 20 * * 0'
  workflow_dispatch:

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
      # 새로운 LLM 분류 작업(10개 다중 태그)이라 파일럿 지역(부평구·계양구·
      # 서구·김포시·검단구)부터 검증한다 — 식당 1단계 때와 같은 이유
      # (설계 문서 4절). 분류 정확도가 검증되면 --pilot 을 지운다.
      - run: npm run spot-discover -- --pilot
        env:
          KAKAO_REST_API_KEY: ${{ secrets.KAKAO_REST_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - name: 데이터 커밋
        run: bash scripts/commit-data.sh "가볼 곳 신규 발굴"
```

- [ ] **Step 4: `weekly-drive-spot.yml` 작성**

```yaml
name: weekly-drive-spot
on:
  schedule:
    # 토 23:19 UTC. weekly-drive-restaurant(토 22:46 UTC)와 33분 차이.
    - cron: '19 23 * * 6'
  workflow_dispatch:

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
      - run: npm run spot-drive -- --limit 2000
        env:
          KAKAO_REST_API_KEY: ${{ secrets.KAKAO_REST_API_KEY }}
          # 길찾기에 LLM 은 쓰지 않지만 환경변수 검증이 provider 키를 요구한다.
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - name: 데이터 커밋
        run: bash scripts/commit-data.sh "가볼 곳 실주행 시간"
```

- [ ] **Step 5: `weekly-liveness-spot.yml` 작성**

```yaml
name: weekly-liveness-spot
on:
  schedule:
    # 일 23:39 UTC. weekly-liveness-restaurant(일 23:06 UTC)와 33분 차이.
    - cron: '39 23 * * 0'
  workflow_dispatch:

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
      - run: npm run spot-liveness
        env:
          KAKAO_REST_API_KEY: ${{ secrets.KAKAO_REST_API_KEY }}
          # 길찾기와 같은 이유로 provider 키가 있어야 환경변수 검증을 통과한다
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - name: 데이터 커밋
        run: bash scripts/commit-data.sh "가볼 곳 실존 확인"
```

- [ ] **Step 6: `weekly-suggest-spot.yml` 작성**

```yaml
name: weekly-suggest-spot
on:
  schedule:
    # 목 20:53 UTC. weekly-suggest-restaurant(목 20:20 UTC)와 33분 차이.
    - cron: '53 20 * * 4'
  workflow_dispatch:

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
      - run: npm run spot-suggest
        env:
          KAKAO_REST_API_KEY: ${{ secrets.KAKAO_REST_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - name: 데이터 커밋
        run: bash scripts/commit-data.sh "가볼 곳 주말 후보"
```

- [ ] **Step 7: 로컬에서 워크플로 문법 확인**

Run: `cat .github/workflows/*-spot.yml` 로 육안 확인 — YAML 문법 오류가
없는지, 6개 파일 모두 `concurrency.group`이 `data-write`인지, 크론 시각이
서로/카페/식당과 겹치지 않는지 확인. (실제 실행은 GitHub Actions에서
스케줄대로 돌 때 확인된다 — 로컬에서 돌릴 수단이 없다.)

- [ ] **Step 8: 커밋**

```bash
git add .github/workflows/*-spot.yml
git commit -m "feat(spot): GitHub Actions 워크플로 6종 (파일럿 지역, 처음부터 data-write 그룹)"
```

- [ ] **Step 9: 푸시 전 최종 회귀 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 카페·식당 테스트 전부 통과, 타입 에러 없음. 이게 이 계획 전체의
마지막 안전장치다 — 여기서 하나라도 깨지면 푸시하지 않는다.

- [ ] **Step 10: 사용자 확인 후 푸시**

여기서 멈춘다. 사용자에게 "파일럿 지역(부평구·계양구·서구·김포시·검단구)
워크플로가 준비됐다, 수동 실행(`workflow_dispatch`)으로 한 번 테스트해볼지,
아니면 예약 스케줄이 도는 걸 기다릴지" 확인한 뒤 푸시한다.

---

## Self-Review 메모 (계획 작성자 기록)

- **스펙 커버리지**: 설계 문서 2절(카페·식당과 다른 점 표)의 항목 전부
  태스크로 매핑됨(검색어→Task 3, 관련성→Task 3, 제외목록→**의도적으로 없음**,
  분류축(다중 태그)→Task 1·4, 가족적합도 보너스→Task 5, 새 속성→Task 1·6,
  프롬프트→Task 6). 3절(데이터 구조)→Task 1·2. 4절(실행 방식·파일럿
  범위)→Task 13·14. 5절(테스트)→전 태스크에 내장. 6절(새 속성 범위, 로직은
  안 만든다)→Task 1(저장만)에 반영, 랭킹 로직 태스크 없음(의도됨). 7절(범위
  밖)은 이 계획에 태스크 없음(의도됨).
- **"카페·식당 영향 0" 검증 지점**: `buzz.ts`(Task 9)·`score.ts`(Task
  5)·`usage-watch.ts`(Task 11 Step 10)는 전부 **이미 완성된 가산적
  확장**(식당 1단계에서 끝남)을 가져다 쓰기만 하고 파일을 수정하지 않는다
  — 이번 계획에서 기존 파일을 실제로 수정하는 유일한 지점은 `cli/run.ts`
  (Task 13)와 `usage-watch.ts`(Task 11, 배열에 항목 추가)뿐이고, 둘 다 직후
  `npm test` 전량 통과를 스텝으로 못박아 뒀다.
- **타입 일관성**: `SpotStore`의 메서드 이름(`readSpots` 등)이 Task 2에서
  정의된 대로 Task 8~13 전체에서 동일하게 쓰였는지, `SpotAttributes.tags`가
  `string[]`이 아니라 `SpotTag[]`(Task 1) → `assignSpotTags`가 `string[]`을
  반환(Task 4, gate.ts 호환)하는 경계가 명확한지 재확인 완료.
- **식당 1단계 대비 태스크 수가 줄어든 이유**: (1) 블랙리스트·제외 목록이
  1차 범위 밖이라 별도 `spot-exclude.ts` 태스크가 없음. (2) `buzz.ts`의
  `isRelevant` 주입과 `score.ts`의 `PARKING_MULT` export가 식당 1단계에서
  이미 끝나 있어 이번엔 그 두 파일을 수정하는 태스크 자체가 없음(대신 Task
  5·9에서 "이미 되어 있다"는 사실만 명시). 둘 다 의도된 축소이지 누락이
  아니다.
