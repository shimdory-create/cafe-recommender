# 데이터 파이프라인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수도권 66개 시군구의 대형·특색 카페를 공식 API로 자동 수집하고, 5단 퍼널로 판정해 DB에 채운다. 동네 카페와 주차 불가 카페는 걸러진 상태로.

**Architecture:** 크롤링 없는 단방향 파이프라인. 소스 어댑터(카카오·네이버)가 원본 응답을 `raw_snapshots`에 그대로 적재하고, 순수 함수로 된 판정 레이어들이 그것을 읽어 태그·등급·점수를 산출한다. 판정 로직에 I/O가 없으므로 API 호출 없이 전부 단위 테스트되며, 점수 공식을 바꿔도 재수집 없이 재계산된다.

**Tech Stack:** Node 22+ / TypeScript(ESM) / vitest / zod / @supabase/supabase-js / @anthropic-ai/sdk (Haiku 4.5) / tsx / GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-19-cafe-recommender-design.md`

## Global Constraints

이 절의 요구사항은 **모든 태스크에 암묵적으로 포함**된다.

- **Node 22 이상**, TypeScript ESM (`"type": "module"`, import 경로에 `.js` 확장자 필수)
- **HTML 파싱 금지.** cheerio·jsdom·puppeteer·playwright를 의존성에 추가하지 않는다. 스펙 6.1절의 핵심 제약이다
- **판정 로직은 순수 함수.** `src/pipeline/` 의 `exclude` `buzz` `tag` `gate` `score` 는 I/O·`Date.now()`·전역 상태를 쓰지 않는다. 현재 시각은 항상 인자로 주입한다
- **원본 응답은 반드시 `raw_snapshots` 에 먼저 적재**한 뒤 파싱한다. 파싱 실패가 데이터 손실이 되지 않게 한다
- **카페 정규화 기준키는 `kakao_place_id`.** 상호명을 기준키로 쓰지 않는다
- **네이버 블로그 검색어는 항상 `"{시군구} {상호}"` 조합.** 상호 단독 검색 금지 (동명 카페 오염)
- **LLM 출력에 `evidence` 인용 필수.** 빈 문자열이면 검증 실패로 간주해 재시도한다
- **API 키는 `.env` 에서만 읽고 코드에 하드코딩하지 않는다.** `.gitignore` 에 이미 차단됨
- **레이트리밋:** 카카오 초당 10건, 네이버 초당 10건 상한. 429 응답에 지수 백오프
- **어떤 소스 실패도 파이프라인을 중단시키지 않는다.** `source_health` 에 기록하고 다음으로 넘어간다
- 테스트는 `vitest run` 으로 실행하며 **실제 외부 API를 호출하지 않는다.** 저장된 fixture만 사용한다
- 커밋 메시지는 한국어 본문 + Conventional Commits 프리픽스(`feat:` `test:` `fix:` `chore:` `docs:`)

## 스펙에서 정정한 사항

| 스펙 위치 | 원래 내용 | 정정 | 이유 |
|---|---|---|---|
| 7.6 Layer 1 | 상호 패턴 배제 `"OO점"` 지점 접미사 | **규칙 제거** | 테라로사 서종점·앤트러사이트 서교점처럼 우리가 가장 원하는 대형 지점을 잘라낸다. 명시적 블랙리스트만 사용 |
| 8.1 HotScore | `posts_30d` 를 그대로 사용 | **포화 보정 추가** | 네이버 블로그 API는 최대 100건만 반환한다. 초핫플은 상위 100건이 전부 30일 내에 들어와 가속도가 과소평가된다. 100건 포화 시 발행 간격으로 환산 |

Task 1 완료 후 스펙 파일에도 이 두 정정을 반영한다.

---

## 파일 구조

```
cafe/
  package.json                    Node 22 ESM, vitest, tsx
  tsconfig.json
  vitest.config.ts
  .env.example                    키 목록 (실제 값 없음)

  src/
    config/
      env.ts                      환경변수 zod 검증. 부평 좌표 기본값
      regions.ts                  수도권 66개 시군구 상수
      keywords.ts                 검색 키워드 6종 + 큐레이션 검색 패턴
    db/
      schema.sql                  DDL 전체
      client.ts                   Supabase 클라이언트 (서비스 롤)
      repositories.ts             cafes / snapshots / health 접근 함수
    sources/
      types.ts                    SourceAdapter 인터페이스, RawPayload
      rate-limiter.ts             초당 상한 + 지수 백오프
      kakao-local.ts              카카오 로컬 어댑터
      naver-blog.ts               네이버 블로그 어댑터
      health.ts                   source_health 기록·조회
    llm/
      client.ts                   Claude 클라이언트 + 구조화 출력 재시도
      schemas.ts                  zod 스키마 (추출 결과, 큐레이션 수확)
      prompts.ts                  프롬프트 2종
    pipeline/
      exclude.ts                  Layer 1 — 순수
      buzz.ts                     Layer 2 — 순수
      extract.ts                  Layer 3 — LLM 호출
      harvest.ts                  그물 C — 큐레이션 수확
      tag.ts                      Layer 4 — 순수
      gate.ts                     Layer 5 — 순수
      score.ts                    HotScore / FamilyFit — 순수
      geo.ts                      직선거리 + 이동시간 근사 — 순수
    jobs/
      weekly-discover.ts          그물 A·B·C -> Layer 1~5
      daily-buzz.ts               화제량 재수집 -> HotScore 갱신
    cli.ts                        조회용 CLI (파이프라인 결과 확인)

  tests/
    fixtures/                     실제 API 응답 저장본
      kakao-keyword-yangpyeong.json
      naver-blog-hot.json
      naver-blog-neighborhood.json
      naver-blog-saturated.json
      naver-blog-parking.json
    config/env.test.ts
    sources/rate-limiter.test.ts
    sources/kakao-local.test.ts
    sources/naver-blog.test.ts
    pipeline/exclude.test.ts
    pipeline/buzz.test.ts
    pipeline/tag.test.ts
    pipeline/gate.test.ts
    pipeline/score.test.ts
    pipeline/geo.test.ts
    llm/schemas.test.ts
    jobs/weekly-discover.test.ts

  scripts/
    capture-fixture.ts            실제 API 1회 호출 -> fixture 저장 (수동)

  .github/workflows/
    daily-buzz.yml
    weekly-discover.yml
```

**분해 원칙:** 판정 레이어를 파일 하나에 하나씩 두어 각각 독립 테스트한다. `pipeline/` 전체가 I/O 없는 순수 함수 모듈이라 `jobs/` 만 모킹하면 파이프라인 전체를 오프라인 검증할 수 있다.

---

## Task 0: 사전 준비 (사람이 직접 — 위임 불가)  [부분 완료]

코드가 없다. Task 5부터 실제 키가 필요하므로 그 전에 끝나 있어야 한다.
검증은 `scripts/check-keys.mjs` 가 담당한다 (커밋 `7bc1bfe`, `76188ef`).

- [x] **Step 1: Node 런타임 확인** — 완료

`v24.19.0` / npm `11.17.0` 설치 확인. 스펙 요구사항 Node 22+ 충족.
Machine PATH에 등록되어 있으나 **기존 셸 세션에는 반영되지 않는다.**
새 터미널을 열거나 세션에서 직접 추가한다.

```
$env:Path += ";C:\Program Files\nodejs"
```

- [x] **Step 2: 카카오 REST API 키** — 완료

1. https://developers.kakao.com 로그인 -> 내 애플리케이션 -> 애플리케이션 추가
2. 좌측 **[앱 설정] > 앱 키** -> **REST API 키** 복사 (네 개 중 세 번째)
3. 좌측 **[제품 설정] > 카카오맵** -> 활성화 설정 **ON**

**실측으로 확정된 사실 (추측 아님):**

| 항목 | 결론 | 근거 |
|---|---|---|
| 제품 설정 > 카카오맵 활성화 | **필수** | 미설정 시 403 `App(cafe) disabled OPEN_MAP_AND_LOCAL service.` |
| 앱 설정 > 플랫폼(Web 도메인) 등록 | **불필요** | 활성화만으로 200 응답 확인 |
| 심사·신청 절차 | **없음** | 토글 즉시 반영 |

- [ ] **Step 3: 네이버 검색 API 키**

1. https://developers.naver.com/apps/#/register
2. 애플리케이션 이름 `cafe`
3. **사용 API에서 [검색] 선택** — 누락하면 403
4. 비로그인 오픈 API 서비스 환경 -> **WEB 설정** -> `http://localhost:3000`
5. **Client ID** / **Client Secret** 복사

- [ ] **Step 4: Supabase 프로젝트 생성**

1. https://supabase.com -> New project, 이름 `cafe-recommender`
2. Database Password 생성 -> **따로 보관** (재확인 불가)
3. Region **Northeast Asia (Seoul)**
4. Project Settings > API 에서 **Project URL** 과 **service_role** 키 복사
   (`anon` 이 아니다. service_role 은 RLS를 우회하므로 배치 전용으로만 쓰고
   브라우저로 내려보내지 않는다 — 스펙 11절)

무료 티어는 1주 미사용 시 일시정지된다. 일일 배치가 있으므로 활성 유지된다.

- [ ] **Step 5: Anthropic API 키**

1. https://console.anthropic.com -> API Keys -> Create Key
2. 결제 수단 등록 + 크레딧 충전
3. 키는 생성 직후 한 번만 표시된다

- [ ] **Step 6: `.env` 채우고 전체 검증**

`.env` 는 이미 생성되어 있고 `.gitignore:13` 으로 차단 확인됨.

```
node scripts/check-keys.mjs
```

4개 모두 `[v]` 가 되면 Task 1로 넘어간다. 실패 시 스크립트가 401(키 오류)과
403(권한 오류)을 구분해 서버 원문 메시지까지 출력한다.

- [ ] **Step 7: 카카오 키 재발급 (마무리 정리)**

Task 0 진행 중 카카오 REST API 키가 대화 기록에 노출되었다. 장소 검색
전용이고 과금·개인정보 접근이 없어 위험도는 낮지만, 파이프라인 완성 후
콘솔에서 재발급하고 `.env` 를 갱신한다.

---

## Task 1: 프로젝트 부트스트랩 + 환경변수 검증

> API 키가 없어도 진행 가능하다. Task 0과 병렬로 착수할 수 있다.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/config/env.ts`
- Test: `tests/config/env.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `type Env` — 검증된 환경변수 객체
  - `loadEnv(source?: Record<string, string | undefined>): Env` — 실패 시 어떤
    키가 문제인지 메시지에 담아 `throw`. 인자를 주입할 수 있으므로 테스트가
    `process.env` 를 건드리지 않는다

- [ ] **Step 1: 스캐폴딩 생성**

```bash
npm init -y
npm pkg set name=cafe-recommender private=true type=module
npm pkg set engines.node=">=22"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.check-keys="node scripts/check-keys.mjs"
npm pkg set scripts.check-schema="node scripts/check-schema.mjs"
npm i zod @supabase/supabase-js @anthropic-ai/sdk
npm i -D typescript @types/node vitest tsx
```

버전을 고정하지 않는다. 설치 시점의 최신을 쓰고 재현성은 lockfile이 보장한다.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src", "tests", "scripts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/config/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadEnv } from '../../src/config/env.js'

const valid = {
  KAKAO_REST_API_KEY: 'k',
  NAVER_CLIENT_ID: 'n',
  NAVER_CLIENT_SECRET: 's',
  ANTHROPIC_API_KEY: 'a',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'r',
}

describe('loadEnv', () => {
  it('유효한 값을 통과시킨다', () => {
    expect(loadEnv(valid).KAKAO_REST_API_KEY).toBe('k')
  })

  it('출발지 좌표를 부평 기본값으로 채운다', () => {
    const env = loadEnv(valid)
    expect(env.HOME_LAT).toBeCloseTo(37.5074, 4)
    expect(env.HOME_LNG).toBeCloseTo(126.7218, 4)
  })

  it('좌표를 문자열로 주면 숫자로 변환한다', () => {
    const env = loadEnv({ ...valid, HOME_LAT: '37.1', HOME_LNG: '127.2' })
    expect(env.HOME_LAT).toBeCloseTo(37.1, 4)
  })

  it('키가 빠지면 어떤 키가 문제인지 메시지에 담아 실패한다', () => {
    const { KAKAO_REST_API_KEY: _omit, ...rest } = valid
    expect(() => loadEnv(rest)).toThrow(/KAKAO_REST_API_KEY/)
  })

  it('빈 문자열도 누락으로 취급한다', () => {
    expect(() => loadEnv({ ...valid, NAVER_CLIENT_SECRET: '' }))
      .toThrow(/NAVER_CLIENT_SECRET/)
  })

  it('SUPABASE_URL 이 URL 형식이 아니면 실패한다', () => {
    expect(() => loadEnv({ ...valid, SUPABASE_URL: 'not-a-url' }))
      .toThrow(/SUPABASE_URL/)
  })
})
```

- [ ] **Step 3: 테스트가 실패하는 것을 확인**

Run: `npx vitest run tests/config/env.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/config/env.js"`

- [ ] **Step 4: 최소 구현**

`src/config/env.ts`:

```ts
import { z } from 'zod'

const EnvSchema = z.object({
  KAKAO_REST_API_KEY: z.string().min(1),
  NAVER_CLIENT_ID: z.string().min(1),
  NAVER_CLIENT_SECRET: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // 출발지: 인천 부평
  HOME_LAT: z.coerce.number().default(37.5074),
  HOME_LNG: z.coerce.number().default(126.7218),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  // 빈 문자열은 "미설정"으로 취급한다. .env 에 KEY= 만 남은 흔한 실수를
  // zod 의 min(1) 이 잡도록 undefined 로 바꿔 넘긴다.
  const cleaned: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(source)) {
    cleaned[k] = v === '' ? undefined : v
  }

  const parsed = EnvSchema.safeParse(cleaned)
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`환경변수 오류 — 확인 필요: ${keys}`)
  }
  return parsed.data
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/config/env.test.ts`

Expected: PASS (6 tests)

이어서 `npm run typecheck` 가 오류 없이 끝나는 것도 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/config/env.ts tests/config/env.test.ts
git commit -m "feat: 프로젝트 부트스트랩과 환경변수 검증"
```

커밋 메시지 본문:

```
zod 로 키 6종을 검증하고 부평 좌표를 기본값으로 채운다.
loadEnv 는 source 를 주입받으므로 테스트가 process.env 를 오염시키지 않는다.
빈 문자열을 미설정으로 취급해 ".env 에 KEY= 만 남은" 흔한 실수를 잡는다.
```

---

## Task 2: DB 스키마 적용 + Supabase 클라이언트

> Task 0 Step 4(Supabase 프로젝트 생성)가 끝나야 진행 가능하다.

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/client.ts`
- Create: `scripts/check-schema.mjs`

**Interfaces:**
- Consumes: `loadEnv` (Task 1)
- Produces: `getDb(): SupabaseClient` — service_role 로 인증된 싱글턴

**설계 노트:** 마이그레이션 프레임워크를 도입하지 않는다. 스키마 변경이 연
몇 회인 4인용 프로젝트에서 프레임워크는 순수한 유지보수 부담이다.
`schema.sql` 이 단일 진실 원천이고 Supabase SQL Editor 에 붙여 적용한다.
`check-schema.mjs` 가 적용 여부를 검증하므로 "적용했다고 착각"이 생기지 않는다.

- [ ] **Step 1: 스키마 작성**

`src/db/schema.sql` — 스펙 9절(v2) 그대로. `if not exists` 로 재실행 안전하게.

```sql
-- ===== 파이프라인이 쓰고 웹이 읽는다 =========================

create table if not exists cafes (
  id                uuid primary key default gen_random_uuid(),
  kakao_place_id    text unique not null,
  name              text not null,
  road_address      text,
  address           text,
  sigungu           text not null,
  lat               double precision not null,
  lng               double precision not null,
  category_name     text,
  kakao_place_url   text,
  naver_map_url     text,
  phone             text,
  straight_km       double precision,
  drive_minutes_est integer,
  first_seen_at     timestamptz not null default now(),
  status            text not null default 'active'
    check (status in ('active','hidden','excluded_auto','pending_extraction')),
  exclude_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists cafes_status_idx  on cafes (status);
create index if not exists cafes_sigungu_idx on cafes (sigungu);

create table if not exists cafe_attributes (
  cafe_id            uuid primary key references cafes(id) on delete cascade,
  scale              text    check (scale in ('대형','중형','소형')),
  seats_estimate     integer,
  floors             integer,
  has_bakery         boolean,
  bread_baked_onsite boolean,
  bakery_signal      text,
  menu_level         integer check (menu_level between 1 and 3),
  meal_types         text[],
  signature_menu     text,
  view_strength      integer check (view_strength between 0 and 5),
  view_types         text[],
  outdoor_seating    boolean,
  parking_grade      text    check (parking_grade in ('A','B','C','D','?')),
  parking_evidence   text,
  photo_spot         integer check (photo_spot between 0 and 5),
  teen_appeal        integer check (teen_appeal between 0 and 5),
  stay_duration      text,
  confidence         numeric,
  evidence           text    not null,
  extracted_at       timestamptz not null default now(),
  model_version      text    not null
);

create table if not exists cafe_tags (
  cafe_id uuid references cafes(id) on delete cascade,
  tag     text not null,
  primary key (cafe_id, tag)
);
create index if not exists cafe_tags_tag_idx on cafe_tags (tag);

create table if not exists buzz_snapshots (
  id               bigserial primary key,
  cafe_id          uuid references cafes(id) on delete cascade,
  captured_at      date not null,
  total_posts      integer,
  posts_30d        numeric,
  posts_90d        integer,
  saturated        boolean not null default false,
  first_post_date  date,
  latest_post_date date,
  buzz_volume      numeric,
  acceleration     numeric,
  unique (cafe_id, captured_at)
);

create table if not exists raw_snapshots (
  id         bigserial primary key,
  source     text not null,
  query      text,
  cafe_id    uuid references cafes(id) on delete set null,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);
create index if not exists raw_snapshots_source_idx
  on raw_snapshots (source, fetched_at desc);

create table if not exists franchise_blacklist (
  id         bigserial primary key,
  pattern    text not null,
  match_type text not null default 'contains'
    check (match_type in ('contains','exact','regex')),
  note       text
);

create table if not exists suggestions (
  id          bigserial primary key,
  week_of     date not null,
  cafe_id     uuid references cafes(id) on delete cascade,
  rank        integer not null,
  final_score numeric,
  reason_json jsonb,
  created_at  timestamptz not null default now(),
  unique (week_of, rank)
);

-- ===== 유일한 쓰기 대상 (익명) ===============================

create table if not exists visits (
  id         bigserial primary key,
  cafe_id    uuid references cafes(id) on delete cascade,
  visited_on date not null,
  created_at timestamptz not null default now(),
  unique (cafe_id, visited_on)
);

-- ===== 운영 도구 (전부 CLI) =================================

create table if not exists golden_labels (
  id            bigserial primary key,
  cafe_id       uuid references cafes(id) on delete cascade,
  verdict       text not null check (verdict in ('O','X','UNKNOWN')),
  reject_reason text check (reject_reason in
    ('neighborhood','parking','too_small','too_far','taste')),
  stratum       text not null
    check (stratum in ('top','mid','boundary','rejected')),
  model_version text,
  labeled_at    timestamptz not null default now(),
  unique (cafe_id, model_version)
);

create table if not exists moderation_actions (
  id         bigserial primary key,
  cafe_id    uuid references cafes(id) on delete cascade,
  action     text not null,
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists source_health (
  source               text primary key,
  last_success_at      timestamptz,
  last_error           text,
  consecutive_failures integer not null default 0,
  updated_at           timestamptz not null default now()
);

create table if not exists kakao_tokens (
  id                bigserial primary key,
  label             text unique not null,
  refresh_token_enc text not null,
  scopes            text[],
  linked_at         timestamptz not null default now(),
  last_sent_at      timestamptz
);
```

`cafe_attributes.evidence` 를 `not null` 로 걸었다. **인용 없는 LLM 출력이
DB에 들어오는 것을 스키마 수준에서 막는다** (스펙 Layer 3).

- [ ] **Step 2: Supabase SQL Editor 에서 적용**

Supabase 대시보드 > SQL Editor > New query 에 `src/db/schema.sql` 전체를
붙여넣고 Run. `if not exists` 라서 여러 번 실행해도 안전하다.

- [ ] **Step 3: 적용 검증 스크립트 작성**

`scripts/check-schema.mjs` — 의존성 없이 REST 로 각 테이블을 0건 조회한다.
없는 테이블은 Supabase 가 404 를 준다.

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter((m) => m !== null)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
)

const TABLES = [
  'cafes', 'cafe_attributes', 'cafe_tags', 'buzz_snapshots',
  'raw_snapshots', 'franchise_blacklist', 'suggestions', 'visits',
  'golden_labels', 'moderation_actions', 'source_health', 'kakao_tokens',
]

const base = env.SUPABASE_URL.replace(/\/+$/, '')
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
}

console.log('\n  스키마 검증\n  ' + '-'.repeat(46))
let missing = 0
for (const t of TABLES) {
  const res = await fetch(`${base}/rest/v1/${t}?select=*&limit=0`, { headers })
  if (!res.ok) missing++
  console.log(`  [${res.ok ? 'v' : 'X'}]  ${t}${res.ok ? '' : `  (HTTP ${res.status})`}`)
}
console.log('  ' + '-'.repeat(46))
console.log(missing === 0
  ? `  ${TABLES.length}개 테이블 모두 확인.\n`
  : `  ${missing}개 누락. schema.sql 을 SQL Editor 에서 실행하세요.\n`)
process.exitCode = missing === 0 ? 0 : 1
```

- [ ] **Step 4: 검증 실행**

Run: `node scripts/check-schema.mjs`

Expected: 12개 테이블 모두 `[v]`

- [ ] **Step 5: 클라이언트 작성**

`src/db/client.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from '../config/env.js'

let cached: SupabaseClient | undefined

export function getDb(): SupabaseClient {
  if (cached) return cached
  const env = loadEnv()
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
```

세션을 유지하지 않는다. 배치는 매 실행마다 새로 시작하므로, 토큰 갱신
타이머가 살아남아 프로세스 종료를 막는 것을 피한다.

- [ ] **Step 6: 커밋**

```bash
git add src/db/schema.sql src/db/client.ts scripts/check-schema.mjs
git commit -m "feat: DB 스키마 12개 테이블과 Supabase 클라이언트"
```

커밋 메시지 본문:

```
마이그레이션 프레임워크를 쓰지 않는다. 스키마 변경이 연 몇 회인
4인용 프로젝트에서 프레임워크는 순수한 유지보수 부담이다.
schema.sql 이 단일 진실 원천이고 if not exists 로 재실행 안전하다.
check-schema.mjs 가 적용 여부를 검증하므로 착각이 생기지 않는다.

cafe_attributes.evidence 를 not null 로 걸어 인용 없는 LLM 출력이
DB에 들어오지 못하게 한다 (스펙 Layer 3).
```

---

## Task 3: 지역·키워드 상수 + 거리 계산 (순수 함수)

> API 키가 없어도 진행 가능하다. Task 1 직후 바로 착수할 수 있다.

**Files:**
- Create: `src/config/regions.ts`
- Create: `src/config/keywords.ts`
- Create: `src/pipeline/geo.ts`
- Test: `tests/config/regions.test.ts`, `tests/pipeline/geo.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 상수·함수)
- Produces:
  - `type Sido = '서울' | '인천' | '경기'`
  - `interface Region { sido: Sido; sigungu: string; excluded?: string }`
  - `REGIONS: Region[]` — 66개 전체
  - `scanTargets(): Region[]` — `excluded` 없는 지역만
  - `SEARCH_KEYWORDS: readonly string[]` — 그물 A 키워드 6종
  - `curationQueries(sigungu: string): string[]` — 그물 C 검색어
  - `CATEGORY_GROUP_CODES: readonly string[]` — 그물 B 코드
  - `interface LatLng { lat: number; lng: number }`
  - `HOME: LatLng` — 부평
  - `haversineKm(a: LatLng, b: LatLng): number`
  - `estimateDriveMinutes(straightKm: number): number`

**계획 단계에서 발견한 스펙 정정:** 인천 **옹진군은 여객선으로만 접근**한다.
차량 나들이 대상이 될 수 없으므로 목록에는 두되 `excluded` 로 표시해 스캔에서
빼고, 실제 스캔 대상은 **65개**가 된다. 스펙 5절의 "66개 시군구"는 행정구역
수이고 스캔 대상은 65개임을 `regions.ts` 주석에 남긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/config/regions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { REGIONS, scanTargets } from '../../src/config/regions.js'

describe('REGIONS', () => {
  it('수도권 66개 시군구를 담는다', () => {
    expect(REGIONS).toHaveLength(66)
  })

  it('시도별 개수가 행정구역과 일치한다', () => {
    const count = (sido: string) => REGIONS.filter((r) => r.sido === sido).length
    expect(count('서울')).toBe(25)
    expect(count('인천')).toBe(10)
    expect(count('경기')).toBe(31)
  })

  it('시군구 이름에 중복이 없다', () => {
    const names = REGIONS.map((r) => `${r.sido} ${r.sigungu}`)
    expect(new Set(names).size).toBe(names.length)
  })

  it('옹진군은 여객선 전용이므로 스캔에서 제외한다', () => {
    const ongjin = REGIONS.find((r) => r.sigungu === '옹진군')
    expect(ongjin?.excluded).toMatch(/여객선/)
    expect(scanTargets().some((r) => r.sigungu === '옹진군')).toBe(false)
  })

  it('스캔 대상은 65개다', () => {
    expect(scanTargets()).toHaveLength(65)
  })
})
```

`tests/pipeline/geo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { haversineKm, estimateDriveMinutes, HOME } from '../../src/pipeline/geo.js'

describe('haversineKm', () => {
  it('같은 지점은 0이다', () => {
    expect(haversineKm(HOME, HOME)).toBeCloseTo(0, 6)
  })

  it('부평 -> 양평 직선거리가 60~70km 다', () => {
    // 양평역 근사 좌표. 도로거리 약 80km, 직선거리는 약 65km.
    const km = haversineKm(HOME, { lat: 37.4923, lng: 127.4897 })
    expect(km).toBeGreaterThan(60)
    expect(km).toBeLessThan(70)
  })

  it('부평 -> 강화 직선거리가 양평보다 짧다', () => {
    const ganghwa = haversineKm(HOME, { lat: 37.7473, lng: 126.4878 })
    const yangpyeong = haversineKm(HOME, { lat: 37.4923, lng: 127.4897 })
    expect(ganghwa).toBeLessThan(yangpyeong)
  })

  it('대칭이다', () => {
    const a = { lat: 37.5, lng: 127.0 }
    const b = { lat: 37.9, lng: 127.4 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9)
  })
})

describe('estimateDriveMinutes', () => {
  it('직선거리에 우회계수 1.35 와 60km/h 를 적용한다', () => {
    // 60km * 1.35 = 81km, 60km/h -> 81분
    expect(estimateDriveMinutes(60)).toBe(81)
  })

  it('0km 는 0분이다', () => {
    expect(estimateDriveMinutes(0)).toBe(0)
  })

  it('단조 증가한다', () => {
    expect(estimateDriveMinutes(30)).toBeLessThan(estimateDriveMinutes(35))
  })
})
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인**

Run: `npx vitest run tests/config/regions.test.ts tests/pipeline/geo.test.ts`

Expected: FAIL — 두 모듈 모두 import 해결 실패

- [ ] **Step 3: 구현**

`src/config/regions.ts`:

```ts
export type Sido = '서울' | '인천' | '경기'

export interface Region {
  sido: Sido
  sigungu: string
  /** 값이 있으면 스캔 대상에서 제외한다. 문자열은 그 이유. */
  excluded?: string
}

// 수도권 66개 행정구역 (서울 25 + 인천 10 + 경기 31).
// 이 중 옹진군은 여객선으로만 접근하므로 실제 스캔 대상은 65개다.
export const REGIONS: Region[] = [
  // --- 서울 25구 ---
  ...['종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구',
      '강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구',
      '구로구','금천구','영등포구','동작구','관악구','서초구','강남구','송파구',
      '강동구']
    .map((sigungu): Region => ({ sido: '서울', sigungu })),

  // --- 인천 8구 2군 ---
  ...['중구','동구','미추홀구','연수구','남동구','부평구','계양구','서구','강화군']
    .map((sigungu): Region => ({ sido: '인천', sigungu })),
  { sido: '인천', sigungu: '옹진군', excluded: '여객선으로만 접근 — 차량 나들이 불가' },

  // --- 경기 31시군 ---
  ...['수원시','성남시','의정부시','안양시','부천시','광명시','평택시','동두천시',
      '안산시','고양시','과천시','구리시','남양주시','오산시','시흥시','군포시',
      '의왕시','하남시','용인시','파주시','이천시','안성시','김포시','화성시',
      '광주시','양주시','포천시','여주시','연천군','가평군','양평군']
    .map((sigungu): Region => ({ sido: '경기', sigungu })),
]

/** 실제로 API 스캔을 돌릴 지역. excluded 가 붙은 곳은 뺀다. */
export function scanTargets(): Region[] {
  return REGIONS.filter((r) => !r.excluded)
}
```

서울 중구와 인천 중구가 둘 다 존재한다. 그래서 중복 검사 테스트가
`sido + sigungu` 조합으로 되어 있다. 검색어를 만들 때도 시군구 단독으로는
모호하므로 **그물 A/C 는 시도명을 함께 붙인다** (Task 5 참조).

`src/config/keywords.ts`:

```ts
/**
 * 그물 A — 카카오 키워드 검색어.
 * "{시도} {시군구} {키워드}" 로 조합한다.
 */
export const SEARCH_KEYWORDS = [
  '베이커리카페',
  '대형카페',
  '브런치카페',
  '루프탑카페',
  '정원카페',
  '뷰맛집카페',
] as const

/**
 * 그물 C — 블로그 큐레이션 수확용 검색어.
 * 블로거가 이미 손으로 큐레이션한 "BEST N" 류 글을 노린다.
 * 동네 카페는 이런 글에 등장하지 않는다.
 */
export function curationQueries(regionLabel: string): string[] {
  return [
    `${regionLabel} 대형카페 추천`,
    `${regionLabel} 베이커리카페 뷰`,
    `${regionLabel} 카페 베스트`,
  ]
}

/** 그물 B — 카카오 카테고리 그룹 코드. CE7 = 카페. */
export const CATEGORY_GROUP_CODES = ['CE7'] as const
```

`src/pipeline/geo.ts`:

```ts
export interface LatLng {
  lat: number
  lng: number
}

/** 출발지: 인천 부평. 순수 함수를 유지하기 위해 상수로도 둔다. */
export const HOME: LatLng = { lat: 37.5074, lng: 126.7218 }

const EARTH_RADIUS_KM = 6371

const toRad = (deg: number) => (deg * Math.PI) / 180

/** 두 좌표 사이 대권거리(km). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 우회계수. 실제 도로는 직선보다 길다. 수도권 평균 근사값. */
const DETOUR_FACTOR = 1.35
/** 평균 주행속도(km/h). 시내·외곽 혼합 기준. */
const AVG_SPEED_KMH = 60

/**
 * 직선거리에서 차량 소요시간(분)을 근사한다.
 * 스펙 8.2절: 1차 범위에서는 실측 경로 API 를 쓰지 않는다.
 * 후보로 확정된 카페만 나중에 1회 실측해 영구 캐싱한다.
 */
export function estimateDriveMinutes(straightKm: number): number {
  return Math.round(((straightKm * DETOUR_FACTOR) / AVG_SPEED_KMH) * 60)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/config/regions.test.ts tests/pipeline/geo.test.ts`

Expected: PASS (8 tests)

검산: 부평 -> 양평 직선 약 65km, x1.35 = 약 88km, 60km/h 로 약 88분.
스펙 10.2절 예시의 "양평 80분" 과 대략 맞는다. 근사가 과대추정 쪽으로
치우치는 편이 안전하다 — 예상보다 가까운 것이 예상보다 먼 것보다 낫다.

- [ ] **Step 5: 커밋**

```bash
git add src/config/regions.ts src/config/keywords.ts src/pipeline/geo.ts tests/config/regions.test.ts tests/pipeline/geo.test.ts
git commit -m "feat: 수도권 66개 시군구 상수와 거리 근사 함수"
```

커밋 메시지 본문:

```
옹진군은 여객선으로만 접근하므로 excluded 로 표시했다.
행정구역은 66개, 실제 스캔 대상은 65개다.

서울 중구와 인천 중구가 동명이므로 중복 검사와 검색어 조합 모두
시도명을 포함한다.

거리는 haversine 직선거리에 우회계수 1.35, 평균 60km/h 를 적용해
근사한다. 실측 경로 API 는 스펙 8.2절대로 1차 범위에서 제외했다.
geo.ts 는 I/O 없는 순수 함수라 오프라인 단위 테스트가 된다.
```

---
