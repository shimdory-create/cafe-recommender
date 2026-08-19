# 데이터 파이프라인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수도권 66개 시군구의 대형·특색 카페를 공식 API로 자동 수집하고, 5단 퍼널로 판정해 DB에 채운다. 동네 카페와 주차 불가 카페는 걸러진 상태로.

**Architecture:** 크롤링 없는 단방향 파이프라인. 소스 어댑터(카카오·네이버)가 원본 응답을 `raw_snapshots`에 그대로 적재하고, 순수 함수로 된 판정 레이어들이 그것을 읽어 태그·등급·점수를 산출한다. 판정 로직에 I/O가 없으므로 API 호출 없이 전부 단위 테스트되며, 점수 공식을 바꿔도 재수집 없이 재계산된다.

**Tech Stack:** Node 22+ / TypeScript(ESM) / vitest / zod / @supabase/supabase-js / @anthropic-ai/sdk (Haiku 4.5) / tsx / GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-19-cafe-recommender-design.md`

## Global Constraints

이 절의 요구사항은 **모든 태스크에 암묵적으로 포함**된다.

**런타임·언어**
- **Node 22 이상**, TypeScript ESM (`"type": "module"`, import 경로에 `.js` 확장자 필수)
- 테스트는 `vitest run`. **실제 외부 API를 호출하지 않는다.** 저장된 fixture만 사용

**절대 금지**
- **HTML 파싱 금지.** cheerio·jsdom·puppeteer·playwright 를 의존성에 넣지 않는다 (스펙 6.1)
- **LLM 모델 별칭(`*-latest`) 금지.** 버전을 고정하고 `modelVersion` 에 기록한다
  (실측에서 `gemini-flash-latest` 가 HTTP 503 반환)
- **API 키 하드코딩 금지.** `.env` 에서만 읽는다

**아키텍처**
- **판정 로직은 순수 함수.** `src/pipeline/` 의 `exclude` `relevance` `buzz` `tag`
  `gate` `score` `geo` 는 I/O·`Date.now()`·전역 상태를 쓰지 않는다.
  현재 시각은 **항상 인자로 주입**한다
- **원본 응답은 반드시 `data/raw/` 에 먼저 적재**한 뒤 파싱한다
- **LLM 은 provider-agnostic.** `src/llm/types.ts` 인터페이스 뒤에 두고
  `.env` 의 `LLM_PROVIDER` 로 Gemini <-> Anthropic 을 바꾼다
- **저장소는 `src/store/` 인터페이스 뒤에.** 나중에 DB로 옮길 수 있는 경계

**데이터 규칙**
- **정규화 기준키는 `kakaoPlaceId`.** 상호명을 기준키로 쓰지 않는다
- **카카오 블로그 검색어는 항상 `"{시군구} {상호}"` 조합.** 상호 단독 금지
- **Layer 2 관련성 판정은 두 조건을 모두 요구한다** — 상호명 포함 **AND**
  카페 문맥어(카페/베이커리/커피/빵/디저트/브런치) 하나 이상 포함
- **`evidence` 는 빈 문자열 금지.** zod 스키마가 거부하고 재시도한다
- **DB 없음.** `data/*.json` + zod. 스키마는 `src/schema.ts` 가 단일 진실 원천

**운영**
- 레이트리밋: 카카오 초당 10건 상한, 429 에 지수 백오프
- **어떤 소스 실패도 파이프라인을 중단시키지 않는다.** `data/health.json` 에
  기록하고 다음으로 넘어간다
- 데이터 커밋은 **`data:` 프리픽스**로 코드 커밋과 구분한다
- 코드 커밋은 Conventional Commits (`feat:` `test:` `fix:` `chore:` `docs:`) + 한국어 본문

## 스펙에서 정정한 사항

계획을 쓰면서, 그리고 Task 0 실측에서 발견한 것들. 전부 스펙에 반영 완료.

| 스펙 위치 | 원래 | 정정 | 근거 |
|---|---|---|---|
| 7.6 Layer 1 | `"OO점"` 지점 접미사 배제 | **규칙 폐기** | 테라로사 서종점·앤트러사이트 서교점처럼 우리가 가장 원하는 대형 지점을 잘라낸다 |
| 6.3 데이터 소스 | 네이버 검색 API 무료 25,000/일 | **카카오 블로그 검색** | 네이버가 2026-06-25 NCP 로 이관. 신규 발급 불가 (실측) |
| Layer 2 | `log10(total_posts)` | **문서 직접 검증** | `total_count` 는 OR 매칭. 없는 카페도 3,434건 (실측) |
| 8.1 HotScore | `precision` 미사용 | **전체 승수로 곱함** | 컷만 쓰면 경계선 위 오염 카페가 만점을 받는다 |
| 5절 지역 | 66개 시군구 스캔 | **65개 스캔** | 인천 옹진군은 여객선 전용. 차량 나들이 불가 |
| 9·11절 | Supabase | **JSON in git** | 쓰기가 0개로 줄어 DB가 존재 이유를 잃음 |

**아직 확인 안 된 것 (Task 6 에서 처리):** 카카오 **블로그 검색** API 의 일일
쿼터. 로컬 API 는 10만/일로 확인됐으나 검색 API 는 별도 쿼터일 수 있다.
어댑터의 상한값에 반영해야 한다.

## 파일 구조

```
cafe/
  package.json  tsconfig.json  vitest.config.ts  .env.example

  data/                         # 저장소. git 에 커밋된다
    cafes.json                  카페 마스터 + 판정 결과
    buzz.json                   화제량 시계열 (180일 롤링)
    suggestions.json            주간 후보 3곳 (12주)
    visits.json                 방문 기록 — CLI 만 쓴다
    golden.json                 골든셋 O/X 라벨
    blacklist.json              프랜차이즈 블랙리스트
    health.json                 소스 상태
    raw/YYYY-MM-DD/*.json       원본 응답 (재계산·fixture, 90일 정리)

  src/
    schema.ts                   zod 스키마 전체 — 단일 진실 원천
    config/
      env.ts                    환경변수 검증
      regions.ts                수도권 66개 (스캔 65개)
      keywords.ts               그물 A 키워드 + 그물 C 검색어
    store/
      types.ts                  Store 인터페이스 (DB 전환 경계)
      json-store.ts             원자적 읽기/쓰기
    sources/
      types.ts                  SourceAdapter 인터페이스
      rate-limiter.ts           초당 상한 + 429 지수 백오프
      health.ts                 health.json 기록
      kakao-local.ts            장소 검색
      kakao-blog.ts             블로그 검색
    llm/
      types.ts                  LlmClient 인터페이스 (provider-agnostic)
      gemini.ts                 gemini-3.1-flash-lite / 3.6-flash 승급
      anthropic.ts              교체용 (미사용이지만 인터페이스 증명)
      prompts.ts                추출·수확 프롬프트 2종
    pipeline/
      geo.ts                    거리·이동시간 (순수)
      exclude.ts                Layer 1 (순수)
      relevance.ts              Layer 2 관련성 판정 (순수)
      buzz.ts                   Layer 2 화제량 산출 (순수)
      harvest.ts                그물 C 큐레이션 수확
      extract.ts                Layer 3 LLM 속성 추출
      tag.ts                    Layer 4 (순수)
      gate.ts                   Layer 5 (순수)
      score.ts                  HotScore / FamilyFit (순수)
    jobs/
      weekly-discover.ts        그물 A·B·C -> Layer 1~5
      daily-buzz.ts             화제량 재수집 -> HotScore
      weekly-suggest.ts         주말 후보 3곳
    cli/
      visited.ts  label.ts  health.ts  hide.ts  inspect.ts

  tests/
    fixtures/                   data/raw/ 에서 복사한 실제 응답
    config/  store/  sources/  pipeline/  llm/  jobs/

  scripts/
    check-keys.mjs              Task 0 검증 (작성 완료)
    capture-fixture.ts          실제 API 1회 호출 -> fixture 저장

  .github/workflows/
    daily-buzz.yml  weekly-discover.yml  weekly-suggest.yml
```

**분해 원칙:** `src/pipeline/` 전체가 I/O 없는 순수 함수 모듈이다. `jobs/` 만
모킹하면 파이프라인 전체를 오프라인 검증할 수 있다. `store/` 와 `llm/` 은
인터페이스 뒤에 숨겨 나중에 교체 가능하게 둔다.

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

## Task 1: 프로젝트 부트스트랩 + 환경변수 검증  [완료 2026-08-20]

> API 키가 없어도 진행 가능하다. Task 0과 병렬로 착수할 수 있다.
>
> **v3 반영 (2026-08-20).** 이 태스크는 원래 네이버·Supabase 키를 검증하도록
> 쓰여 있었고 Task 9 에서 고치게 되어 있었다. 틀린 것을 알면서 짜고 다시
> 짜는 낭비이므로 처음부터 v3 스키마(카카오 + LLM provider)로 쓴다.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/config/env.ts`
- Modify: `.env.example` (v3 키 구성으로)
- Test: `tests/config/env.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `type Env` — 검증된 환경변수 객체
  - `loadEnv(source?: Record<string, string | undefined>): Env` — 실패 시 어떤
    키가 문제인지 메시지에 담아 `throw`. 인자를 주입할 수 있으므로 테스트가
    `process.env` 를 건드리지 않는다

- [x] **Step 1: 스캐폴딩 생성**

```bash
npm init -y
npm pkg set name=cafe-recommender private=true type=module
npm pkg set engines.node=">=22"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.check-keys="node scripts/check-keys.mjs"
npm i zod
npm i -D typescript @types/node vitest tsx
```

버전을 고정하지 않는다. 설치 시점의 최신을 쓰고 재현성은 lockfile이 보장한다.
`@supabase/supabase-js` 와 `@anthropic-ai/sdk` 는 **설치하지 않는다** — v3 에서
Supabase 를 뺐고, LLM 은 `fetch` 로 직접 호출한다 (SDK 의존 없이 어댑터
인터페이스를 유지하기 위함).

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

- [x] **Step 2: 실패하는 테스트 작성**

`tests/config/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadEnv } from '../../src/config/env.js'

const valid = {
  KAKAO_REST_API_KEY: 'kakao-key',
  GEMINI_API_KEY: 'gemini-key',
}

describe('loadEnv', () => {
  it('유효한 값을 통과시킨다', () => {
    expect(loadEnv(valid).KAKAO_REST_API_KEY).toBe('kakao-key')
  })

  it('출발지 좌표를 부평 기본값으로 채운다', () => {
    const env = loadEnv(valid)
    expect(env.HOME_LAT).toBeCloseTo(37.5074, 4)
    expect(env.HOME_LNG).toBeCloseTo(126.7218, 4)
  })

  it('좌표를 문자열로 주면 숫자로 변환한다', () => {
    expect(loadEnv({ ...valid, HOME_LAT: '37.1' }).HOME_LAT).toBeCloseTo(37.1, 4)
  })

  it('LLM_PROVIDER 기본값은 gemini 다', () => {
    expect(loadEnv(valid).LLM_PROVIDER).toBe('gemini')
  })

  it('DATA_DIR 기본값은 data 다', () => {
    expect(loadEnv(valid).DATA_DIR).toBe('data')
  })

  it('카카오 키가 빠지면 어떤 키가 문제인지 메시지에 담아 실패한다', () => {
    const { KAKAO_REST_API_KEY: _o, ...rest } = valid
    expect(() => loadEnv(rest)).toThrow(/KAKAO_REST_API_KEY/)
  })

  it('빈 문자열도 누락으로 취급한다', () => {
    // .env 에 KEY= 만 남은 흔한 실수를 잡는다
    expect(() => loadEnv({ ...valid, KAKAO_REST_API_KEY: '' })).toThrow(/KAKAO_REST_API_KEY/)
  })

  it('provider 가 gemini 인데 Gemini 키가 없으면 실패한다', () => {
    expect(() => loadEnv({ KAKAO_REST_API_KEY: 'k' })).toThrow(/GEMINI_API_KEY/)
  })

  it('provider 가 anthropic 이면 Anthropic 키를 요구한다', () => {
    expect(() => loadEnv({ KAKAO_REST_API_KEY: 'k', LLM_PROVIDER: 'anthropic' }))
      .toThrow(/ANTHROPIC_API_KEY/)
  })

  it('anthropic 으로 전환해도 Gemini 키 없이 통과한다', () => {
    // provider-agnostic 설계의 증명 — .env 두 줄로 갈아탄다
    const env = loadEnv({
      KAKAO_REST_API_KEY: 'k', LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a',
    })
    expect(env.LLM_PROVIDER).toBe('anthropic')
  })

  it('알 수 없는 LLM_PROVIDER 를 거부한다', () => {
    expect(() => loadEnv({ ...valid, LLM_PROVIDER: 'openai' })).toThrow(/LLM_PROVIDER/)
  })

  it('네이버·Supabase 키를 요구하지 않는다', () => {
    // v3: 네이버는 신규 발급 불가, Supabase 는 JSON in git 으로 대체
    expect(() => loadEnv(valid)).not.toThrow()
  })
})
```

- [x] **Step 3: 테스트가 실패하는 것을 확인**

Run: `npx vitest run tests/config/env.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/config/env.js"`

- [x] **Step 4: 최소 구현**

`src/config/env.ts`:

```ts
import { z } from 'zod'

const EnvSchema = z
  .object({
    // 수집: 장소 검색 + 블로그 검색을 이 키 하나로 한다 (스펙 v3 6.3)
    KAKAO_REST_API_KEY: z.string().min(1),

    // LLM: provider-agnostic. .env 두 줄로 갈아탄다 (스펙 6.6 원칙 3)
    LLM_PROVIDER: z.enum(['gemini', 'anthropic']).default('gemini'),
    GEMINI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),

    // 저장: DB 없음. JSON in git (스펙 v3 9절)
    DATA_DIR: z.string().min(1).default('data'),

    // 출발지: 인천 부평
    HOME_LAT: z.coerce.number().default(37.5074),
    HOME_LNG: z.coerce.number().default(126.7218),
  })
  .superRefine((v, ctx) => {
    // 고른 provider 의 키만 요구한다. 둘 다 강제하면 무료 경로를 쓰는
    // 사람이 쓰지도 않는 Anthropic 키를 발급해야 한다.
    if (v.LLM_PROVIDER === 'gemini' && !v.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'LLM_PROVIDER=gemini 이면 필요하다',
      })
    }
    if (v.LLM_PROVIDER === 'anthropic' && !v.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'LLM_PROVIDER=anthropic 이면 필요하다',
      })
    }
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
    const keys = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))].join(', ')
    throw new Error(`환경변수 오류 — 확인 필요: ${keys}`)
  }
  return parsed.data
}
```

- [x] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/config/env.test.ts`

Expected: PASS (12 tests)

이어서 `npm run typecheck` 가 오류 없이 끝나는 것도 확인한다.

- [x] **Step 6: `.env.example` 을 v3 구성으로 교체**

네이버·Supabase 항목을 지우고 Gemini 를 넣는다. 관리할 키가 2개다.

```
# ==========================================================
#  cafe-recommender 환경변수 (v3)
#    cp .env.example .env
#  .env 는 .gitignore 로 차단되어 있습니다.
# ==========================================================

# --- 카카오 (developers.kakao.com) -----------------------
# 내 애플리케이션 > [앱 설정] > 앱 키 > "REST API 키" (네 개 중 세 번째)
# [제품 설정] > 카카오맵 활성화 ON 이 필수입니다.
# 이 키 하나로 장소 검색과 블로그 검색을 모두 합니다.
KAKAO_REST_API_KEY=

# --- LLM ---------------------------------------------------
# gemini(무료 티어) 또는 anthropic. 기본값 gemini.
LLM_PROVIDER=gemini

# Gemini: aistudio.google.com/apikey — 결제 수단 없이 발급됩니다.
GEMINI_API_KEY=

# Anthropic: console.anthropic.com — LLM_PROVIDER=anthropic 일 때만 필요.
ANTHROPIC_API_KEY=

# --- 저장소 ------------------------------------------------
# DB 없음. JSON 파일이 git 에 커밋됩니다.
DATA_DIR=data

# --- 출발지: 인천 부평 (기본값 있음. 비워두어도 됩니다) ---
HOME_LAT=37.5074
HOME_LNG=126.7218
```

기존 `.env` 는 이미 카카오·Gemini 키가 채워져 있고 v3 스키마가 남는 항목을
무시하므로 그대로 동작한다.

- [x] **Step 7: 커밋**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/config/env.ts tests/config/env.test.ts .env.example
git commit -m "feat: 프로젝트 부트스트랩과 환경변수 검증"
```

커밋 메시지 본문:

```
v3 키 구성으로 검증한다 — 카카오 하나 + LLM provider 하나.
네이버는 신규 발급 경로가 없고 Supabase 는 JSON in git 으로 대체했다.

superRefine 으로 고른 provider 의 키만 요구한다. 둘 다 강제하면 무료
경로를 쓰는 사람이 쓰지도 않는 Anthropic 키를 발급해야 한다.

loadEnv 는 source 를 주입받으므로 테스트가 process.env 를 오염시키지
않는다. 빈 문자열을 미설정으로 취급해 ".env 에 KEY= 만 남은" 흔한
실수를 잡는다.
```

## Task 2: zod 스키마 + JSON 저장소  [완료 2026-08-20]

> API 키가 없어도 진행 가능하다.

**Files:**
- Create: `src/schema.ts`, `src/store/types.ts`, `src/store/json-store.ts`
- Test: `tests/schema.test.ts`, `tests/store/json-store.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `CafeSchema` / `type Cafe`, `CafeAttributesSchema` / `type CafeAttributes`
  - `BuzzSnapshotSchema` / `type BuzzSnapshot`
  - `VisitSchema`, `SuggestionSchema`, `GoldenLabelSchema`, `HealthSchema`
  - `interface Store` — `readCafes()` / `writeCafes(c)` / `readBuzz()` / … / `appendRaw(source, query, payload)`
  - `createJsonStore(dataDir: string): Store`

**설계 노트:** zod 스키마가 **타입과 런타임 검증을 동시에** 담당한다. SQL DDL 과
TypeScript 타입을 따로 관리하며 어긋나는 문제가 없다. 읽을 때마다 `parse`
하므로 손으로 편집한 JSON 이 깨져도 즉시 잡힌다.

- [x] **Step 1: 실패하는 테스트 작성**

`tests/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CafeSchema, CafeAttributesSchema } from '../src/schema.js'

const minimalCafe = {
  kakaoPlaceId: '12345',
  name: '테라로사 서종점',
  sigungu: '양평군',
  lat: 37.5, lng: 127.4,
  firstSeenAt: '2026-08-20T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  attributes: null,
  tags: [],
}

describe('CafeSchema', () => {
  it('최소 필드를 통과시킨다', () => {
    expect(CafeSchema.parse(minimalCafe).name).toBe('테라로사 서종점')
  })

  it('kakaoPlaceId 가 없으면 거부한다', () => {
    const { kakaoPlaceId: _o, ...rest } = minimalCafe
    expect(CafeSchema.safeParse(rest).success).toBe(false)
  })

  it('알 수 없는 status 를 거부한다', () => {
    expect(CafeSchema.safeParse({ ...minimalCafe, status: 'weird' }).success).toBe(false)
  })
})

describe('CafeAttributesSchema', () => {
  const attrs = {
    scale: '대형', seatsEstimate: 200, floors: 2,
    hasBakery: true, breadBakedOnsite: true,
    menuLevel: 3, mealTypes: ['파스타'], viewStrength: 3, viewTypes: ['강'],
    outdoorSeating: true, parkingGrade: 'A',
    parkingEvidence: '전용 주차장 50대', photoSpot: 4, teenAppeal: 3,
    confidence: 0.82, evidence: '2층 통창에 좌석 200석',
    extractedAt: '2026-08-20T00:00:00.000Z',
    modelVersion: 'gemini-3.1-flash-lite',
  }

  it('정상 속성을 통과시킨다', () => {
    expect(CafeAttributesSchema.parse(attrs).scale).toBe('대형')
  })

  it('evidence 가 빈 문자열이면 거부한다', () => {
    // 인용 없는 LLM 출력이 저장되는 것을 스키마 수준에서 막는다 (스펙 Layer 3)
    expect(CafeAttributesSchema.safeParse({ ...attrs, evidence: '' }).success).toBe(false)
  })

  it('menuLevel 범위를 벗어나면 거부한다', () => {
    expect(CafeAttributesSchema.safeParse({ ...attrs, menuLevel: 4 }).success).toBe(false)
  })

  it('parkingGrade 는 A~D 와 ? 만 허용한다', () => {
    expect(CafeAttributesSchema.safeParse({ ...attrs, parkingGrade: 'E' }).success).toBe(false)
    expect(CafeAttributesSchema.safeParse({ ...attrs, parkingGrade: '?' }).success).toBe(true)
  })
})
```

`tests/store/json-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonStore } from '../../src/store/json-store.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cafe-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const cafe = {
  kakaoPlaceId: '1', name: '테스트카페', sigungu: '양평군',
  lat: 37.5, lng: 127.4, firstSeenAt: '2026-08-20T00:00:00.000Z',
  status: 'active' as const, ambiguousName: false, attributes: null, tags: [],
}

describe('createJsonStore', () => {
  it('파일이 없으면 빈 배열을 준다', async () => {
    expect(await createJsonStore(dir).readCafes()).toEqual([])
  })

  it('쓰고 다시 읽으면 같은 값이다', async () => {
    const s = createJsonStore(dir)
    await s.writeCafes([cafe])
    expect(await s.readCafes()).toEqual([cafe])
  })

  it('사람이 읽을 수 있게 들여쓰기해 저장한다', async () => {
    await createJsonStore(dir).writeCafes([cafe])
    const text = readFileSync(join(dir, 'cafes.json'), 'utf8')
    expect(text).toContain('\n  ')
    expect(text.endsWith('\n')).toBe(true)   // git diff 를 깨끗하게
  })

  it('스키마에 맞지 않는 파일을 읽으면 파일명과 함께 실패한다', async () => {
    writeFileSync(join(dir, 'cafes.json'), '[{"name":"깨진데이터"}]')
    await expect(createJsonStore(dir).readCafes()).rejects.toThrow(/cafes\.json/)
  })

  it('원본 스냅샷을 날짜 폴더에 적재한다', async () => {
    const s = createJsonStore(dir)
    const p = await s.appendRaw('kakao-blog', '양평 테라로사', { documents: [] },
      new Date('2026-08-20T05:00:00Z'))
    expect(p).toContain('2026-08-20')
    expect(JSON.parse(readFileSync(p, 'utf8')).query).toBe('양평 테라로사')
  })
})
```

- [x] **Step 2: 테스트가 실패하는 것을 확인**

Run: `npx vitest run tests/schema.test.ts tests/store/json-store.test.ts`

Expected: FAIL — 모듈 해결 실패

- [x] **Step 3: 스키마 구현**

`src/schema.ts`:

```ts
import { z } from 'zod'

export const CafeAttributesSchema = z.object({
  scale: z.enum(['대형', '중형', '소형']).nullable().optional(),
  seatsEstimate: z.number().int().nullable().optional(),
  floors: z.number().int().nullable().optional(),
  hasBakery: z.boolean().nullable().optional(),
  breadBakedOnsite: z.boolean().nullable().optional(),
  bakerySignal: z.string().nullable().optional(),
  menuLevel: z.number().int().min(1).max(3),
  mealTypes: z.array(z.string()).default([]),
  signatureMenu: z.string().nullable().optional(),
  viewStrength: z.number().int().min(0).max(5),
  viewTypes: z.array(z.string()).default([]),
  outdoorSeating: z.boolean().nullable().optional(),
  parkingGrade: z.enum(['A', 'B', 'C', 'D', '?']),
  parkingEvidence: z.string().default(''),
  photoSpot: z.number().int().min(0).max(5).nullable().optional(),
  teenAppeal: z.number().int().min(0).max(5).nullable().optional(),
  stayDuration: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  // 인용 없는 LLM 출력을 스키마 수준에서 막는다 (스펙 Layer 3)
  evidence: z.string().min(1, 'evidence 인용은 필수다'),
  extractedAt: z.string(),
  modelVersion: z.string().min(1),
})
export type CafeAttributes = z.infer<typeof CafeAttributesSchema>

export const CafeSchema = z.object({
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
  firstSeenAt: z.string(),
  status: z.enum(['active', 'hidden', 'excluded_auto', 'pending_extraction']),
  excludeReason: z.string().nullable().optional(),
  /** 일반명사 상호. 골든셋 경계 구간으로 강제 편입된다 (스펙 Layer 2) */
  ambiguousName: z.boolean().default(false),
  attributes: CafeAttributesSchema.nullable(),
  tags: z.array(z.string()).default([]),
})
export type Cafe = z.infer<typeof CafeSchema>

export const BuzzSnapshotSchema = z.object({
  kakaoPlaceId: z.string(),
  capturedAt: z.string(),          // YYYY-MM-DD
  receivedCount: z.number().int(),
  relevantCount: z.number().int(),
  precision: z.number().min(0).max(1),
  spanDays: z.number(),
  postsPer30: z.number(),
  posts30d: z.number(),
  postsPrev: z.number(),
  firstPostDate: z.string().nullable(),
  latestPostDate: z.string().nullable(),
  acceleration: z.number(),
})
export type BuzzSnapshot = z.infer<typeof BuzzSnapshotSchema>

export const VisitSchema = z.object({
  kakaoPlaceId: z.string(),
  visitedOn: z.string(),           // YYYY-MM-DD
})
export type Visit = z.infer<typeof VisitSchema>

export const SuggestionSchema = z.object({
  weekOf: z.string(),
  kakaoPlaceId: z.string(),
  rank: z.number().int().min(1),
  finalScore: z.number(),
  reason: z.record(z.string(), z.unknown()).default({}),
})
export type Suggestion = z.infer<typeof SuggestionSchema>

export const GoldenLabelSchema = z.object({
  kakaoPlaceId: z.string(),
  verdict: z.enum(['O', 'X', 'UNKNOWN']),
  rejectReason: z
    .enum(['neighborhood', 'parking', 'too_small', 'too_far', 'taste'])
    .nullable()
    .optional(),
  stratum: z.enum(['top', 'mid', 'boundary', 'rejected']),
  modelVersion: z.string(),
  labeledAt: z.string(),
})
export type GoldenLabel = z.infer<typeof GoldenLabelSchema>

export const HealthSchema = z.object({
  source: z.string(),
  lastSuccessAt: z.string().nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: z.number().int().default(0),
  updatedAt: z.string(),
})
export type Health = z.infer<typeof HealthSchema>

export const BlacklistEntrySchema = z.object({
  pattern: z.string().min(1),
  matchType: z.enum(['contains', 'exact', 'regex']).default('contains'),
  note: z.string().optional(),
})
export type BlacklistEntry = z.infer<typeof BlacklistEntrySchema>
```

- [x] **Step 4: 저장소 구현**

`src/store/types.ts`:

```ts
import type {
  Cafe, BuzzSnapshot, Visit, Suggestion, GoldenLabel, Health, BlacklistEntry,
} from '../schema.js'

/**
 * 저장소 경계. 지금은 JSON in git 이지만 이 인터페이스 뒤에 두었으므로
 * 나중에 DB로 옮길 때 구현체만 갈아끼우면 된다 (스펙 9절).
 */
export interface Store {
  readCafes(): Promise<Cafe[]>
  writeCafes(cafes: Cafe[]): Promise<void>
  readBuzz(): Promise<BuzzSnapshot[]>
  writeBuzz(rows: BuzzSnapshot[]): Promise<void>
  readVisits(): Promise<Visit[]>
  writeVisits(rows: Visit[]): Promise<void>
  readSuggestions(): Promise<Suggestion[]>
  writeSuggestions(rows: Suggestion[]): Promise<void>
  readGolden(): Promise<GoldenLabel[]>
  writeGolden(rows: GoldenLabel[]): Promise<void>
  readBlacklist(): Promise<BlacklistEntry[]>
  readHealth(): Promise<Health[]>
  writeHealth(rows: Health[]): Promise<void>
  /** 원본 응답을 data/raw/YYYY-MM-DD/ 에 적재하고 경로를 돌려준다 */
  appendRaw(source: string, query: string, payload: unknown, now?: Date): Promise<string>
}
```

`src/store/json-store.ts`:

```ts
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  CafeSchema, BuzzSnapshotSchema, VisitSchema, SuggestionSchema,
  GoldenLabelSchema, HealthSchema, BlacklistEntrySchema,
} from '../schema.js'
import type { Store } from './types.js'

async function readArray<T>(dir: string, file: string, schema: z.ZodType<T>): Promise<T[]> {
  const path = join(dir, file)
  if (!existsSync(path)) return []
  const text = await readFile(path, 'utf8')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    throw new Error(`${file} 파싱 실패: ${(e as Error).message}`)
  }
  const parsed = z.array(schema).safeParse(json)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(`${file} 스키마 오류 [${first?.path.join('.')}]: ${first?.message}`)
  }
  return parsed.data
}

async function writeArray(dir: string, file: string, rows: unknown): Promise<void> {
  await mkdir(dir, { recursive: true })
  // 원자적 저장: 임시 파일에 쓰고 rename. 배치가 중간에 죽어도 파일이
  // 반쯤 쓰인 상태로 남지 않는다.
  const tmp = join(dir, `.${file}.tmp`)
  // 들여쓰기 2 + 끝 개행 -> git diff 가 한 줄 단위로 깔끔하게 나온다
  await writeFile(tmp, JSON.stringify(rows, null, 2) + '\n', 'utf8')
  await rename(tmp, join(dir, file))
}

export function createJsonStore(dataDir: string): Store {
  return {
    readCafes: () => readArray(dataDir, 'cafes.json', CafeSchema),
    writeCafes: (r) => writeArray(dataDir, 'cafes.json', r),
    readBuzz: () => readArray(dataDir, 'buzz.json', BuzzSnapshotSchema),
    writeBuzz: (r) => writeArray(dataDir, 'buzz.json', r),
    readVisits: () => readArray(dataDir, 'visits.json', VisitSchema),
    writeVisits: (r) => writeArray(dataDir, 'visits.json', r),
    readSuggestions: () => readArray(dataDir, 'suggestions.json', SuggestionSchema),
    writeSuggestions: (r) => writeArray(dataDir, 'suggestions.json', r),
    readGolden: () => readArray(dataDir, 'golden.json', GoldenLabelSchema),
    writeGolden: (r) => writeArray(dataDir, 'golden.json', r),
    readBlacklist: () => readArray(dataDir, 'blacklist.json', BlacklistEntrySchema),
    readHealth: () => readArray(dataDir, 'health.json', HealthSchema),
    writeHealth: (r) => writeArray(dataDir, 'health.json', r),

    async appendRaw(source, query, payload, now = new Date()) {
      const day = now.toISOString().slice(0, 10)
      const dir = join(dataDir, 'raw', day)
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

- [x] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/schema.test.ts tests/store/json-store.test.ts`

Expected: PASS (10 tests)

- [x] **Step 6: 초기 데이터 파일과 블랙리스트 생성**

`data/blacklist.json` — 스펙 Layer 1. **코드가 아니라 데이터로 관리한다.**
신규 프랜차이즈가 생겨도 배포가 필요 없다.

```json
[
  { "pattern": "스타벅스",     "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "투썸플레이스", "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "이디야",       "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "메가커피",     "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "메가엠지씨",   "matchType": "contains", "note": "메가커피 법인명" },
  { "pattern": "컴포즈커피",   "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "빽다방",       "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "커피빈",       "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "할리스",       "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "파스쿠찌",     "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "탐앤탐스",     "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "더벤티",       "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "매머드",       "matchType": "contains", "note": "프랜차이즈" },
  { "pattern": "파리바게",     "matchType": "contains", "note": "베이커리 프랜차이즈" },
  { "pattern": "뚜레쥬르",     "matchType": "contains", "note": "베이커리 프랜차이즈" },
  { "pattern": "던킨",         "matchType": "contains", "note": "프랜차이즈" }
]
```

> **주의:** 테라로사·앤트러사이트는 넣지 않는다. 다지점이지만 대형 특화매장을
> 운영하며 **우리가 가장 원하는 부류**다. 스펙 정정 표 첫 줄 참조.

- [x] **Step 7: 커밋**

```bash
git add src/schema.ts src/store/ data/blacklist.json tests/schema.test.ts tests/store/
git commit -m "feat: zod 스키마와 JSON 저장소"
```

커밋 메시지 본문:

```
DB를 쓰지 않는다. zod 스키마가 타입과 런타임 검증의 단일 진실 원천이라
SQL DDL 과 TypeScript 타입이 어긋나는 문제가 없다.

evidence 에 min(1) 을 걸어 인용 없는 LLM 출력이 저장되는 것을
스키마 수준에서 막는다 (스펙 Layer 3).

쓰기는 임시 파일 + rename 으로 원자적이다. 배치가 중간에 죽어도
파일이 반쯤 쓰인 상태로 남지 않는다.
들여쓰기 2 + 끝 개행으로 git diff 가 한 줄 단위로 깔끔하게 나온다.

Store 인터페이스 뒤에 두어 나중에 DB로 옮길 경계를 만들어 두었다.
블랙리스트는 코드가 아니라 data/blacklist.json 이다. 신규 프랜차이즈가
생겨도 배포가 필요 없다.
```

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

## Task 4: 소스 어댑터 기반 — 레이트리미터 + 헬스 기록

> API 키 없이 진행 가능하다 (가짜 fetch 를 주입해 테스트한다).

**Files:**
- Create: `src/sources/types.ts`, `src/sources/rate-limiter.ts`, `src/sources/health.ts`
- Test: `tests/sources/rate-limiter.test.ts`, `tests/sources/health.test.ts`

**Interfaces:**
- Consumes: `Store` (Task 2)
- Produces:
  - `type Fetcher = (url: string, init?: RequestInit) => Promise<Response>`
  - `createRateLimiter(opts): <T>(fn: () => Promise<T>) => Promise<T>`
  - `recordSuccess(store, source, now)` / `recordFailure(store, source, err, now)`
  - `class SourceError extends Error { status?: number }`

**설계 노트:** 레이트리미터는 시간을 **주입받는다** (`sleep`, `now`). 실제로
기다리는 테스트는 느리고 불안정하다. 가짜 시계를 넣어 즉시 검증한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/sources/rate-limiter.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createRateLimiter, SourceError } from '../../src/sources/rate-limiter.js'

describe('createRateLimiter', () => {
  it('초당 상한을 넘으면 대기시킨다', async () => {
    const sleep = vi.fn(async () => {})
    let t = 0
    const limit = createRateLimiter({ perSecond: 2, sleep, now: () => t })
    await limit(async () => 'a')
    await limit(async () => 'b')
    await limit(async () => 'c')          // 3번째 -> 대기 필요
    expect(sleep).toHaveBeenCalled()
  })

  it('상한 안에서는 대기하지 않는다', async () => {
    const sleep = vi.fn(async () => {})
    let t = 0
    const limit = createRateLimiter({ perSecond: 10, sleep, now: () => (t += 200) })
    await limit(async () => 'a')
    await limit(async () => 'b')
    expect(sleep).not.toHaveBeenCalled()
  })

  it('429 를 받으면 지수 백오프로 재시도한다', async () => {
    const sleep = vi.fn(async () => {})
    const limit = createRateLimiter({ perSecond: 100, sleep, now: () => 0, maxRetries: 3 })
    let calls = 0
    const result = await limit(async () => {
      calls++
      if (calls < 3) throw new SourceError('rate limited', 429)
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(calls).toBe(3)
    // 백오프가 커져야 한다
    const waits = sleep.mock.calls.map((c) => c[0] as number)
    expect(waits[1]).toBeGreaterThan(waits[0]!)
  })

  it('재시도 한도를 넘으면 마지막 오류를 던진다', async () => {
    const limit = createRateLimiter({ perSecond: 100, sleep: async () => {}, now: () => 0, maxRetries: 2 })
    await expect(limit(async () => { throw new SourceError('nope', 429) })).rejects.toThrow('nope')
  })

  it('429 가 아닌 오류는 재시도하지 않는다', async () => {
    const limit = createRateLimiter({ perSecond: 100, sleep: async () => {}, now: () => 0, maxRetries: 5 })
    let calls = 0
    await expect(limit(async () => { calls++; throw new SourceError('bad key', 401) }))
      .rejects.toThrow('bad key')
    expect(calls).toBe(1)   // 401 을 다섯 번 두드려봐야 소용없다
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/sources/rate-limiter.test.ts` — FAIL

- [ ] **Step 3: 구현**

`src/sources/rate-limiter.ts`:

```ts
export class SourceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'SourceError'
  }
}

export interface RateLimiterOptions {
  perSecond: number
  maxRetries?: number
  /** 주입 가능 — 테스트에서 실제로 기다리지 않는다 */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createRateLimiter(opts: RateLimiterOptions) {
  const { perSecond, maxRetries = 4, sleep = realSleep, now = Date.now } = opts
  const minGapMs = 1000 / perSecond
  let lastAt = -Infinity
  let chain: Promise<unknown> = Promise.resolve()

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    // 직렬화한다. 동시 호출이 상한을 우회하지 못하게.
    const run = chain.then(async () => {
      const wait = lastAt + minGapMs - now()
      if (wait > 0) await sleep(wait)
      lastAt = now()

      let lastErr: unknown
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn()
        } catch (e) {
          lastErr = e
          const status = e instanceof SourceError ? e.status : undefined
          // 429/5xx 만 재시도할 가치가 있다. 401·403 은 두드려도 안 열린다.
          const retryable = status === 429 || (status !== undefined && status >= 500)
          if (!retryable || attempt === maxRetries) throw e
          await sleep(minGapMs * 2 ** (attempt + 1))
        }
      }
      throw lastErr
    })
    chain = run.catch(() => {})   // 실패가 뒤 요청을 막지 않게
    return run as Promise<T>
  }
}
```

`src/sources/health.ts`:

```ts
import type { Store } from '../store/types.js'
import type { Health } from '../schema.js'

async function upsert(store: Store, source: string, patch: Partial<Health>, now: Date) {
  const rows = await store.readHealth()
  const i = rows.findIndex((r) => r.source === source)
  const base: Health = rows[i] ?? {
    source, lastSuccessAt: null, lastError: null,
    consecutiveFailures: 0, updatedAt: now.toISOString(),
  }
  const next: Health = { ...base, ...patch, updatedAt: now.toISOString() }
  if (i >= 0) rows[i] = next
  else rows.push(next)
  await store.writeHealth(rows)
}

export const recordSuccess = (store: Store, source: string, now = new Date()) =>
  upsert(store, source, { lastSuccessAt: now.toISOString(), lastError: null, consecutiveFailures: 0 }, now)

export async function recordFailure(store: Store, source: string, err: unknown, now = new Date()) {
  const rows = await store.readHealth()
  const prev = rows.find((r) => r.source === source)?.consecutiveFailures ?? 0
  await upsert(store, source, {
    lastError: err instanceof Error ? err.message : String(err),
    consecutiveFailures: prev + 1,
  }, now)
}
```

`src/sources/types.ts`:

```ts
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** 모든 소스 어댑터가 구현한다. 서로를 모른다 (스펙 6.6 원칙 1). */
export interface SourceAdapter<In, Out> {
  readonly name: string
  fetchRaw(input: In): Promise<unknown>
  parse(payload: unknown): Out
}
```

- [ ] **Step 4: 테스트 통과 확인** — `npx vitest run tests/sources/` PASS

- [ ] **Step 5: 커밋**

```bash
git add src/sources/ tests/sources/
git commit -m "feat: 소스 어댑터 기반 — 레이트리미터와 헬스 기록"
```

본문:
```
레이트리미터는 sleep 과 now 를 주입받는다. 실제로 기다리는 테스트는
느리고 불안정하므로 가짜 시계로 즉시 검증한다.

429·5xx 만 지수 백오프로 재시도한다. 401·403 은 두드려도 열리지 않으므로
즉시 던진다 — Task 0 에서 카카오 403 을 겪으며 확인한 교훈이다.

호출을 직렬화해 동시 호출이 초당 상한을 우회하지 못하게 한다.
```

---

## Task 5: 카카오 로컬 어댑터 (장소 검색)

**Files:**
- Create: `src/sources/kakao-local.ts`, `scripts/capture-fixture.ts`
- Test: `tests/sources/kakao-local.test.ts`
- Fixture: `tests/fixtures/kakao-local-yangpyeong.json`

**Interfaces:**
- Consumes: `Fetcher`, `createRateLimiter`, `SourceError` (Task 4), `Region` (Task 3)
- Produces:
  - `interface KakaoPlace { id, placeName, categoryName, addressName, roadAddressName, phone, placeUrl, lat, lng }`
  - `parseKakaoLocal(payload: unknown): KakaoPlace[]`
  - `createKakaoLocal(deps): { searchKeyword(query, page): Promise<{ places, isEnd }> }`

- [ ] **Step 1: fixture 캡처 스크립트 작성 후 실행**

`scripts/capture-fixture.ts` — 실제 API 를 **1회만** 호출해 응답을 저장한다.
이후 모든 테스트는 이 파일만 읽는다 (Global Constraints).

```ts
import { writeFile, mkdir } from 'node:fs/promises'
import { loadEnv } from '../src/config/env.js'

const env = loadEnv()
const [kind, ...rest] = process.argv.slice(2)
const query = rest.join(' ')

const urls: Record<string, string> = {
  local: `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=15`,
  blog: `https://dapi.kakao.com/v2/search/blog?query=${encodeURIComponent(query)}&size=50&sort=recency`,
}
const url = urls[kind ?? '']
if (!url) throw new Error('사용법: tsx scripts/capture-fixture.ts <local|blog> <검색어>')

const res = await fetch(url, { headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` } })
if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)

await mkdir('tests/fixtures', { recursive: true })
const slug = `kakao-${kind}-${query}`.replace(/[^\w가-힣-]+/g, '-').toLowerCase()
const path = `tests/fixtures/${slug}.json`
await writeFile(path, JSON.stringify(await res.json(), null, 2) + '\n', 'utf8')
console.log(`저장: ${path}`)
```

실행:

```bash
npx tsx scripts/capture-fixture.ts local "양평군 베이커리카페"
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/sources/kakao-local.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseKakaoLocal, createKakaoLocal } from '../../src/sources/kakao-local.js'
import { SourceError } from '../../src/sources/rate-limiter.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/kakao-local-양평군-베이커리카페.json', 'utf8'),
)

describe('parseKakaoLocal', () => {
  it('실제 응답에서 장소를 뽑아낸다', () => {
    const places = parseKakaoLocal(fixture)
    expect(places.length).toBeGreaterThan(0)
    const p = places[0]!
    expect(p.id).toBeTruthy()
    expect(p.placeName).toBeTruthy()
    expect(typeof p.lat).toBe('number')
    expect(typeof p.lng).toBe('number')
  })

  it('좌표 문자열을 숫자로 바꾼다 (x=lng, y=lat)', () => {
    // 카카오는 x 가 경도, y 가 위도다. 뒤집으면 카페가 바다에 뜬다.
    const p = parseKakaoLocal(fixture)[0]!
    expect(p.lat).toBeGreaterThan(33)   // 한반도 위도
    expect(p.lat).toBeLessThan(39)
    expect(p.lng).toBeGreaterThan(124)  // 한반도 경도
    expect(p.lng).toBeLessThan(132)
  })

  it('문서가 없으면 빈 배열이다', () => {
    expect(parseKakaoLocal({ documents: [], meta: { is_end: true } })).toEqual([])
  })
})

describe('createKakaoLocal', () => {
  const deps = (fetcher: any) => ({
    apiKey: 'test-key',
    fetcher,
    limit: <T,>(fn: () => Promise<T>) => fn(),
  })

  it('Authorization 헤더에 KakaoAK 를 붙인다', async () => {
    let seenAuth = ''
    const api = createKakaoLocal(deps(async (_u: string, init: any) => {
      seenAuth = init.headers.Authorization
      return new Response(JSON.stringify(fixture), { status: 200 })
    }))
    await api.searchKeyword('양평군 베이커리카페', 1)
    expect(seenAuth).toBe('KakaoAK test-key')
  })

  it('403 을 상태코드가 담긴 SourceError 로 던진다', async () => {
    const api = createKakaoLocal(deps(async () =>
      new Response(JSON.stringify({ msg: 'App disabled OPEN_MAP_AND_LOCAL service.' }), { status: 403 })))
    await expect(api.searchKeyword('x', 1)).rejects.toMatchObject({ status: 403 })
  })
})
```

- [ ] **Step 3: 실패 확인** — FAIL

- [ ] **Step 4: 구현**

`src/sources/kakao-local.ts`:

```ts
import { SourceError } from './rate-limiter.js'
import type { Fetcher } from './types.js'

export interface KakaoPlace {
  id: string
  placeName: string
  categoryName: string
  addressName: string
  roadAddressName: string
  phone: string
  placeUrl: string
  lat: number
  lng: number
}

export function parseKakaoLocal(payload: unknown): KakaoPlace[] {
  const docs = (payload as { documents?: unknown[] })?.documents ?? []
  return docs.map((d) => {
    const r = d as Record<string, string>
    return {
      id: r.id ?? '',
      placeName: r.place_name ?? '',
      categoryName: r.category_name ?? '',
      addressName: r.address_name ?? '',
      roadAddressName: r.road_address_name ?? '',
      phone: r.phone ?? '',
      placeUrl: r.place_url ?? '',
      // 카카오는 x=경도, y=위도. 뒤집으면 카페가 바다에 뜬다.
      lat: Number(r.y),
      lng: Number(r.x),
    }
  })
}

export interface KakaoLocalDeps {
  apiKey: string
  fetcher: Fetcher
  limit: <T>(fn: () => Promise<T>) => Promise<T>
}

export function createKakaoLocal(deps: KakaoLocalDeps) {
  const { apiKey, fetcher, limit } = deps

  async function call(url: string): Promise<unknown> {
    return limit(async () => {
      const res = await fetcher(url, { headers: { Authorization: `KakaoAK ${apiKey}` } })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new SourceError(`kakao-local HTTP ${res.status}: ${body.slice(0, 200)}`, res.status)
      }
      return res.json()
    })
  }

  return {
    name: 'kakao-local',

    /** 키워드로 장소 검색. 페이지당 15건, 최대 3페이지(45건)가 카카오 상한이다. */
    async searchKeyword(query: string, page: number) {
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json`
        + `?query=${encodeURIComponent(query)}&size=15&page=${page}`
      const payload = await call(url)
      const isEnd = Boolean((payload as { meta?: { is_end?: boolean } })?.meta?.is_end)
      return { places: parseKakaoLocal(payload), isEnd, payload }
    },
  }
}
```

- [ ] **Step 5: 테스트 통과 확인** — PASS

- [ ] **Step 6: 커밋**

```bash
git add src/sources/kakao-local.ts scripts/capture-fixture.ts tests/sources/kakao-local.test.ts tests/fixtures/
git commit -m "feat: 카카오 로컬 어댑터와 fixture 캡처 스크립트"
```

본문:
```
실제 API 는 capture-fixture.ts 로 1회만 호출하고, 이후 테스트는 저장된
응답만 읽는다. 파서가 실제 응답 형태로 검증되면서도 CI 가 외부에
의존하지 않는다.

카카오는 x 가 경도, y 가 위도다. 뒤집으면 카페가 서해에 뜬다.
한반도 좌표 범위로 테스트를 걸어 고정했다.

403 은 상태코드를 SourceError 에 담아 던진다. Task 0 에서 이 정보가
원인 특정에 결정적이었다.
```

---

## Task 6: 카카오 블로그 검색 어댑터 + 쿼터 확인

**Files:**
- Create: `src/sources/kakao-blog.ts`
- Test: `tests/sources/kakao-blog.test.ts`
- Fixture: `tests/fixtures/kakao-blog-양평군-테라로사.json`

**Interfaces:**
- Consumes: Task 4 기반
- Produces:
  - `interface BlogDoc { title, contents, url, blogName, dateTime }` — 제목·본문은 **HTML 태그 제거 완료 상태**
  - `parseKakaoBlog(payload): { docs: BlogDoc[], totalCount: number }`
  - `createKakaoBlog(deps): { search(query, opts): Promise<{ docs, totalCount, payload }> }`

- [ ] **Step 1: fixture 캡처**

```bash
npx tsx scripts/capture-fixture.ts blog "양평군 테라로사"
```

- [ ] **Step 2: 카카오 블로그 검색 쿼터 확인 (사람이 직접)**

카카오 개발자 콘솔 > 내 애플리케이션 > **쿼터** 에서 **검색** API 의 일일
한도를 확인하고 `src/sources/kakao-blog.ts` 의 `PER_SECOND` 주석에 기록한다.
로컬 API 는 10만/일로 확인됐으나 검색 API 는 별도 쿼터일 수 있다.
예상 사용량은 약 1,500/일 이다.

- [ ] **Step 3: 실패하는 테스트 작성**

`tests/sources/kakao-blog.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseKakaoBlog } from '../../src/sources/kakao-blog.js'

const fixture = JSON.parse(readFileSync('tests/fixtures/kakao-blog-양평군-테라로사.json', 'utf8'))

describe('parseKakaoBlog', () => {
  it('실제 응답에서 문서를 뽑아낸다', () => {
    const { docs, totalCount } = parseKakaoBlog(fixture)
    expect(docs.length).toBeGreaterThan(0)
    expect(totalCount).toBeGreaterThan(0)
  })

  it('제목과 본문에서 HTML 태그를 제거한다', () => {
    // 카카오는 검색어를 <b> 로 감싸서 준다. 관련성 판정 전에 벗겨야 한다.
    const { docs } = parseKakaoBlog(fixture)
    for (const d of docs) {
      expect(d.title).not.toMatch(/<[^>]+>/)
      expect(d.contents).not.toMatch(/<[^>]+>/)
    }
  })

  it('HTML 엔티티를 되돌린다', () => {
    const { docs } = parseKakaoBlog({
      documents: [{
        title: '&lt;b&gt;카페&lt;/b&gt; &amp; 베이커리',
        contents: '&quot;좋다&quot;', url: 'https://x.com', blogname: 'b',
        datetime: '2026-08-19T00:00:00.000+09:00',
      }],
      meta: { total_count: 1 },
    })
    expect(docs[0]!.title).toBe('<b>카페</b> & 베이커리')
  })

  it('datetime 을 Date 로 파싱한다', () => {
    const { docs } = parseKakaoBlog(fixture)
    expect(docs[0]!.dateTime).toBeInstanceOf(Date)
    expect(Number.isNaN(docs[0]!.dateTime.getTime())).toBe(false)
  })
})
```

- [ ] **Step 4: 실패 확인** — FAIL

- [ ] **Step 5: 구현**

`src/sources/kakao-blog.ts`:

```ts
import { SourceError } from './rate-limiter.js'
import type { Fetcher } from './types.js'

export interface BlogDoc {
  title: string
  contents: string
  url: string
  blogName: string
  dateTime: Date
}

const ENTITIES: Record<string, string> = {
  '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'",
}

/** 카카오는 검색어를 <b> 로 감싸서 준다. 관련성 판정 전에 벗긴다. */
function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&(lt|gt|amp|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m)
}

export function parseKakaoBlog(payload: unknown): { docs: BlogDoc[]; totalCount: number } {
  const p = payload as { documents?: unknown[]; meta?: { total_count?: number } }
  const docs = (p?.documents ?? []).map((d) => {
    const r = d as Record<string, string>
    return {
      title: clean(r.title ?? ''),
      contents: clean(r.contents ?? ''),
      url: r.url ?? '',
      blogName: clean(r.blogname ?? ''),
      dateTime: new Date(r.datetime ?? 0),
    }
  })
  return { docs, totalCount: p?.meta?.total_count ?? 0 }
}

export interface KakaoBlogDeps {
  apiKey: string
  fetcher: Fetcher
  limit: <T>(fn: () => Promise<T>) => Promise<T>
}

/**
 * 카카오 블로그 검색 어댑터.
 * 일일 쿼터: 카카오 콘솔 > 쿼터 > 검색 에서 확인 (Task 6 Step 2).
 * 예상 사용량 약 1,500/일.
 */
export function createKakaoBlog(deps: KakaoBlogDeps) {
  const { apiKey, fetcher, limit } = deps

  return {
    name: 'kakao-blog',

    async search(query: string, opts: { size?: number; sort?: 'recency' | 'accuracy'; page?: number } = {}) {
      const { size = 50, sort = 'recency', page = 1 } = opts
      const url = `https://dapi.kakao.com/v2/search/blog`
        + `?query=${encodeURIComponent(query)}&size=${size}&sort=${sort}&page=${page}`
      return limit(async () => {
        const res = await fetcher(url, { headers: { Authorization: `KakaoAK ${apiKey}` } })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new SourceError(`kakao-blog HTTP ${res.status}: ${body.slice(0, 200)}`, res.status)
        }
        const payload = await res.json()
        return { ...parseKakaoBlog(payload), payload }
      })
    },
  }
}
```

- [ ] **Step 6: 테스트 통과 확인** — PASS

- [ ] **Step 7: 커밋**

```bash
git add src/sources/kakao-blog.ts tests/sources/kakao-blog.test.ts tests/fixtures/
git commit -m "feat: 카카오 블로그 검색 어댑터"
```

본문:
```
네이버 검색 API를 대체한다 (스펙 v3 6절).
카카오가 검색어를 <b> 로 감싸서 주므로 관련성 판정 전에 태그와
HTML 엔티티를 벗긴다. 이걸 놓치면 상호명 포함 여부 판정이 어긋난다.

totalCount 도 파싱하지만 점수에는 쓰지 않는다. OR 매칭이라 존재하지
않는 카페도 3,434건을 받는다 (실측). 진단용으로만 보관한다.
```

---

## Task 7: Layer 1 — 하드 배제 (순수 함수)

**Files:**
- Create: `src/pipeline/exclude.ts`
- Test: `tests/pipeline/exclude.test.ts`

**Interfaces:**
- Consumes: `BlacklistEntry` (Task 2)
- Produces:
  - `type ExcludeReason = 'franchise' | 'category' | null`
  - `evaluateExclusion(input: { name, categoryName }, blacklist: BlacklistEntry[]): ExcludeReason`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/exclude.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateExclusion } from '../../src/pipeline/exclude.js'
import type { BlacklistEntry } from '../../src/schema.js'

const bl: BlacklistEntry[] = [
  { pattern: '스타벅스', matchType: 'contains' },
  { pattern: '메가커피', matchType: 'contains' },
  { pattern: '파리바게', matchType: 'contains' },
]
const ev = (name: string, categoryName = '음식점 > 카페') =>
  evaluateExclusion({ name, categoryName }, bl)

describe('evaluateExclusion', () => {
  it('블랙리스트 프랜차이즈를 배제한다', () => {
    expect(ev('스타벅스 양평DTR점')).toBe('franchise')
    expect(ev('메가커피 부평점')).toBe('franchise')
  })

  it('공백을 무시하고 매칭한다', () => {
    expect(ev('스타 벅스 양평점')).toBe('franchise')
  })

  it('테마카페 카테고리를 배제한다', () => {
    expect(ev('스터디온', '음식점 > 카페 > 테마카페 > 스터디카페')).toBe('category')
    expect(ev('놀숲', '음식점 > 카페 > 테마카페 > 만화/보드카페')).toBe('category')
    expect(ev('멍카페', '음식점 > 카페 > 테마카페 > 애견카페')).toBe('category')
    expect(ev('키즈랜드', '음식점 > 카페 > 테마카페 > 키즈카페')).toBe('category')
  })

  it('무인·테이크아웃 카테고리를 배제한다', () => {
    expect(ev('셀프커피', '음식점 > 카페 > 커피전문점 > 무인카페')).toBe('category')
  })

  it('지점 접미사만으로는 배제하지 않는다', () => {
    // 스펙 정정: 테라로사 서종점은 우리가 가장 원하는 부류다.
    expect(ev('테라로사 서종점')).toBe(null)
    expect(ev('앤트러사이트 서교점')).toBe(null)
  })

  it('일반 대형카페는 통과시킨다', () => {
    expect(ev('더티트렁크', '음식점 > 카페')).toBe(null)
    expect(ev('카페 진정성', '음식점 > 간식 > 제과,베이커리')).toBe(null)
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/pipeline/exclude.ts`:

```ts
import type { BlacklistEntry } from '../schema.js'

export type ExcludeReason = 'franchise' | 'category' | null

/**
 * 카테고리로 배제할 테마카페·무인점 키워드.
 * 딸들이 고1·중2라 키즈카페는 이미 졸업했다 (스펙 2절).
 */
const EXCLUDED_CATEGORY_KEYWORDS = [
  '스터디', '만화', '보드', '애견', '반려', '키즈', '룸카페', '무인', '테이크아웃',
] as const

const squeeze = (s: string) => s.replace(/\s+/g, '')

function hit(name: string, e: BlacklistEntry): boolean {
  const n = squeeze(name)
  const p = squeeze(e.pattern)
  if (e.matchType === 'exact') return n === p
  if (e.matchType === 'regex') return new RegExp(e.pattern).test(name)
  return n.includes(p)
}

/**
 * Layer 1 — 규칙 기반 하드 배제. LLM 을 쓰지 않는다.
 *
 * 스펙 정정: `"OO점"` 지점 접미사 규칙은 폐기했다. 테라로사 서종점·
 * 앤트러사이트 서교점처럼 우리가 가장 원하는 대형 지점을 잘라낸다.
 * 명시적 블랙리스트(data/blacklist.json)만 쓴다.
 */
export function evaluateExclusion(
  input: { name: string; categoryName: string },
  blacklist: BlacklistEntry[],
): ExcludeReason {
  if (blacklist.some((e) => hit(input.name, e))) return 'franchise'
  if (EXCLUDED_CATEGORY_KEYWORDS.some((k) => input.categoryName.includes(k))) return 'category'
  return null
}
```

- [ ] **Step 4: 테스트 통과 확인** — PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/exclude.ts tests/pipeline/exclude.test.ts
git commit -m "feat: Layer 1 하드 배제 (순수 함수)"
```

본문:
```
지점 접미사 규칙을 넣지 않았다. 스펙에는 있었지만 테라로사 서종점·
앤트러사이트 서교점처럼 우리가 가장 원하는 대형 지점을 잘라낸다.
명시적 블랙리스트만 쓴다 — 오탐이 없다.

블랙리스트는 data/blacklist.json 이므로 신규 프랜차이즈가 생겨도
배포 없이 대응된다.
```

---

## Task 8: Layer 2 — 관련성 판정 + 화제량 (순수 함수)

**이 태스크가 파이프라인 전체에서 가장 중요하다.** 동네 카페를 걸러내는
신호가 여기서 나온다.

**Files:**
- Create: `src/pipeline/relevance.ts`, `src/pipeline/buzz.ts`
- Test: `tests/pipeline/relevance.test.ts`, `tests/pipeline/buzz.test.ts`

**Interfaces:**
- Consumes: `BlogDoc` (Task 6)
- Produces:
  - `isRelevant(doc: BlogDoc, cafeName: string): boolean`
  - `isAmbiguousName(name: string): boolean`
  - `computeBuzz(input: { docs, cafeName, now }): BuzzMetrics`
  - `type BuzzMetrics = { receivedCount, relevantCount, precision, spanDays, postsPer30, posts30d, postsPrev, firstPostDate, latestPostDate, acceleration, suspectAmbiguous }`
  - `passesLayer2(m: BuzzMetrics, opts?): { pass: boolean; reason?: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/relevance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isRelevant, isAmbiguousName } from '../../src/pipeline/relevance.js'

const doc = (title: string, contents = '') => ({
  title, contents, url: 'https://blog.naver.com/x', blogName: 'b', dateTime: new Date(),
})

describe('isRelevant', () => {
  it('상호명과 카페 문맥어가 모두 있으면 관련이다', () => {
    expect(isRelevant(doc('양평 테라로사 카페 다녀왔어요'), '테라로사')).toBe(true)
  })

  it('상호명만 있고 카페 문맥어가 없으면 관련이 아니다', () => {
    // "가평 수목원" 문제 — 상호가 일반명사면 무관한 글이 대량으로 걸린다
    expect(isRelevant(doc('가평 수목원 산책로 단풍 구경'), '수목원')).toBe(false)
  })

  it('본문에만 있어도 관련이다', () => {
    expect(isRelevant(doc('주말 나들이', '테라로사에서 빵 사왔어요'), '테라로사')).toBe(true)
  })

  it('상호명이 없으면 관련이 아니다', () => {
    expect(isRelevant(doc('양평 브런치 카페 추천'), '테라로사')).toBe(false)
  })

  it('공백 차이를 무시한다', () => {
    expect(isRelevant(doc('더티 트렁크 카페'), '더티트렁크')).toBe(true)
  })

  it('여러 문맥어 중 하나만 있어도 된다', () => {
    expect(isRelevant(doc('테라로사 빵 맛있다'), '테라로사')).toBe(true)
    expect(isRelevant(doc('테라로사 디저트 최고'), '테라로사')).toBe(true)
  })
})

describe('isAmbiguousName', () => {
  it('2글자 이하는 모호하다', () => {
    expect(isAmbiguousName('숲')).toBe(true)
    expect(isAmbiguousName('마당')).toBe(true)
  })

  it('일반명사 사전에 걸리면 모호하다', () => {
    expect(isAmbiguousName('수목원')).toBe(true)
    expect(isAmbiguousName('정원')).toBe(true)
  })

  it('고유한 상호는 모호하지 않다', () => {
    expect(isAmbiguousName('더티트렁크')).toBe(false)
    expect(isAmbiguousName('테라로사')).toBe(false)
  })
})
```

`tests/pipeline/buzz.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeBuzz, passesLayer2 } from '../../src/pipeline/buzz.js'

const NOW = new Date('2026-08-20T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000)
const mk = (n: number, dayOffsets: number[], name = '테라로사') =>
  dayOffsets.slice(0, n).map((d) => ({
    title: `${name} 카페 후기`, contents: '', url: 'u', blogName: 'b', dateTime: daysAgo(d),
  }))

describe('computeBuzz', () => {
  it('관련 문서만 세어 정밀도를 낸다', () => {
    const docs = [
      ...mk(3, [1, 2, 3]),
      { title: '무관한 글', contents: '', url: 'u', blogName: 'b', dateTime: daysAgo(1) },
    ]
    const m = computeBuzz({ docs, cafeName: '테라로사', now: NOW })
    expect(m.receivedCount).toBe(4)
    expect(m.relevantCount).toBe(3)
    expect(m.precision).toBeCloseTo(0.75, 4)
  })

  it('기간으로 월 발행률을 환산한다', () => {
    // 관련 10건이 20일에 걸침 -> 월 15건
    const m = computeBuzz({ docs: mk(10, [0,2,4,6,8,10,12,14,16,20]), cafeName: '테라로사', now: NOW })
    expect(m.spanDays).toBeCloseTo(20, 1)
    expect(m.postsPer30).toBeCloseTo(15, 0)
  })

  it('없는 카페는 정밀도 0, 발행률 0 이다', () => {
    const docs = [{ title: '엉뚱한 글', contents: '', url: 'u', blogName: 'b', dateTime: daysAgo(1) }]
    const m = computeBuzz({ docs, cafeName: '존재안함카페', now: NOW })
    expect(m.precision).toBe(0)
    expect(m.postsPer30).toBe(0)
    expect(m.relevantCount).toBe(0)
  })

  it('최근 30일이 이전보다 많으면 가속도가 1을 넘는다', () => {
    const recent = mk(12, [1,2,3,4,5,6,7,8,9,10,11,12])
    const old = mk(4, [40,50,60,70])
    const m = computeBuzz({ docs: [...recent, ...old], cafeName: '테라로사', now: NOW })
    expect(m.posts30d).toBe(12)
    expect(m.postsPrev).toBe(4)
    expect(m.acceleration).toBeGreaterThan(1)
  })

  it('발행률이 과다하면 일반명사 오염을 의심한다', () => {
    // 50건이 2일에 걸침 -> 월 750건. "가평 수목원" 패턴.
    const m = computeBuzz({ docs: mk(50, Array.from({length:50},(_,i)=>i%2)), cafeName: '테라로사', now: NOW })
    expect(m.suspectAmbiguous).toBe(true)
  })

  it('문서가 없으면 0으로 채우고 던지지 않는다', () => {
    const m = computeBuzz({ docs: [], cafeName: '테라로사', now: NOW })
    expect(m.precision).toBe(0)
    expect(m.firstPostDate).toBeNull()
  })
})

describe('passesLayer2', () => {
  const base = { precision: 0.9, postsPer30: 50, firstPostDate: '2020-01-01', suspectAmbiguous: false } as any

  it('정밀도와 발행률이 충분하면 통과한다', () => {
    expect(passesLayer2(base, { now: NOW }).pass).toBe(true)
  })

  it('정밀도가 낮으면 탈락한다', () => {
    expect(passesLayer2({ ...base, precision: 0.1 }, { now: NOW })).toMatchObject({ pass: false })
  })

  it('발행률이 낮으면 탈락한다', () => {
    expect(passesLayer2({ ...base, postsPer30: 3 }, { now: NOW })).toMatchObject({ pass: false })
  })

  it('신규 오픈은 발행률 컷을 면제한다', () => {
    const newbie = { ...base, postsPer30: 3, firstPostDate: '2026-07-01' }  // 50일 전
    expect(passesLayer2(newbie, { now: NOW }).pass).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/pipeline/relevance.ts`:

```ts
import type { BlogDoc } from '../sources/kakao-blog.js'

/**
 * 카페 문맥어. 상호명만으로는 부족하다 — "가평 수목원" 은 상호명을
 * 포함하지만 카페 글이 아니다 (실측: 정밀도 100%, 월 634건).
 */
const CAFE_CONTEXT = ['카페', '베이커리', '커피', '빵', '디저트', '브런치', '까페'] as const

/** 일반명사 상호. 이 목록에 걸리면 골든셋 경계 구간으로 강제 편입한다. */
const AMBIGUOUS_NAMES = new Set([
  '수목원', '정원', '마당', '숲', '뜰', '언덕', '호수', '바다', '하늘',
  '농원', '식물원', '공원', '카페', '커피', '베이커리',
])

const squeeze = (s: string) => s.replace(/\s+/g, '')

/**
 * Layer 2 관련성 판정. 두 조건을 **모두** 요구한다 (Global Constraints).
 *   1) 제목·본문에 상호명 포함
 *   2) 카페 문맥어 하나 이상 포함
 */
export function isRelevant(doc: BlogDoc, cafeName: string): boolean {
  const hay = squeeze(`${doc.title} ${doc.contents}`)
  if (!hay.includes(squeeze(cafeName))) return false
  return CAFE_CONTEXT.some((w) => hay.includes(w))
}

export function isAmbiguousName(name: string): boolean {
  const n = squeeze(name)
  return n.length <= 2 || AMBIGUOUS_NAMES.has(n)
}
```

`src/pipeline/buzz.ts`:

```ts
import type { BlogDoc } from '../sources/kakao-blog.js'
import { isRelevant } from './relevance.js'

const DAY = 86_400_000

export interface BuzzMetrics {
  receivedCount: number
  relevantCount: number
  precision: number
  spanDays: number
  postsPer30: number
  posts30d: number
  postsPrev: number
  firstPostDate: string | null
  latestPostDate: string | null
  acceleration: number
  /** 발행률 과다 — 일반명사 오염 의심 */
  suspectAmbiguous: boolean
}

/** 월 300건을 넘으면 카페 한 곳의 글이 아닐 가능성이 높다 (실측 근거: 수목원 634) */
const AMBIGUOUS_RATE_THRESHOLD = 300

export function computeBuzz(input: {
  docs: BlogDoc[]
  cafeName: string
  now: Date
}): BuzzMetrics {
  const { docs, cafeName, now } = input
  const relevant = docs.filter((d) => isRelevant(d, cafeName))
  const times = relevant.map((d) => d.dateTime.getTime()).sort((a, b) => b - a)
  const t = now.getTime()

  const empty = times.length === 0
  const spanDays = times.length > 1 ? (times[0]! - times[times.length - 1]!) / DAY : 0
  const postsPer30 = empty ? 0 : spanDays > 0 ? (times.length * 30) / spanDays : times.length

  const posts30d = times.filter((x) => t - x <= 30 * DAY).length
  const postsPrev = times.filter((x) => t - x > 30 * DAY && t - x <= 90 * DAY).length
  const baseline30 = postsPrev / 2
  // 라플라스 스무딩. 표본이 작을 때 가속도가 폭주하지 않게 한다.
  const acceleration = (posts30d + 3) / (baseline30 + 3)

  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

  return {
    receivedCount: docs.length,
    relevantCount: relevant.length,
    precision: docs.length ? relevant.length / docs.length : 0,
    spanDays: Number(spanDays.toFixed(2)),
    postsPer30: Number(postsPer30.toFixed(2)),
    posts30d,
    postsPrev,
    firstPostDate: empty ? null : iso(times[times.length - 1]!),
    latestPostDate: empty ? null : iso(times[0]!),
    acceleration: Number(acceleration.toFixed(4)),
    suspectAmbiguous: postsPer30 > AMBIGUOUS_RATE_THRESHOLD,
  }
}

export interface Layer2Options {
  now: Date
  minPrecision?: number
  minPostsPer30?: number
  newOpeningDays?: number
}

/**
 * Layer 2 컷. 초기값은 스펙 v3 기준이며 13.1절 골든셋으로 보정한다.
 * 실측 기준값: 테라로사 96%/월86, 더티트렁크 86%/월69, 없는카페 0%/월0.
 */
export function passesLayer2(
  m: Pick<BuzzMetrics, 'precision' | 'postsPer30' | 'firstPostDate'>,
  opts: Layer2Options,
): { pass: boolean; reason?: string } {
  const { now, minPrecision = 0.3, minPostsPer30 = 8, newOpeningDays = 180 } = opts

  if (m.precision < minPrecision) {
    return { pass: false, reason: `정밀도 ${(m.precision * 100).toFixed(0)}% < ${minPrecision * 100}%` }
  }

  // 신규 오픈 구제 — 없으면 갓 오픈한 대형카페가 전부 탈락한다
  const first = m.firstPostDate ? new Date(m.firstPostDate).getTime() : null
  const isNew = first !== null && (now.getTime() - first) / DAY <= newOpeningDays
  if (isNew) return { pass: true }

  if (m.postsPer30 < minPostsPer30) {
    return { pass: false, reason: `월 ${m.postsPer30.toFixed(1)}건 < ${minPostsPer30}건` }
  }
  return { pass: true }
}
```

- [ ] **Step 4: 테스트 통과 확인** — `npx vitest run tests/pipeline/` PASS (19 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/relevance.ts src/pipeline/buzz.ts tests/pipeline/relevance.test.ts tests/pipeline/buzz.test.ts
git commit -m "feat: Layer 2 관련성 판정과 화제량 산출"
```

본문:
```
스펙 v3 의 핵심. total_count 를 쓰지 않고 문서를 직접 검증한다.
다음 검색의 total_count 는 OR 매칭이라 존재하지 않는 카페도 3,434건을
받는다 (실측).

관련성은 상호명 포함 AND 카페 문맥어 포함을 모두 요구한다. 상호명만
보면 "가평 수목원" 이 정밀도 100%, 월 634건으로 통과한다 — 카페 글이
아니라 수목원 전반에 대한 글이다.

컷 초기값(정밀도 0.30, 월 8건)은 골든셋으로 보정할 값이다.
now 를 주입받아 I/O 없이 테스트된다.
```

---

## Task 9: LLM 클라이언트 (provider-agnostic)

**Files:**
- Create: `src/llm/types.ts`, `src/llm/gemini.ts`, `src/llm/anthropic.ts`, `src/llm/index.ts`
- Test: `tests/llm/gemini.test.ts`

**Interfaces:**
- Consumes: `Fetcher`, `SourceError` (Task 4)
- Produces:
  - `interface LlmClient { name: string; modelVersion: string; extract<T>(opts): Promise<T> }`
  - `createGemini(deps): LlmClient`
  - `createAnthropic(deps): LlmClient`
  - `createLlm(env, deps): LlmClient` — `LLM_PROVIDER` 로 분기

**설계 노트 (Task 0 실측 반영):**
- 주력 모델 **`gemini-3.1-flash-lite`**. `gemini-3.6-flash` 와 동일한 정답을
  내면서 **11배 빠르다** (1.9초 vs 21초)
- **별칭 금지.** `gemini-flash-latest` 가 HTTP 503 을 반환했다
- zod 스키마로 결과를 재검증한다. `responseSchema` 를 줘도 `evidence` 가 빈
  문자열로 오는 경우를 잡아야 한다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/llm/gemini.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createGemini } from '../../src/llm/gemini.js'

const Schema = z.object({ scale: z.string(), evidence: z.string().min(1) })
const reply = (obj: unknown) =>
  new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  }), { status: 200 })

const deps = (fetcher: any) => ({
  apiKey: 'k', fetcher, limit: <T,>(f: () => Promise<T>) => f(),
})

describe('createGemini', () => {
  it('구조화 출력을 파싱해 돌려준다', async () => {
    const llm = createGemini(deps(async () => reply({ scale: '대형', evidence: '200석' })))
    expect(await llm.extract({ prompt: 'p', schema: Schema })).toEqual({ scale: '대형', evidence: '200석' })
  })

  it('별칭이 아니라 고정 버전을 호출한다', async () => {
    let url = ''
    const llm = createGemini(deps(async (u: string) => { url = u; return reply({ scale: '대형', evidence: 'e' }) }))
    await llm.extract({ prompt: 'p', schema: Schema })
    expect(url).toContain('gemini-3.1-flash-lite')
    expect(url).not.toContain('latest')   // 별칭은 503 을 뱉는다 (실측)
  })

  it('스키마 위반이면 재시도한다', async () => {
    let n = 0
    const llm = createGemini(deps(async () => {
      n++
      return n === 1 ? reply({ scale: '대형', evidence: '' }) : reply({ scale: '대형', evidence: 'ok' })
    }))
    expect(await llm.extract({ prompt: 'p', schema: Schema, maxRetries: 2 })).toMatchObject({ evidence: 'ok' })
    expect(n).toBe(2)
  })

  it('재시도를 다 써도 실패하면 던진다', async () => {
    const llm = createGemini(deps(async () => reply({ scale: '대형', evidence: '' })))
    await expect(llm.extract({ prompt: 'p', schema: Schema, maxRetries: 2 })).rejects.toThrow(/스키마/)
  })

  it('escalateTo 를 주면 재시도에서 상위 모델로 올린다', async () => {
    const urls: string[] = []
    let n = 0
    const llm = createGemini(deps(async (u: string) => {
      urls.push(u); n++
      return n === 1 ? reply({ scale: '대형', evidence: '' }) : reply({ scale: '대형', evidence: 'ok' })
    }))
    await llm.extract({ prompt: 'p', schema: Schema, maxRetries: 2, escalateTo: 'gemini-3.6-flash' })
    expect(urls[0]).toContain('gemini-3.1-flash-lite')
    expect(urls[1]).toContain('gemini-3.6-flash')
  })

  it('modelVersion 을 노출한다 (재처리 판단용)', () => {
    expect(createGemini(deps(async () => reply({}))).modelVersion).toBe('gemini-3.1-flash-lite')
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/llm/types.ts`:

```ts
import type { z } from 'zod'

export interface ExtractOptions<T> {
  prompt: string
  schema: z.ZodType<T>
  maxRetries?: number
  /** 재시도 시 올려붙일 상위 모델 */
  escalateTo?: string
}

/**
 * LLM 경계. Gemini 무료 티어를 쓰지만 정책이 바뀌면 Anthropic 으로
 * .env 한 줄 교체로 옮긴다 (스펙 6.6 원칙 3).
 */
export interface LlmClient {
  readonly name: string
  readonly modelVersion: string
  extract<T>(opts: ExtractOptions<T>): Promise<T>
}
```

`src/llm/gemini.ts`:

```ts
import { SourceError } from '../sources/rate-limiter.js'
import type { Fetcher } from '../sources/types.js'
import type { ExtractOptions, LlmClient } from './types.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * 실측(2026-08-20): gemini-3.1-flash-lite 가 gemini-3.6-flash 와 동일한
 * 정답을 내면서 11배 빠르다 (1.9초 vs 21초).
 * 별칭(gemini-flash-latest)은 HTTP 503 을 반환했으므로 쓰지 않는다.
 */
const DEFAULT_MODEL = 'gemini-3.1-flash-lite'

export interface GeminiDeps {
  apiKey: string
  fetcher: Fetcher
  limit: <T>(fn: () => Promise<T>) => Promise<T>
  model?: string
}

export function createGemini(deps: GeminiDeps): LlmClient {
  const { apiKey, fetcher, limit, model = DEFAULT_MODEL } = deps

  async function call(m: string, prompt: string): Promise<string> {
    return limit(async () => {
      const res = await fetcher(`${BASE}/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new SourceError(`gemini HTTP ${res.status}: ${body.slice(0, 200)}`, res.status)
      }
      const b = await res.json() as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      return b.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    })
  }

  return {
    name: 'gemini',
    modelVersion: model,

    async extract<T>(opts: ExtractOptions<T>): Promise<T> {
      const { prompt, schema, maxRetries = 3, escalateTo } = opts
      let lastIssue = ''
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // 첫 시도는 lite, 재시도부터는 상위 모델로 승급 (스펙 v3 6.3)
        const m = attempt > 0 && escalateTo ? escalateTo : model
        const text = await call(m, attempt === 0 ? prompt
          : `${prompt}\n\n이전 응답이 스키마를 위반했다: ${lastIssue}\n반드시 스키마를 지켜라.`)
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          lastIssue = 'JSON 파싱 실패'
          continue
        }
        const parsed = schema.safeParse(json)
        if (parsed.success) return parsed.data
        lastIssue = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      }
      throw new Error(`LLM 스키마 검증 실패 (${maxRetries}회 시도): ${lastIssue}`)
    },
  }
}
```

`src/llm/anthropic.ts` — 교체 가능성을 코드로 증명한다. 지금은 쓰지 않지만
인터페이스가 실제로 provider 를 갈아끼울 수 있음을 보인다.

```ts
import { SourceError } from '../sources/rate-limiter.js'
import type { Fetcher } from '../sources/types.js'
import type { ExtractOptions, LlmClient } from './types.js'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export interface AnthropicDeps {
  apiKey: string
  fetcher: Fetcher
  limit: <T>(fn: () => Promise<T>) => Promise<T>
  model?: string
}

export function createAnthropic(deps: AnthropicDeps): LlmClient {
  const { apiKey, fetcher, limit, model = DEFAULT_MODEL } = deps

  return {
    name: 'anthropic',
    modelVersion: model,

    async extract<T>(opts: ExtractOptions<T>): Promise<T> {
      const { prompt, schema, maxRetries = 3 } = opts
      let lastIssue = ''
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const text = await limit(async () => {
          const res = await fetcher('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model,
              max_tokens: 1024,
              temperature: 0,
              messages: [{
                role: 'user',
                content: attempt === 0 ? prompt
                  : `${prompt}\n\n이전 응답이 스키마를 위반했다: ${lastIssue}`,
              }],
            }),
          })
          if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new SourceError(`anthropic HTTP ${res.status}: ${body.slice(0, 200)}`, res.status)
          }
          const b = await res.json() as { content?: { text?: string }[] }
          return b.content?.[0]?.text ?? ''
        })

        const m = text.match(/\{[\s\S]*\}/)
        if (!m) { lastIssue = 'JSON 블록 없음'; continue }
        let json: unknown
        try { json = JSON.parse(m[0]) } catch { lastIssue = 'JSON 파싱 실패'; continue }
        const parsed = schema.safeParse(json)
        if (parsed.success) return parsed.data
        lastIssue = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      }
      throw new Error(`LLM 스키마 검증 실패 (${maxRetries}회 시도): ${lastIssue}`)
    },
  }
}
```

`src/llm/index.ts`:

```ts
import { createGemini } from './gemini.js'
import { createAnthropic } from './anthropic.js'
import type { LlmClient } from './types.js'
import type { Fetcher } from '../sources/types.js'

export type { LlmClient, ExtractOptions } from './types.js'
export { createGemini, createAnthropic }

export function createLlm(
  env: { LLM_PROVIDER: string; GEMINI_API_KEY?: string; ANTHROPIC_API_KEY?: string },
  deps: { fetcher: Fetcher; limit: <T>(fn: () => Promise<T>) => Promise<T> },
): LlmClient {
  if (env.LLM_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 가 없다')
    return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY, ...deps })
  }
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 가 없다')
  return createGemini({ apiKey: env.GEMINI_API_KEY, ...deps })
}
```

- [x] **Step 4: `env.ts` 갱신 — Task 1 에서 이미 처리됨**

원래 이 스텝에서 `EnvSchema` 를 v3 로 고치게 되어 있었다. 틀린 것을 알면서
짜고 다시 짜는 낭비이므로 **Task 1 이 처음부터 v3 스키마로 작성**되도록
계획을 고쳤다. `LLM_PROVIDER` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` /
`DATA_DIR` 이 이미 검증되고 있으므로 여기서 할 일이 없다.

`createLlm` 이 읽는 필드가 Task 1 의 `Env` 타입과 일치하는지만 확인한다.

- [ ] **Step 5: 테스트 통과 확인** — `npx vitest run` 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/llm/ src/config/env.ts .env.example tests/llm/ tests/config/env.test.ts
git commit -m "feat: provider-agnostic LLM 클라이언트 (Gemini 주력)"
```

본문:
```
Task 0 실측 반영:
- gemini-3.1-flash-lite 를 주력으로. gemini-3.6-flash 와 동일한 정답에
  11배 빠르다 (1.9초 vs 21초). 1,200곳 추출이 7시간에서 38분으로.
- 별칭(*-latest) 금지. gemini-flash-latest 가 HTTP 503 을 반환했다.
- 재시도 시 escalateTo 로 상위 모델에 올려붙인다.

responseSchema 를 주더라도 zod 로 다시 검증한다. evidence 가 빈
문자열로 오는 경우를 잡아야 하기 때문이다 (스펙 Layer 3).

Anthropic 구현도 함께 둔다. 지금 쓰지 않지만 인터페이스가 실제로
provider 를 갈아끼울 수 있음을 코드로 증명한다.

.env 에서 네이버·Supabase 를 제거했다. 관리 키가 2개다.
```

---

## Task 10: Layer 3 — LLM 속성 추출

**Files:**
- Create: `src/llm/prompts.ts`, `src/pipeline/extract.ts`
- Test: `tests/pipeline/extract.test.ts`

**Interfaces:**
- Consumes: `LlmClient` (Task 9), `BlogDoc` (Task 6), `CafeAttributesSchema` (Task 2)
- Produces:
  - `buildExtractPrompt(input: { name, sigungu, categoryName, snippets, parkingSnippets }): string`
  - `extractAttributes(deps: { llm }, input): Promise<CafeAttributes>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/pipeline/extract.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildExtractPrompt } from '../../src/llm/prompts.js'
import { extractAttributes } from '../../src/pipeline/extract.js'

const input = {
  name: '테라로사 서종점',
  sigungu: '양평군',
  categoryName: '음식점 > 카페',
  snippets: ['2층 통창에 좌석 200석 넘어요', '직접 굽는 빵이 많아요'],
  parkingSnippets: ['전용 주차장 50대 이상, 주말에도 여유'],
}

describe('buildExtractPrompt', () => {
  it('상호·지역·스니펫을 프롬프트에 담는다', () => {
    const p = buildExtractPrompt(input)
    expect(p).toContain('테라로사 서종점')
    expect(p).toContain('양평군')
    expect(p).toContain('2층 통창에 좌석 200석')
    expect(p).toContain('전용 주차장 50대')
  })

  it('evidence 인용을 명시적으로 요구한다', () => {
    expect(buildExtractPrompt(input)).toMatch(/인용/)
  })

  it('추측 금지를 명시한다', () => {
    // 환각 방지. 근거 없으면 ? 나 null 을 쓰게 한다.
    expect(buildExtractPrompt(input)).toMatch(/추측하지|모르면/)
  })
})

describe('extractAttributes', () => {
  const good = {
    scale: '대형', seatsEstimate: 200, floors: 2, hasBakery: true,
    breadBakedOnsite: true, menuLevel: 3, mealTypes: [], viewStrength: 3,
    viewTypes: ['강'], outdoorSeating: true, parkingGrade: 'A',
    parkingEvidence: '전용 주차장 50대 이상', photoSpot: 4, teenAppeal: 3,
    confidence: 0.85, evidence: '2층 통창에 좌석 200석 넘어요',
  }

  it('LLM 결과에 추출 시각과 모델 버전을 붙인다', async () => {
    const llm = {
      name: 'fake', modelVersion: 'gemini-3.1-flash-lite',
      extract: async () => good,
    } as any
    const r = await extractAttributes({ llm, now: new Date('2026-08-20T00:00:00Z') }, input)
    expect(r.modelVersion).toBe('gemini-3.1-flash-lite')
    expect(r.extractedAt).toBe('2026-08-20T00:00:00.000Z')
    expect(r.scale).toBe('대형')
  })

  it('주차 스니펫이 없으면 parkingGrade 를 ? 로 두는 프롬프트를 만든다', () => {
    const p = buildExtractPrompt({ ...input, parkingSnippets: [] })
    expect(p).toContain('주차 언급 없음')
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/llm/prompts.ts`:

```ts
export interface ExtractPromptInput {
  name: string
  sigungu: string
  categoryName: string
  snippets: string[]
  parkingSnippets: string[]
}

export function buildExtractPrompt(i: ExtractPromptInput): string {
  const body = i.snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')
  const parking = i.parkingSnippets.length
    ? i.parkingSnippets.map((s, n) => `[P${n + 1}] ${s}`).join('\n')
    : '(주차 언급 없음)'

  return `너는 한국 카페 정보를 구조화하는 도구다. 아래 블로그 후기에서만
근거를 찾아 JSON 으로 답하라.

카페: ${i.name}
지역: ${i.sigungu}
카카오 분류: ${i.categoryName}

--- 블로그 후기 ---
${body}

--- 주차 관련 후기 ---
${parking}

규칙:
1. 후기에 없는 것을 추측하지 마라. 모르면 null 을 쓰고, parkingGrade 는 "?" 를 쓴다.
2. evidence 에는 판단 근거가 된 원문을 그대로 인용하라. 요약하지 마라. 비워두지 마라.
3. parkingEvidence 에도 주차 판단의 근거 원문을 인용하라.
4. scale: 좌석 100석 이상 또는 2층 이상이면 "대형", 30석 미만이면 "소형", 그 외 "중형".
5. menuLevel: 1=음료 위주, 2=빵·케이크 갖춤, 3=파스타·피자 등 식사 가능.
6. viewStrength: 0=뷰 없음, 3=뷰가 방문 이유가 될 만함, 5=뷰가 압도적.
7. parkingGrade: A=전용 넉넉, B=전용 협소, C=인근 유료·공영 의존, D=주차 불가, ?=불명.
8. teenAppeal: 중고생이 좋아할 요소(사진 스팟, 전시, 디저트)가 많을수록 높게.
9. confidence: 후기 정보가 빈약하면 낮게.`
}

export function buildHarvestPrompt(regionLabel: string, snippets: string[]): string {
  return `아래는 "${regionLabel}" 카페를 소개하는 블로그 글 조각들이다.
글에서 **실제 카페 상호명**만 뽑아 JSON 배열로 답하라.

${snippets.map((s, n) => `[${n + 1}] ${s}`).join('\n')}

규칙:
1. 상호명만 뽑는다. "대형카페", "베이커리카페" 같은 일반어는 제외한다.
2. 지역명("${regionLabel}")은 상호명에 붙이지 마라.
3. 프랜차이즈(스타벅스·투썸·메가커피·파리바게뜨 등)는 제외한다.
4. 확실하지 않으면 넣지 마라. 적게 뽑는 편이 낫다.
5. 같은 카페가 여러 번 나오면 한 번만 넣는다.`
}
```

`src/pipeline/extract.ts`:

```ts
import { z } from 'zod'
import { CafeAttributesSchema, type CafeAttributes } from '../schema.js'
import { buildExtractPrompt, type ExtractPromptInput } from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'

/** LLM 이 채우는 부분만. extractedAt·modelVersion 은 우리가 붙인다. */
const LlmAttributesSchema = CafeAttributesSchema.omit({
  extractedAt: true,
  modelVersion: true,
})

export async function extractAttributes(
  deps: { llm: LlmClient; now?: Date },
  input: ExtractPromptInput,
): Promise<CafeAttributes> {
  const { llm, now = new Date() } = deps
  const raw = await llm.extract({
    prompt: buildExtractPrompt(input),
    schema: LlmAttributesSchema as z.ZodType<z.infer<typeof LlmAttributesSchema>>,
    maxRetries: 3,
    escalateTo: 'gemini-3.6-flash',   // 재시도는 상위 모델로 (스펙 v3 6.3)
  })
  return CafeAttributesSchema.parse({
    ...raw,
    extractedAt: now.toISOString(),
    modelVersion: llm.modelVersion,
  })
}
```

- [ ] **Step 4: 테스트 통과 확인** — PASS

- [ ] **Step 5: 실제 LLM 으로 1회 수동 검증**

```bash
npx tsx -e "
import { loadEnv } from './src/config/env.js'
import { createGemini } from './src/llm/gemini.js'
import { extractAttributes } from './src/pipeline/extract.js'
const env = loadEnv()
const llm = createGemini({ apiKey: env.GEMINI_API_KEY, fetcher: fetch, limit: f => f() })
console.log(await extractAttributes({ llm }, {
  name: '테라로사 서종점', sigungu: '양평군', categoryName: '음식점 > 카페',
  snippets: ['2층 통창에 좌석 200석 넘고 빵도 직접 구워요'],
  parkingSnippets: ['주차장 넓어요'],
}))
"
```

`evidence` 에 원문이 인용되어 있는지 눈으로 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add src/llm/prompts.ts src/pipeline/extract.ts tests/pipeline/extract.test.ts
git commit -m "feat: Layer 3 LLM 속성 추출"
```

본문:
```
프롬프트가 추측 금지와 evidence 원문 인용을 명시적으로 요구한다.
근거를 못 대는 출력은 환각이므로 zod 의 evidence min(1) 이 거부하고
재시도가 상위 모델(gemini-3.6-flash)로 승급한다.

주차는 별도 스니펫으로 분리해 넣는다. 한국 블로거는 주차를 거의 항상
쓰므로 전용 검색 1회를 추가하면 등급 정확도가 크게 오른다 (스펙 7.3).
```

---

## Task 11: 그물 C — 블로그 큐레이션 수확

**Files:**
- Create: `src/pipeline/harvest.ts`
- Test: `tests/pipeline/harvest.test.ts`

**Interfaces:**
- Consumes: `LlmClient`, `createKakaoBlog`, `createKakaoLocal`, `curationQueries`
- Produces: `harvestCurated(deps, region): Promise<{ names: string[]; places: KakaoPlace[] }>`

**왜 필요한가 (실측):** `"양평 베이커리카페"` 로 카카오 키워드 검색을 돌렸을 때
1위가 **커피전문점** 카테고리의 무관한 카페였다. 카카오 키워드 검색은 상호명
매칭 위주라 상호에 "대형"이 없는 대형카페를 놓친다. 블로거가 이미 손으로
큐레이션한 "BEST N" 글에서 상호명을 뽑아 이 구멍을 메운다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from 'vitest'
import { harvestCurated } from '../../src/pipeline/harvest.js'

const blog = {
  search: async () => ({
    docs: [{ title: '양평 대형카페 BEST', contents: '테라로사와 더그림이 좋아요',
             url: 'u', blogName: 'b', dateTime: new Date() }],
    totalCount: 1, payload: {},
  }),
}
const local = {
  searchKeyword: async (q: string) => ({
    places: [{ id: q.includes('테라로사') ? '1' : '2', placeName: q.split(' ').pop()!,
               categoryName: '음식점 > 카페', addressName: '', roadAddressName: '',
               phone: '', placeUrl: '', lat: 37.5, lng: 127.4 }],
    isEnd: true, payload: {},
  }),
}
const llm = { name: 'f', modelVersion: 'v', extract: async () => ({ names: ['테라로사', '더그림'] }) }
const store = { appendRaw: async () => 'p' }

describe('harvestCurated', () => {
  it('블로그에서 상호명을 뽑아 카카오로 정규화한다', async () => {
    const r = await harvestCurated({ blog, local, llm, store } as any,
      { sido: '경기', sigungu: '양평군' })
    expect(r.names).toEqual(['테라로사', '더그림'])
    expect(r.places).toHaveLength(2)
  })

  it('kakaoPlaceId 로 중복을 제거한다', async () => {
    const dupLocal = { searchKeyword: async () => ({
      places: [{ id: 'same', placeName: 'X', categoryName: '', addressName: '',
                 roadAddressName: '', phone: '', placeUrl: '', lat: 37, lng: 127 }],
      isEnd: true, payload: {} }) }
    const r = await harvestCurated({ blog, local: dupLocal, llm, store } as any,
      { sido: '경기', sigungu: '양평군' })
    expect(r.places).toHaveLength(1)
  })

  it('카카오에서 못 찾은 이름은 조용히 건너뛴다', async () => {
    const emptyLocal = { searchKeyword: async () => ({ places: [], isEnd: true, payload: {} }) }
    const r = await harvestCurated({ blog, local: emptyLocal, llm, store } as any,
      { sido: '경기', sigungu: '양평군' })
    expect(r.places).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/pipeline/harvest.ts`:

```ts
import { z } from 'zod'
import { curationQueries } from '../config/keywords.js'
import { buildHarvestPrompt } from '../llm/prompts.js'
import type { LlmClient } from '../llm/types.js'
import type { KakaoPlace } from '../sources/kakao-local.js'
import type { Region } from '../config/regions.js'
import type { Store } from '../store/types.js'

const HarvestSchema = z.object({ names: z.array(z.string().min(1)).max(40) })

export interface HarvestDeps {
  blog: { search: (q: string, o?: object) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }> }
  local: { searchKeyword: (q: string, page: number) => Promise<{ places: KakaoPlace[] }> }
  llm: LlmClient
  store: Pick<Store, 'appendRaw'>
}

export async function harvestCurated(
  deps: HarvestDeps,
  region: Region,
): Promise<{ names: string[]; places: KakaoPlace[] }> {
  const { blog, local, llm, store } = deps
  const label = `${region.sido} ${region.sigungu}`

  const snippets: string[] = []
  for (const q of curationQueries(label)) {
    const res = await blog.search(q, { size: 30, sort: 'accuracy' })
    await store.appendRaw('kakao-blog-curation', q, res.payload)
    snippets.push(...res.docs.map((d) => `${d.title} ${d.contents}`))
  }
  if (snippets.length === 0) return { names: [], places: [] }

  const { names } = await llm.extract({
    prompt: buildHarvestPrompt(label, snippets),
    schema: HarvestSchema,
    maxRetries: 2,
  })

  const seen = new Set<string>()
  const places: KakaoPlace[] = []
  for (const name of names) {
    // 정규화. 카카오에서 못 찾으면 조용히 건너뛴다 — 블로그 오타나
    // 폐업한 곳일 수 있고, 여기서 멈출 이유가 없다.
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

- [ ] **Step 4: 테스트 통과 확인** — PASS

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/harvest.ts tests/pipeline/harvest.test.ts
git commit -m "feat: 그물 C — 블로그 큐레이션 수확"
```

본문:
```
"양평 베이커리카페" 카카오 키워드 검색 1위가 무관한 커피전문점이었다
(Task 0 실측). 카카오 키워드 검색은 상호명 매칭 위주라 상호에 "대형"이
없는 대형카페를 놓친다.

블로거가 이미 손으로 큐레이션한 "BEST N" 글에서 상호명을 LLM 으로
뽑아 이 구멍을 메운다. 동네 카페는 그런 글에 등장하지 않는다.

카카오에서 못 찾은 이름은 조용히 건너뛴다. 블로그 오타나 폐업일 수
있고 여기서 파이프라인을 멈출 이유가 없다.
```

---

## Task 12: Layer 4 — 태그·메뉴·주차 판정 (순수 함수)

**Files:**
- Create: `src/pipeline/tag.ts`
- Test: `tests/pipeline/tag.test.ts`

**Interfaces:**
- Consumes: `CafeAttributes` (Task 2)
- Produces:
  - `const TAGS` — 성격 태그 8종 상수
  - `assignTags(attrs: CafeAttributes): string[]`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from 'vitest'
import { assignTags } from '../../src/pipeline/tag.js'
import type { CafeAttributes } from '../../src/schema.js'

const base: CafeAttributes = {
  scale: '대형', seatsEstimate: 200, floors: 2,
  hasBakery: false, breadBakedOnsite: false, menuLevel: 1,
  mealTypes: [], viewStrength: 0, viewTypes: [], outdoorSeating: false,
  parkingGrade: 'A', parkingEvidence: '', photoSpot: 2, teenAppeal: 2,
  confidence: 0.9, evidence: 'e',
  extractedAt: '2026-08-20T00:00:00.000Z', modelVersion: 'v',
}

describe('assignTags', () => {
  it('대형이면 대형카페 태그를 준다', () => {
    expect(assignTags(base)).toContain('대형카페')
  })

  it('대형 + 베이커리면 두 태그를 다 준다', () => {
    const t = assignTags({ ...base, hasBakery: true })
    expect(t).toContain('대형카페')
    expect(t).toContain('대형베이커리')
  })

  it('menuLevel 3 이면 브런치카페 태그를 준다', () => {
    expect(assignTags({ ...base, menuLevel: 3 })).toContain('브런치카페')
  })

  it('viewStrength 3 이상이면 뷰맛집이다', () => {
    expect(assignTags({ ...base, viewStrength: 3 })).toContain('뷰맛집')
  })

  it('소형은 뷰맛집 임계가 4로 올라간다', () => {
    // "작을수록 더 압도적이어야 통과" (스펙 7.5)
    const small = { ...base, scale: '소형' as const, seatsEstimate: 25 }
    expect(assignTags({ ...small, viewStrength: 3 })).not.toContain('뷰맛집')
    expect(assignTags({ ...small, viewStrength: 4 })).toContain('뷰맛집')
  })

  it('좌석 60석 미만이면 scale 과 무관하게 소형 규칙을 적용한다', () => {
    const t = assignTags({ ...base, seatsEstimate: 40, viewStrength: 3 })
    expect(t).not.toContain('뷰맛집')
  })

  it('정원·창고형·전시·디저트 태그를 붙인다', () => {
    expect(assignTags({ ...base, outdoorSeating: true, viewTypes: ['정원'] })).toContain('정원마당형')
    expect(assignTags({ ...base, viewTypes: ['창고형'] })).toContain('창고형')
    expect(assignTags({ ...base, viewTypes: ['전시'] })).toContain('전시복합문화')
    expect(assignTags({ ...base, mealTypes: ['케이크'] })).toContain('디저트특화')
  })

  it('아무 조건도 못 맞추면 빈 배열이다 — 이것이 동네 카페다', () => {
    const plain = { ...base, scale: '중형' as const, seatsEstimate: 50 }
    expect(assignTags(plain)).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/pipeline/tag.ts`:

```ts
import type { CafeAttributes } from '../schema.js'

/** 성격 태그 8종. 스펙 7.1. 여기서 늘리지 않는다 — 10개를 넘으면 의미가 사라진다. */
export const TAGS = [
  '대형베이커리', '대형카페', '브런치카페', '뷰맛집',
  '정원마당형', '창고형', '전시복합문화', '디저트특화',
] as const
export type Tag = (typeof TAGS)[number]

const SMALL_SEATS = 60
const GARDEN_WORDS = ['정원', '마당', '잔디', '산책', '수목']
const WAREHOUSE_WORDS = ['창고', '공장', '인더스트리얼', '층고']
const GALLERY_WORDS = ['전시', '갤러리', '서점', '편집숍', '미술']
const DESSERT_WORDS = ['케이크', '타르트', '젤라토', '디저트', '마카롱']

/**
 * Layer 4 — 성격 태그 부여. 중복 허용.
 *
 * 소형(좌석 60석 미만)은 임계값이 올라간다: "작을수록 더 압도적이어야
 * 통과한다" (스펙 7.5). 그냥 열어두면 20석 동네 카페가 뷰 태그 하나로
 * 밀려 들어온다.
 */
export function assignTags(a: CafeAttributes): string[] {
  const tags = new Set<string>()
  const seats = a.seatsEstimate ?? (a.scale === '대형' ? 120 : a.scale === '소형' ? 20 : 60)
  const isSmall = seats < SMALL_SEATS || a.scale === '소형'

  if (a.scale === '대형' && !isSmall) {
    tags.add('대형카페')
    if (a.hasBakery) tags.add('대형베이커리')
  }

  if (a.menuLevel === 3) tags.add('브런치카페')

  const viewCut = isSmall ? 4 : 3
  if (a.viewStrength >= viewCut) tags.add('뷰맛집')

  const haystack = [...(a.viewTypes ?? []), ...(a.mealTypes ?? []), a.evidence].join(' ')
  if (a.outdoorSeating && GARDEN_WORDS.some((w) => haystack.includes(w))) tags.add('정원마당형')
  if (WAREHOUSE_WORDS.some((w) => haystack.includes(w))) tags.add('창고형')
  if (GALLERY_WORDS.some((w) => haystack.includes(w))) tags.add('전시복합문화')
  if (DESSERT_WORDS.some((w) => haystack.includes(w))) tags.add('디저트특화')

  return [...tags]
}
```

- [ ] **Step 4: 테스트 통과 확인** — PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/tag.ts tests/pipeline/tag.test.ts
git commit -m "feat: Layer 4 성격 태그 8종 판정"
```

본문:
```
소형(좌석 60석 미만)은 태그 임계값이 올라간다. 뷰맛집이 3점에서
4점으로. 그냥 열어두면 20석 동네 카페가 뷰 태그 하나로 밀려 들어온다.
"작을수록 더 압도적이어야 통과한다" (스펙 7.5).

태그가 하나도 안 붙으면 그것이 동네 카페다. 별도 판별기를 만들지 않는다.
```

---

## Task 13: Layer 5 — 최종 게이트 (순수 함수)

**Files:**
- Create: `src/pipeline/gate.ts`
- Test: `tests/pipeline/gate.test.ts`

**Interfaces:**
- Produces: `passesGate(input: { tags, parkingGrade }, opts?: { cityMode?: boolean }): { pass: boolean; reason?: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from 'vitest'
import { passesGate } from '../../src/pipeline/gate.js'

describe('passesGate', () => {
  it('태그가 있고 주차 A 면 통과한다', () => {
    expect(passesGate({ tags: ['대형카페'], parkingGrade: 'A' }).pass).toBe(true)
  })

  it('태그가 0개면 동네 카페로 제외한다', () => {
    expect(passesGate({ tags: [], parkingGrade: 'A' }))
      .toMatchObject({ pass: false, reason: expect.stringContaining('동네') })
  })

  it('주차 D 는 차로 못 가므로 제외한다', () => {
    expect(passesGate({ tags: ['대형카페'], parkingGrade: 'D' }))
      .toMatchObject({ pass: false, reason: expect.stringContaining('주차') })
  })

  it('주차 C 는 기본 숨김, 도심 모드에서만 통과한다', () => {
    expect(passesGate({ tags: ['대형카페'], parkingGrade: 'C' }).pass).toBe(false)
    expect(passesGate({ tags: ['대형카페'], parkingGrade: 'C' }, { cityMode: true }).pass).toBe(true)
  })

  it('주차 불명(?)은 제외하지 않는다', () => {
    // 정보가 없다는 이유로 좋은 곳을 버리지 않는다. 카드에 배지로 알린다.
    expect(passesGate({ tags: ['뷰맛집'], parkingGrade: '?' }).pass).toBe(true)
  })

  it('주차 B 는 통과한다', () => {
    expect(passesGate({ tags: ['대형카페'], parkingGrade: 'B' }).pass).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

```ts
export interface GateInput {
  tags: string[]
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
}

/**
 * Layer 5 — 최종 게이트 (스펙 7.6).
 *
 * "동네 카페 = 성격 태그 0개" 가 조작적 정의다. 별도 판별기를 만들지 않는다.
 * 넣고 싶은 것의 정의를 명확히 하면 뺄 것은 자동으로 정의되며,
 * 9번째 태그를 추가해도 이 함수를 고칠 일이 없다.
 */
export function passesGate(
  input: GateInput,
  opts: { cityMode?: boolean } = {},
): { pass: boolean; reason?: string } {
  if (input.tags.length === 0) {
    return { pass: false, reason: '동네 카페 (성격 태그 0개)' }
  }
  if (input.parkingGrade === 'D') {
    return { pass: false, reason: '주차 불가 — 차로 갈 수 없다' }
  }
  if (input.parkingGrade === 'C' && !opts.cityMode) {
    return { pass: false, reason: '주차 C — 도심 모드에서만 노출' }
  }
  // '?' 는 제외하지 않는다. 정보가 없다는 이유로 좋은 곳을 버리지 않고
  // 카드에 "주차 미확인" 배지를 띄운다 (스펙 7.3).
  return { pass: true }
}
```

- [ ] **Step 4: 테스트 통과 확인** — PASS (6 tests)

- [ ] **Step 5: 커밋** — `git commit -m "feat: Layer 5 최종 게이트"`

---

## Task 14: 스코어링 — HotScore · FamilyFit · FinalScore (순수 함수)

**Files:**
- Create: `src/pipeline/score.ts`
- Test: `tests/pipeline/score.test.ts`

**Interfaces:**
- Produces:
  - `hotScore(m: BuzzMetrics, now: Date): number` (0~100)
  - `familyFit(input, now: Date): number` (0~1)
  - `finalScore(hot, fit): number`
  - `pickWeekendCandidates(scored, n): Scored[]` — 태그 다양성 제약 적용

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from 'vitest'
import { hotScore, familyFit, pickWeekendCandidates } from '../../src/pipeline/score.js'

const NOW = new Date('2026-08-20T00:00:00Z')
const m = (o: Partial<any> = {}) => ({
  precision: 0.95, postsPer30: 80, acceleration: 1.0,
  latestPostDate: '2026-08-19', firstPostDate: '2022-01-01', ...o,
})

describe('hotScore', () => {
  it('0~100 범위를 벗어나지 않는다', () => {
    const s = hotScore(m({ acceleration: 99, postsPer30: 9999 }) as any, NOW)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(100)
  })

  it('가속도가 높을수록 점수가 높다', () => {
    expect(hotScore(m({ acceleration: 4 }) as any, NOW))
      .toBeGreaterThan(hotScore(m({ acceleration: 1 }) as any, NOW))
  })

  it('precision 이 낮으면 전체가 깎인다', () => {
    // v3 핵심: 컷이 아니라 승수. 경계선 위 오염 카페가 만점받는 것을 막는다.
    const clean = hotScore(m({ precision: 1.0 }) as any, NOW)
    const dirty = hotScore(m({ precision: 0.4 }) as any, NOW)
    expect(dirty).toBeCloseTo(clean * 0.4, 0)
  })

  it('신규 오픈에 가산점을 준다', () => {
    expect(hotScore(m({ firstPostDate: '2026-07-01' }) as any, NOW))
      .toBeGreaterThan(hotScore(m({ firstPostDate: '2020-01-01' }) as any, NOW))
  })
})

describe('familyFit', () => {
  const f = (o: Partial<any> = {}) => familyFit({
    driveMinutes: 60, parkingGrade: 'A', menuLevel: 3,
    lastVisitedOn: null, outdoorOnly: false, teenAppeal: 3, ...o,
  }, NOW)

  it('가까울수록 높다', () => {
    expect(f({ driveMinutes: 30 })).toBeGreaterThan(f({ driveMinutes: 120 }))
  })

  it('주차 D 는 0 이다', () => {
    expect(f({ parkingGrade: 'D' })).toBe(0)
  })

  it('최근 6개월 내 방문한 곳은 크게 깎인다', () => {
    const recent = f({ lastVisitedOn: '2026-07-01' })
    expect(recent).toBeLessThan(f() * 0.3)
    expect(recent).toBeGreaterThan(0)   // 0 은 아니다 — "또 가고 싶다"를 허용
  })

  it('음료만 파는 곳(Lv1)은 감점된다', () => {
    expect(f({ menuLevel: 1 })).toBeLessThan(f({ menuLevel: 3 }))
  })

  it('한여름 야외 전용은 감점된다', () => {
    const summer = new Date('2026-08-01T00:00:00Z')
    const hot = familyFit({ driveMinutes: 60, parkingGrade: 'A', menuLevel: 3,
      lastVisitedOn: null, outdoorOnly: true, teenAppeal: 3 }, summer)
    const spring = familyFit({ driveMinutes: 60, parkingGrade: 'A', menuLevel: 3,
      lastVisitedOn: null, outdoorOnly: true, teenAppeal: 3 }, new Date('2026-05-01T00:00:00Z'))
    expect(hot).toBeLessThan(spring)
  })
})

describe('pickWeekendCandidates', () => {
  const c = (id: string, score: number, tags: string[]) => ({ id, score, tags })

  it('점수 순으로 뽑되 태그가 최소 2종 다르게 한다', () => {
    const picked = pickWeekendCandidates([
      c('a', 90, ['정원마당형']), c('b', 89, ['정원마당형']),
      c('c', 88, ['정원마당형']), c('d', 50, ['창고형']),
    ], 3)
    const kinds = new Set(picked.flatMap((p) => p.tags))
    expect(kinds.size).toBeGreaterThanOrEqual(2)
    expect(picked[0]!.id).toBe('a')
  })

  it('후보가 부족하면 있는 만큼만 준다', () => {
    expect(pickWeekendCandidates([c('a', 10, ['뷰맛집'])], 3)).toHaveLength(1)
  })

  it('다양성을 만들 수 없으면 점수 순으로 채운다', () => {
    const picked = pickWeekendCandidates(
      [c('a', 3, ['뷰맛집']), c('b', 2, ['뷰맛집']), c('c', 1, ['뷰맛집'])], 3)
    expect(picked).toHaveLength(3)
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/pipeline/score.ts`:

```ts
const DAY = 86_400_000
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export interface HotInput {
  precision: number
  postsPer30: number
  acceleration: number
  latestPostDate: string | null
  firstPostDate: string | null
}

/** 스펙 v3 8.1. precision 을 전체에 곱하는 것이 핵심 변경이다. */
export function hotScore(m: HotInput, now: Date): number {
  const t = now.getTime()
  const daysSince = m.latestPostDate ? (t - new Date(m.latestPostDate).getTime()) / DAY : 999
  const ageDays = m.firstPostDate ? (t - new Date(m.firstPostDate).getTime()) / DAY : 9999

  const accel = clamp(Math.log2(Math.max(m.acceleration, 0.01)) / 2, 0, 1)
  const volume = clamp(Math.log10(m.postsPer30 + 1) / 2.3, 0, 1)   // 월 200건이면 1.0
  const freshness = 1 / (1 + daysSince / 30)
  const novelty = ageDays <= 180 ? 1 : ageDays <= 365 ? 0.5 : 0

  const raw = 0.45 * accel + 0.30 * volume + 0.15 * freshness + 0.10 * novelty
  // precision 승수: 검색으로 식별 안 되는 카페는 다른 지표가 좋아도 내려간다.
  // 컷으로만 쓰면 경계선 바로 위의 오염 카페가 만점을 받는다.
  return clamp(100 * clamp(m.precision, 0, 1) * raw, 0, 100)
}

export interface FitInput {
  driveMinutes: number
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?'
  menuLevel: number
  lastVisitedOn: string | null
  outdoorOnly: boolean
  teenAppeal: number
}

const PARKING_MULT: Record<FitInput['parkingGrade'], number> =
  { A: 1.0, B: 0.85, C: 0.4, D: 0, '?': 0.7 }

/** 스펙 8.2. 취향 학습(taste_mult)은 v2 에서 제거했다 — 평점 입력이 없다. */
export function familyFit(i: FitInput, now: Date): number {
  const distance = Math.exp(-i.driveMinutes / 70)          // 70분에서 약 0.37
  const parking = PARKING_MULT[i.parkingGrade]
  const menu = i.menuLevel >= 3 ? 1.0 : i.menuLevel === 2 ? 0.95 : 0.75

  let unvisited = 1.0
  if (i.lastVisitedOn) {
    const days = (now.getTime() - new Date(i.lastVisitedOn).getTime()) / DAY
    // 0 으로 두지 않는 이유는 "거기 또 가고 싶다"를 허용하기 위함이다.
    unvisited = days <= 180 ? 0.15 : days <= 365 ? 0.5 : 0.8
  }

  const month = now.getUTCMonth() + 1
  const harsh = month >= 7 && month <= 8 || month === 12 || month <= 2
  const season = i.outdoorOnly ? (harsh ? 0.5 : 1.2) : 1.0

  const teen = 0.85 + 0.03 * clamp(i.teenAppeal, 0, 5)

  return distance * parking * menu * unvisited * season * teen
}

export const finalScore = (hot: number, fit: number) => hot * fit

export interface Scored { id: string; score: number; tags: string[] }

/**
 * 주말 후보 선정. 태그 다양성 제약: 상위 3곳이 전부 "정원·마당형"이면
 * 선택의 의미가 없으므로 최소 2종이 서로 다르게 한다 (스펙 8.4).
 */
export function pickWeekendCandidates(all: Scored[], n = 3): Scored[] {
  const sorted = [...all].sort((a, b) => b.score - a.score)
  const picked: Scored[] = []
  const used = new Set<string>()

  for (const c of sorted) {
    if (picked.length >= n) break
    const fresh = c.tags.some((t) => !used.has(t))
    // 마지막 한 자리를 남길 때까지는 새 태그를 가진 후보를 우선한다
    if (picked.length > 0 && !fresh && picked.length < n) continue
    picked.push(c)
    c.tags.forEach((t) => used.add(t))
  }
  // 다양성을 만들 수 없으면 점수 순으로 채운다
  for (const c of sorted) {
    if (picked.length >= n) break
    if (!picked.includes(c)) picked.push(c)
  }
  return picked.slice(0, n)
}
```

- [ ] **Step 4: 테스트 통과 확인** — PASS (12 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/pipeline/score.ts tests/pipeline/score.test.ts
git commit -m "feat: HotScore · FamilyFit · 주말 후보 선정"
```

본문:
```
precision 을 HotScore 전체에 곱한다 (v3 핵심). 컷으로만 쓰면 경계선
바로 위의 오염된 카페가 만점을 받는다.

최근 6개월 방문은 0.15 로 깎되 0 으로 두지 않는다 — "거기 또 가고
싶다"를 막을 이유는 없다.

주말 후보 3곳은 성격 태그가 최소 2종 다르게 강제한다. 전부 정원형이면
선택의 의미가 없다.

now 를 인자로 받아 계절 승수까지 결정론적으로 테스트된다.
```

---

## Task 15: 발굴 잡 — 파이프라인 통합 (weekly-discover)

**Files:**
- Create: `src/jobs/weekly-discover.ts`
- Test: `tests/jobs/weekly-discover.test.ts`

**Interfaces:**
- Consumes: Task 3~14 전부
- Produces: `runDiscover(deps, opts): Promise<{ discovered, excluded, extracted, gated, errors }>`

- [ ] **Step 1: 실패하는 테스트 작성** — 모든 의존을 가짜로 주입해 오프라인 검증

```ts
import { describe, it, expect } from 'vitest'
import { runDiscover } from '../../src/jobs/weekly-discover.js'

const place = (id: string, name: string) => ({
  id, placeName: name, categoryName: '음식점 > 카페', addressName: '경기 양평군',
  roadAddressName: '경기 양평군 1', phone: '', placeUrl: `http://place/${id}`,
  lat: 37.49, lng: 127.48,
})

function deps(over: any = {}) {
  const cafes: any[] = []
  return {
    store: {
      readCafes: async () => cafes,
      writeCafes: async (c: any[]) => { cafes.length = 0; cafes.push(...c) },
      readBlacklist: async () => [{ pattern: '스타벅스', matchType: 'contains' }],
      appendRaw: async () => 'p',
      readHealth: async () => [], writeHealth: async () => {},
      readBuzz: async () => [], writeBuzz: async () => {},
    },
    local: { searchKeyword: async () => ({ places: [place('1', '테라로사'), place('2', '스타벅스 양평점')], isEnd: true, payload: {} }) },
    blog: { search: async () => ({ docs: [{ title: '테라로사 카페 좋아요', contents: '', url: 'u', blogName: 'b', dateTime: new Date() }], totalCount: 1, payload: {} }) },
    llm: { name: 'f', modelVersion: 'v', extract: async () => ({ names: [] }) },
    now: new Date('2026-08-20T00:00:00Z'),
    ...over,
  }
}

describe('runDiscover', () => {
  it('블랙리스트 프랜차이즈를 excluded_auto 로 표시한다', async () => {
    const d = deps()
    await runDiscover(d as any, { regions: [{ sido: '경기', sigungu: '양평군' }] })
    const saved = await d.store.readCafes()
    const sb = saved.find((c: any) => c.name.includes('스타벅스'))
    expect(sb.status).toBe('excluded_auto')
    expect(sb.excludeReason).toBe('franchise')
  })

  it('kakaoPlaceId 로 중복을 제거한다', async () => {
    const d = deps()
    await runDiscover(d as any, { regions: [{ sido: '경기', sigungu: '양평군' }] })
    await runDiscover(d as any, { regions: [{ sido: '경기', sigungu: '양평군' }] })
    const saved = await d.store.readCafes()
    expect(saved.filter((c: any) => c.kakaoPlaceId === '1')).toHaveLength(1)
  })

  it('거리와 네이버지도 링크를 채운다', async () => {
    const d = deps()
    await runDiscover(d as any, { regions: [{ sido: '경기', sigungu: '양평군' }] })
    const c = (await d.store.readCafes())[0]
    expect(c.straightKm).toBeGreaterThan(0)
    expect(c.driveMinutesEst).toBeGreaterThan(0)
    expect(c.naverMapUrl).toContain('map.naver.com')
  })

  it('한 지역이 실패해도 나머지를 계속 처리한다', async () => {
    let n = 0
    const d = deps({
      local: { searchKeyword: async () => {
        if (++n === 1) throw new Error('일시 장애')
        return { places: [place('9', '더그림')], isEnd: true, payload: {} }
      } },
    })
    const r = await runDiscover(d as any, {
      regions: [{ sido: '경기', sigungu: '양평군' }, { sido: '경기', sigungu: '가평군' }],
    })
    expect(r.errors.length).toBeGreaterThan(0)
    expect((await d.store.readCafes()).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/jobs/weekly-discover.ts`:

```ts
import { SEARCH_KEYWORDS } from '../config/keywords.js'
import type { Region } from '../config/regions.js'
import { HOME, haversineKm, estimateDriveMinutes } from '../pipeline/geo.js'
import { evaluateExclusion } from '../pipeline/exclude.js'
import { isAmbiguousName } from '../pipeline/relevance.js'
import { harvestCurated } from '../pipeline/harvest.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { Cafe } from '../schema.js'
import type { KakaoPlace } from '../sources/kakao-local.js'

export interface DiscoverDeps {
  store: any
  local: { searchKeyword: (q: string, page: number) => Promise<{ places: KakaoPlace[]; isEnd: boolean; payload: unknown }> }
  blog: { search: (q: string, o?: object) => Promise<{ docs: any[]; payload: unknown }> }
  llm: any
  now?: Date
}

const naverMapUrl = (sigungu: string, name: string) =>
  `https://map.naver.com/p/search/${encodeURIComponent(`${sigungu} ${name}`)}`

function toCafe(p: KakaoPlace, region: Region, now: Date): Cafe {
  const straightKm = haversineKm(HOME, { lat: p.lat, lng: p.lng })
  return {
    kakaoPlaceId: p.id,
    name: p.placeName,
    sigungu: region.sigungu,
    roadAddress: p.roadAddressName || null,
    address: p.addressName || null,
    lat: p.lat,
    lng: p.lng,
    categoryName: p.categoryName || null,
    kakaoPlaceUrl: p.placeUrl || null,
    naverMapUrl: naverMapUrl(region.sigungu, p.placeName),
    phone: p.phone || null,
    straightKm: Number(straightKm.toFixed(2)),
    driveMinutesEst: estimateDriveMinutes(straightKm),
    firstSeenAt: now.toISOString(),
    status: 'pending_extraction',
    excludeReason: null,
    ambiguousName: isAmbiguousName(p.placeName),
    attributes: null,
    tags: [],
  }
}

export async function runDiscover(
  deps: DiscoverDeps,
  opts: { regions: Region[] },
) {
  const { store, local, blog, llm, now = new Date() } = deps
  const errors: string[] = []
  const existing: Cafe[] = await store.readCafes()
  const byId = new Map(existing.map((c) => [c.kakaoPlaceId, c]))
  const blacklist = await store.readBlacklist()
  let discovered = 0
  let excluded = 0

  const add = (p: KakaoPlace, region: Region) => {
    if (byId.has(p.id)) return
    const cafe = toCafe(p, region, now)
    const reason = evaluateExclusion(
      { name: p.placeName, categoryName: p.categoryName }, blacklist)
    if (reason) {
      cafe.status = 'excluded_auto'
      cafe.excludeReason = reason
      excluded++
    } else {
      discovered++
    }
    byId.set(p.id, cafe)
  }

  for (const region of opts.regions) {
    // 어떤 지역이 실패해도 나머지를 계속 처리한다 (스펙 6.6 원칙 1)
    try {
      // --- 그물 A: 키워드 검색 ---
      for (const kw of SEARCH_KEYWORDS) {
        const query = `${region.sido} ${region.sigungu} ${kw}`
        for (let page = 1; page <= 3; page++) {
          const res = await local.searchKeyword(query, page)
          await store.appendRaw('kakao-local', query, res.payload, now)
          res.places.forEach((p) => add(p, region))
          if (res.isEnd) break
        }
      }
      // --- 그물 C: 블로그 큐레이션 수확 ---
      const harvested = await harvestCurated({ blog, local, llm, store }, region)
      harvested.places.forEach((p) => add(p, region))

      await recordSuccess(store, 'kakao-local', now)
    } catch (e) {
      errors.push(`${region.sigungu}: ${(e as Error).message}`)
      await recordFailure(store, 'kakao-local', e, now)
    }
  }

  await store.writeCafes([...byId.values()])
  return { discovered, excluded, errors, total: byId.size }
}
```

- [ ] **Step 4: 테스트 통과 확인** — PASS

- [ ] **Step 5: 소규모 실전 1회 실행**

```bash
npx tsx -e "import('./src/jobs/weekly-discover.js')" # 실제 배선은 Task 17 의 CLI 로
```

양평군 1개 지역만으로 실행해 `data/cafes.json` 이 생기는지, 블랙리스트가
동작하는지 눈으로 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add src/jobs/weekly-discover.ts tests/jobs/
git commit -m "feat: 발굴 잡 — 그물 A·C 통합과 Layer 1 적용"
```

본문:
```
지역 하나가 실패해도 나머지를 계속 처리한다. health.json 에 기록하고
넘어간다 (스펙 6.6 원칙 1). 배치 전체가 한 지역 때문에 멈추지 않는다.

모든 의존을 주입받으므로 실제 API 없이 오프라인으로 전체 흐름이
테스트된다.

신규 카페는 pending_extraction 으로 저장한다. Layer 3(LLM 추출)은
비용이 있으므로 별도 단계에서 처리한다.
```

---

## Task 16: 일일 화제량 잡 + 주간 후보 잡

**Files:**
- Create: `src/jobs/daily-buzz.ts`, `src/jobs/weekly-suggest.ts`
- Test: `tests/jobs/daily-buzz.test.ts`, `tests/jobs/weekly-suggest.test.ts`

**Interfaces:**
- Produces:
  - `runDailyBuzz(deps, opts?): Promise<{ updated, failed, dropped }>`
  - `runWeeklySuggest(deps, opts?): Promise<{ picked: Suggestion[] }>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from 'vitest'
import { runDailyBuzz } from '../../src/jobs/daily-buzz.js'
import { runWeeklySuggest } from '../../src/jobs/weekly-suggest.js'

const NOW = new Date('2026-08-20T00:00:00Z')
const cafe = (id: string, name: string, over: any = {}) => ({
  kakaoPlaceId: id, name, sigungu: '양평군', lat: 37.49, lng: 127.48,
  firstSeenAt: '2026-01-01T00:00:00.000Z', status: 'active',
  ambiguousName: false, tags: ['대형카페'], driveMinutesEst: 60,
  attributes: { menuLevel: 3, parkingGrade: 'A', teenAppeal: 3, outdoorSeating: false,
    viewStrength: 3, viewTypes: [], mealTypes: [], scale: '대형', hasBakery: true,
    parkingEvidence: '', evidence: 'e', extractedAt: '', modelVersion: 'v' },
  ...over,
})

describe('runDailyBuzz', () => {
  it('카페마다 화제량을 갱신한다', async () => {
    const buzz: any[] = []
    const store = {
      readCafes: async () => [cafe('1', '테라로사')],
      readBuzz: async () => buzz,
      writeBuzz: async (r: any[]) => { buzz.length = 0; buzz.push(...r) },
      appendRaw: async () => 'p', readHealth: async () => [], writeHealth: async () => {},
    }
    const blog = { search: async () => ({
      docs: [{ title: '테라로사 카페', contents: '', url: 'u', blogName: 'b', dateTime: NOW }],
      totalCount: 1, payload: {} }) }
    const r = await runDailyBuzz({ store, blog, now: NOW } as any)
    expect(r.updated).toBe(1)
    expect(buzz[0].kakaoPlaceId).toBe('1')
  })

  it('한 카페가 실패해도 나머지를 계속한다', async () => {
    let n = 0
    const store = {
      readCafes: async () => [cafe('1', 'A'), cafe('2', 'B')],
      readBuzz: async () => [], writeBuzz: async () => {},
      appendRaw: async () => 'p', readHealth: async () => [], writeHealth: async () => {},
    }
    const blog = { search: async () => {
      if (++n === 1) throw new Error('장애')
      return { docs: [], totalCount: 0, payload: {} }
    } }
    const r = await runDailyBuzz({ store, blog, now: NOW } as any)
    expect(r.failed).toBe(1)
    expect(r.updated).toBe(1)
  })

  it('180일보다 오래된 스냅샷을 정리한다', async () => {
    const old = { kakaoPlaceId: '1', capturedAt: '2025-01-01', receivedCount: 0,
      relevantCount: 0, precision: 0, spanDays: 0, postsPer30: 0, posts30d: 0,
      postsPrev: 0, firstPostDate: null, latestPostDate: null, acceleration: 1 }
    let saved: any[] = []
    const store = {
      readCafes: async () => [cafe('1', 'A')],
      readBuzz: async () => [old],
      writeBuzz: async (r: any[]) => { saved = r },
      appendRaw: async () => 'p', readHealth: async () => [], writeHealth: async () => {},
    }
    const blog = { search: async () => ({ docs: [], totalCount: 0, payload: {} }) }
    const r = await runDailyBuzz({ store, blog, now: NOW } as any)
    expect(r.dropped).toBe(1)
    expect(saved.some((x) => x.capturedAt === '2025-01-01')).toBe(false)
  })
})

describe('runWeeklySuggest', () => {
  it('상위 3곳을 골라 저장한다', async () => {
    let saved: any[] = []
    const store = {
      readCafes: async () => ['1','2','3','4'].map((i) => cafe(i, `카페${i}`)),
      readBuzz: async () => ['1','2','3','4'].map((i) => ({
        kakaoPlaceId: i, capturedAt: '2026-08-19', receivedCount: 50,
        relevantCount: 48, precision: 0.96, spanDays: 17, postsPer30: 80 + Number(i),
        posts30d: 40, postsPrev: 20, firstPostDate: '2024-01-01',
        latestPostDate: '2026-08-19', acceleration: 1.5,
      })),
      readVisits: async () => [],
      readSuggestions: async () => [],
      writeSuggestions: async (r: any[]) => { saved = r },
    }
    const r = await runWeeklySuggest({ store, now: NOW } as any)
    expect(r.picked).toHaveLength(3)
    expect(saved).toHaveLength(3)
    expect(saved[0].rank).toBe(1)
  })

  it('숨긴 카페와 태그 0개는 후보에서 뺀다', async () => {
    const store = {
      readCafes: async () => [
        cafe('1', 'A', { status: 'hidden' }),
        cafe('2', 'B', { tags: [] }),
      ],
      readBuzz: async () => [], readVisits: async () => [],
      readSuggestions: async () => [], writeSuggestions: async () => {},
    }
    expect((await runWeeklySuggest({ store, now: NOW } as any)).picked).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/jobs/daily-buzz.ts`:

```ts
import { computeBuzz } from '../pipeline/buzz.js'
import { recordFailure, recordSuccess } from '../sources/health.js'
import type { BuzzSnapshot, Cafe } from '../schema.js'

const DAY = 86_400_000
const RETENTION_DAYS = 180   // 스펙 9절 롤링 윈도우

export async function runDailyBuzz(
  deps: { store: any; blog: any; now?: Date },
  opts: { limit?: number } = {},
) {
  const { store, blog, now = new Date() } = deps
  const cafes: Cafe[] = await store.readCafes()
  const targets = cafes
    .filter((c) => c.status === 'active' || c.status === 'pending_extraction')
    .slice(0, opts.limit ?? Infinity)

  const rows: BuzzSnapshot[] = await store.readBuzz()
  const capturedAt = now.toISOString().slice(0, 10)
  let updated = 0
  let failed = 0

  for (const c of targets) {
    try {
      // 검색어는 항상 "{시군구} {상호}" 조합 (Global Constraints)
      const query = `${c.sigungu} ${c.name}`
      const res = await blog.search(query, { size: 50, sort: 'recency' })
      await store.appendRaw('kakao-blog', query, res.payload, now)

      const m = computeBuzz({ docs: res.docs, cafeName: c.name, now })
      const i = rows.findIndex(
        (r) => r.kakaoPlaceId === c.kakaoPlaceId && r.capturedAt === capturedAt)
      const snap: BuzzSnapshot = { kakaoPlaceId: c.kakaoPlaceId, capturedAt, ...m }
      if (i >= 0) rows[i] = snap
      else rows.push(snap)
      updated++
    } catch (e) {
      // 한 카페가 실패해도 나머지를 계속한다
      failed++
      await recordFailure(store, 'kakao-blog', e, now)
    }
  }

  const cutoff = now.getTime() - RETENTION_DAYS * DAY
  const kept = rows.filter((r) => new Date(r.capturedAt).getTime() >= cutoff)
  const dropped = rows.length - kept.length

  await store.writeBuzz(kept)
  if (updated > 0) await recordSuccess(store, 'kakao-blog', now)
  return { updated, failed, dropped }
}
```

`src/jobs/weekly-suggest.ts`:

```ts
import { hotScore, familyFit, finalScore, pickWeekendCandidates } from '../pipeline/score.js'
import { passesGate } from '../pipeline/gate.js'
import type { BuzzSnapshot, Cafe, Suggestion, Visit } from '../schema.js'

function mondayOf(d: Date): string {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
  return x.toISOString().slice(0, 10)
}

export async function runWeeklySuggest(
  deps: { store: any; now?: Date },
  opts: { count?: number; cityMode?: boolean } = {},
) {
  const { store, now = new Date() } = deps
  const count = opts.count ?? 3
  const cafes: Cafe[] = await store.readCafes()
  const buzz: BuzzSnapshot[] = await store.readBuzz()
  const visits: Visit[] = await store.readVisits()

  // 카페별 최신 스냅샷 / 최근 방문일
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

  const scored = cafes.flatMap((c) => {
    if (c.status !== 'active') return []
    const a = c.attributes
    if (!a) return []
    if (!passesGate({ tags: c.tags, parkingGrade: a.parkingGrade }, opts).pass) return []
    const b = latestBuzz.get(c.kakaoPlaceId)
    if (!b) return []

    const hot = hotScore(b, now)
    const fit = familyFit({
      driveMinutes: c.driveMinutesEst ?? 90,
      parkingGrade: a.parkingGrade,
      menuLevel: a.menuLevel,
      lastVisitedOn: lastVisit.get(c.kakaoPlaceId) ?? null,
      outdoorOnly: Boolean(a.outdoorSeating) && a.menuLevel === 1,
      teenAppeal: a.teenAppeal ?? 2,
    }, now)

    return [{ id: c.kakaoPlaceId, score: finalScore(hot, fit), tags: c.tags, hot, fit }]
  })

  const picked = pickWeekendCandidates(scored, count)
  const weekOf = mondayOf(now)
  const rows: Suggestion[] = picked.map((p, i) => ({
    weekOf,
    kakaoPlaceId: p.id,
    rank: i + 1,
    finalScore: Number(p.score.toFixed(3)),
    reason: {
      hot: Number((p as any).hot.toFixed(1)),
      fit: Number((p as any).fit.toFixed(3)),
      tags: p.tags,
    },
  }))

  const prev: Suggestion[] = await store.readSuggestions()
  const kept = prev.filter((s) => s.weekOf !== weekOf).slice(-33)   // 최근 12주 x 3
  await store.writeSuggestions([...kept, ...rows])
  return { picked: rows }
}
```

- [ ] **Step 4: 테스트 통과 확인** — PASS

- [ ] **Step 5: 커밋**

```bash
git add src/jobs/daily-buzz.ts src/jobs/weekly-suggest.ts tests/jobs/
git commit -m "feat: 일일 화제량 잡과 주간 후보 잡"
```

본문:
```
카페 하나가 실패해도 나머지를 계속한다. health.json 에 기록만 남긴다.

buzz.json 은 180일 롤링으로 정리한다. 그 이전 데이터는 data/raw/ 와
git 히스토리로 소급 가능하다 (스펙 9절).

주간 후보는 게이트를 통과하고 화제량 스냅샷이 있는 카페만 대상으로
하며, 태그 다양성 제약을 적용해 3곳을 고른다.
```

---

## Task 17: CLI 도구 + GitHub Actions + 카카오톡 알림

**Files:**
- Create: `src/cli/visited.ts`, `src/cli/inspect.ts`, `src/cli/health.ts`, `src/cli/hide.ts`, `src/cli/run.ts`
- Create: `.github/workflows/daily-buzz.yml`, `.github/workflows/weekly-discover.yml`, `.github/workflows/weekly-suggest.yml`
- Test: `tests/cli/visited.test.ts`

**Interfaces:**
- Consumes: Task 15·16 잡, `Store`
- Produces: `npm run` 스크립트 6종

- [ ] **Step 1: 실패하는 테스트 작성 — 카페 이름 해석기**

CLI 는 사람이 `npm run visited 테라로사` 처럼 부분 이름을 친다. 해석 규칙이
가장 실수하기 쉬운 부분이므로 여기만 테스트한다.

```ts
import { describe, it, expect } from 'vitest'
import { resolveCafe } from '../../src/cli/visited.js'

const cafes = [
  { kakaoPlaceId: '1', name: '테라로사 서종점', sigungu: '양평군' },
  { kakaoPlaceId: '2', name: '테라로사 포천점', sigungu: '포천시' },
  { kakaoPlaceId: '3', name: '더티트렁크', sigungu: '파주시' },
] as any[]

describe('resolveCafe', () => {
  it('부분 이름으로 하나를 특정하면 그것을 준다', () => {
    expect(resolveCafe(cafes, '더티')).toMatchObject({ kind: 'one', cafe: cafes[2] })
  })

  it('여러 개가 걸리면 후보를 돌려준다 — 임의로 고르지 않는다', () => {
    const r = resolveCafe(cafes, '테라로사')
    expect(r.kind).toBe('many')
    expect((r as any).candidates).toHaveLength(2)
  })

  it('지역명을 붙이면 좁혀진다', () => {
    expect(resolveCafe(cafes, '양평 테라로사')).toMatchObject({ kind: 'one' })
  })

  it('못 찾으면 none 이다', () => {
    expect(resolveCafe(cafes, '없는곳').kind).toBe('none')
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

`src/cli/visited.ts`:

```ts
import { createJsonStore } from '../store/json-store.js'
import { loadEnv } from '../config/env.js'
import type { Cafe } from '../schema.js'

export type Resolved =
  | { kind: 'one'; cafe: Cafe }
  | { kind: 'many'; candidates: Cafe[] }
  | { kind: 'none' }

const squeeze = (s: string) => s.replace(/\s+/g, '')

/** 부분 이름 + 선택적 지역명으로 카페를 특정한다. 애매하면 고르지 않는다. */
export function resolveCafe(cafes: Cafe[], query: string): Resolved {
  const q = squeeze(query)
  const hits = cafes.filter((c) => squeeze(`${c.sigungu}${c.name}`).includes(q)
    || squeeze(c.name).includes(q))
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length === 1) return { kind: 'one', cafe: hits[0]! }
  return { kind: 'many', candidates: hits }
}

export async function main(argv: string[]) {
  const env = loadEnv()
  const store = createJsonStore(env.DATA_DIR)
  const query = argv.join(' ').trim()
  if (!query) {
    console.error('사용법: npm run visited <카페 이름> [-- --date YYYY-MM-DD]')
    process.exitCode = 1
    return
  }
  const dateFlag = argv.indexOf('--date')
  const visitedOn = dateFlag >= 0
    ? argv[dateFlag + 1]!
    : new Date().toISOString().slice(0, 10)

  const cafes = await store.readCafes()
  const r = resolveCafe(cafes, query.replace(/--date\s+\S+/, '').trim())

  if (r.kind === 'none') { console.error(`"${query}" 을(를) 찾지 못했습니다.`); process.exitCode = 1; return }
  if (r.kind === 'many') {
    console.error(`여러 곳이 걸립니다. 지역명을 붙여 주세요:`)
    r.candidates.forEach((c) => console.error(`  - ${c.sigungu} ${c.name}`))
    process.exitCode = 1
    return
  }

  const visits = await store.readVisits()
  if (visits.some((v) => v.kakaoPlaceId === r.cafe.kakaoPlaceId && v.visitedOn === visitedOn)) {
    console.log(`이미 기록되어 있습니다: ${r.cafe.name} (${visitedOn})`)
    return
  }
  visits.push({ kakaoPlaceId: r.cafe.kakaoPlaceId, visitedOn })
  await store.writeVisits(visits)
  console.log(`기록했습니다: ${r.cafe.sigungu} ${r.cafe.name} — ${visitedOn}`)
  console.log('추천에서 6개월간 내려갑니다.')
}
```

`src/cli/inspect.ts` — 판정 근거를 전부 보여준다. 골든셋 라벨링과
오탐 진단의 핵심 도구다.

```ts
import { createJsonStore } from '../store/json-store.js'
import { loadEnv } from '../config/env.js'
import { resolveCafe } from './visited.js'

export async function main(argv: string[]) {
  const env = loadEnv()
  const store = createJsonStore(env.DATA_DIR)
  const cafes = await store.readCafes()
  const r = resolveCafe(cafes, argv.join(' '))
  if (r.kind !== 'one') { console.error('카페를 특정하지 못했습니다.'); process.exitCode = 1; return }

  const c = r.cafe
  const buzz = (await store.readBuzz())
    .filter((b) => b.kakaoPlaceId === c.kakaoPlaceId)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]

  console.log(`\n  ${c.sigungu} ${c.name}`)
  console.log(`  상태 ${c.status}${c.excludeReason ? ` (${c.excludeReason})` : ''}`)
  console.log(`  거리 ${c.straightKm}km / 약 ${c.driveMinutesEst}분`)
  console.log(`  태그 ${c.tags.join(' · ') || '(없음 — 동네 카페)'}`)
  if (c.ambiguousName) console.log(`  ⚠ 일반명사 상호 — 오염 가능성`)
  if (buzz) {
    console.log(`\n  화제량 (${buzz.capturedAt})`)
    console.log(`    정밀도 ${(buzz.precision * 100).toFixed(0)}%  (${buzz.relevantCount}/${buzz.receivedCount})`)
    console.log(`    월 발행률 ${buzz.postsPer30}건  기간 ${buzz.spanDays}일`)
    console.log(`    가속도 ${buzz.acceleration}  최근30일 ${buzz.posts30d} / 이전 ${buzz.postsPrev}`)
  }
  const a = c.attributes
  if (a) {
    console.log(`\n  속성 (${a.modelVersion})`)
    console.log(`    규모 ${a.scale} ~${a.seatsEstimate}석 ${a.floors}층  메뉴 Lv${a.menuLevel}  주차 ${a.parkingGrade}`)
    console.log(`    뷰 ${a.viewStrength}점 ${a.viewTypes?.join(',')}  10대 ${a.teenAppeal}점`)
    console.log(`\n    근거: ${a.evidence}`)
    if (a.parkingEvidence) console.log(`    주차 근거: ${a.parkingEvidence}`)
  }
  console.log(`\n  네이버 ${c.naverMapUrl}`)
  console.log(`  카카오 ${c.kakaoPlaceUrl}\n`)
}
```

`src/cli/health.ts` / `src/cli/hide.ts` — 같은 패턴으로 얇게 작성한다.
`health` 는 `data/health.json` 을 표로 출력하고, `hide` 는 `status` 를
`hidden` 으로 바꾸며 `moderation_actions` 대신 `data/health.json` 옆에
간단한 로그를 남긴다.

`package.json` 스크립트 추가:

```bash
npm pkg set scripts.visited="tsx src/cli/visited.ts"
npm pkg set scripts.inspect="tsx src/cli/inspect.ts"
npm pkg set scripts.health="tsx src/cli/health.ts"
npm pkg set scripts.hide="tsx src/cli/hide.ts"
npm pkg set scripts.discover="tsx src/cli/run.ts discover"
npm pkg set scripts.buzz="tsx src/cli/run.ts buzz"
npm pkg set scripts.suggest="tsx src/cli/run.ts suggest"
```

- [ ] **Step 4: GitHub Actions 워크플로 작성**

`.github/workflows/daily-buzz.yml`:

```yaml
name: daily-buzz
on:
  schedule:
    - cron: '0 19 * * *'      # 19:00 UTC = 04:00 KST
  workflow_dispatch:

permissions:
  contents: write

jobs:
  buzz:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run buzz
        env:
          KAKAO_REST_API_KEY: ${{ secrets.KAKAO_REST_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - name: 데이터 커밋
        run: |
          git config user.name  "cafe-bot"
          git config user.email "cafe-bot@users.noreply.github.com"
          git add data/
          git diff --staged --quiet || git commit -m "data: 화제량 갱신 $(date -u +%Y-%m-%d)"
          git push
```

`weekly-discover.yml` 은 `cron: '30 19 * * 0'` (월 04:30 KST),
`weekly-suggest.yml` 은 `cron: '30 2 * * 5'` (금 11:30 KST) 로 같은 형태.

GitHub 저장소 Settings > Secrets 에 `KAKAO_REST_API_KEY` 와
`GEMINI_API_KEY` 를 등록한다.

- [ ] **Step 5: 카카오톡 알림 Phase 1 설정 (코드 0줄)**

스펙 10.2절 Phase 1. claude.ai Routine 을 매주 금요일 12:00 KST 로 만들고
다음을 시킨다:

```
data/suggestions.json 에서 이번 주(weekOf) 후보 3곳을 읽고,
카카오톡 나에게 보내기로 200자 이내 메시지를 보내라. 형식:

[이번 주 추천 카페]

1. {상호} ({시군구} {분}분)
2. ...
3. ...

자세히 -> {웹 URL}
```

커넥터 인증이 클라우드 실행에서 붙는지 **첫 금요일에 확인**한다. 안 되면
로컬 예약으로 폴백한다 (노트북이 켜져 있어야 함).

- [ ] **Step 6: 전체 테스트 + 타입체크**

```bash
npm run typecheck && npm test
```

- [ ] **Step 7: 커밋**

```bash
git add src/cli/ .github/workflows/ package.json tests/cli/
git commit -m "feat: CLI 도구와 GitHub Actions 배치"
```

본문:
```
운영 도구를 전부 CLI 로 둔다. 아빠만 쓰는 도구에 웹 화면·라우팅·인증을
붙일 이유가 없다 (스펙 10절).

resolveCafe 는 여러 곳이 걸리면 임의로 고르지 않고 후보를 보여준다.
"테라로사"만 쳤을 때 서종점과 포천점 중 아무거나 고르면 방문 기록이
틀린 곳에 남는다.

inspect 는 판정 근거를 전부 출력한다. 골든셋 라벨링과 오탐 진단의
핵심 도구다.

배치는 data/ 를 커밋하고 push 한다. Vercel 이 이를 감지해 자동
재배포한다 — 별도 배포 트리거가 필요 없다.
```

---


## Task 18: 판정 잡 — Layer 2~5 를 실제로 꿰는 단계

> **자체 검토에서 발견한 누락.** Task 8·10·12·13 이 각 Layer 를 순수 함수로
> 만들었지만 **그것들을 순서대로 호출해 카페 상태를 확정하는 잡이 없었다.**
> Task 15(발굴)는 카페를 `pending_extraction` 으로 넣기만 하고, Task 16(화제량)은
> 숫자만 갱신한다. 이 태스크가 빠진 연결 고리다.
>
> 함께 메우는 두 번째 누락: **주차 전용 스니펫을 수집하는 곳이 없었다.**
> `buildExtractPrompt` 가 `parkingSnippets` 를 받도록 설계됐지만 아무도 채우지
> 않았다. 스펙 7.3 의 "주차 검색 1회 추가" 가 여기서 실행된다.

**Files:**
- Create: `src/jobs/classify.ts`
- Test: `tests/jobs/classify.test.ts`

**Interfaces:**
- Consumes: `passesLayer2` (Task 8), `extractAttributes` (Task 10), `assignTags` (Task 12), `passesGate` (Task 13), `createKakaoBlog` (Task 6), `LlmClient` (Task 9), `Store` (Task 2)
- Produces: `runClassify(deps, opts?): Promise<{ classified, excluded, skipped, failed }>`

**흐름:**

```
status === 'pending_extraction' 인 카페마다
  1) 최신 buzz 스냅샷 조회
       없음            -> skipped (daily-buzz 가 먼저 돌아야 한다)
  2) passesLayer2
       실패            -> status='excluded_auto', reason 기록  [LLM 호출 없음]
  3) 주차 전용 검색  "{시군구} {상호} 주차"      <- 여기서 채운다
  4) extractAttributes (Gemini)
  5) assignTags
  6) passesGate
       실패            -> status='excluded_auto'
       통과            -> status='active'
```

**비용 설계:** Layer 2 를 **LLM 호출 전에** 둔다. 화제량 컷에서 탈락할 카페에
Gemini 를 쓰지 않는다. 통과율 약 20% 이므로 LLM 호출이 1/5로 줄어든다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/jobs/classify.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runClassify } from '../../src/jobs/classify.js'

const NOW = new Date('2026-08-20T00:00:00Z')

const cafe = (id: string, over: any = {}) => ({
  kakaoPlaceId: id, name: `카페${id}`, sigungu: '양평군',
  lat: 37.49, lng: 127.48, firstSeenAt: '2026-08-01T00:00:00.000Z',
  status: 'pending_extraction', ambiguousName: false,
  attributes: null, tags: [], driveMinutesEst: 60, ...over,
})

const buzz = (id: string, over: any = {}) => ({
  kakaoPlaceId: id, capturedAt: '2026-08-19',
  receivedCount: 50, relevantCount: 48, precision: 0.96,
  spanDays: 17, postsPer30: 86, posts30d: 40, postsPrev: 20,
  firstPostDate: '2024-01-01', latestPostDate: '2026-08-19',
  acceleration: 1.5, ...over,
})

const goodAttrs = {
  scale: '대형', seatsEstimate: 200, floors: 2, hasBakery: true,
  breadBakedOnsite: true, menuLevel: 3, mealTypes: [], viewStrength: 3,
  viewTypes: ['강'], outdoorSeating: false, parkingGrade: 'A',
  parkingEvidence: '주차장 넓음', photoSpot: 4, teenAppeal: 3,
  confidence: 0.9, evidence: '2층 200석',
}

function mk(cafes: any[], buzzRows: any[], over: any = {}) {
  let saved: any[] = cafes
  return {
    saved: () => saved,
    deps: {
      store: {
        readCafes: async () => saved,
        writeCafes: async (c: any[]) => { saved = c },
        readBuzz: async () => buzzRows,
        appendRaw: async () => 'p',
        readHealth: async () => [], writeHealth: async () => {},
      },
      blog: { search: async () => ({ docs: [], totalCount: 0, payload: {} }) },
      llm: { name: 'f', modelVersion: 'gemini-3.1-flash-lite', extract: async () => goodAttrs },
      now: NOW,
      ...over,
    } as any,
  }
}

describe('runClassify', () => {
  it('통과한 카페를 active 로 바꾸고 태그를 붙인다', async () => {
    const h = mk([cafe('1')], [buzz('1')])
    const r = await runClassify(h.deps)
    expect(r.classified).toBe(1)
    const c = h.saved()[0]
    expect(c.status).toBe('active')
    expect(c.tags).toContain('대형카페')
    expect(c.tags).toContain('대형베이커리')
    expect(c.attributes.modelVersion).toBe('gemini-3.1-flash-lite')
  })

  it('Layer 2 탈락은 LLM 을 호출하지 않는다', async () => {
    let called = 0
    const h = mk([cafe('1')], [buzz('1', { precision: 0.1, postsPer30: 2 })], {
      llm: { name: 'f', modelVersion: 'v', extract: async () => { called++; return goodAttrs } },
    })
    const r = await runClassify(h.deps)
    expect(called).toBe(0)             // 비용 설계의 핵심
    expect(r.excluded).toBe(1)
    expect(h.saved()[0].status).toBe('excluded_auto')
    expect(h.saved()[0].excludeReason).toMatch(/정밀도|월/)
  })

  it('화제량 스냅샷이 없으면 건너뛴다 (탈락시키지 않는다)', async () => {
    const h = mk([cafe('1')], [])
    const r = await runClassify(h.deps)
    expect(r.skipped).toBe(1)
    expect(h.saved()[0].status).toBe('pending_extraction')   // 다음 회차에 다시 시도
  })

  it('주차 전용 검색을 별도로 던진다', async () => {
    const queries: string[] = []
    const h = mk([cafe('1')], [buzz('1')], {
      blog: { search: async (q: string) => { queries.push(q); return { docs: [], totalCount: 0, payload: {} } } },
    })
    await runClassify(h.deps)
    expect(queries.some((q) => q.includes('주차'))).toBe(true)
  })

  it('게이트 탈락은 excluded_auto 로 남긴다', async () => {
    const h = mk([cafe('1')], [buzz('1')], {
      llm: { name: 'f', modelVersion: 'v',
             extract: async () => ({ ...goodAttrs, parkingGrade: 'D' }) },
    })
    const r = await runClassify(h.deps)
    expect(r.excluded).toBe(1)
    expect(h.saved()[0].excludeReason).toMatch(/주차/)
  })

  it('한 카페가 실패해도 나머지를 계속한다', async () => {
    let n = 0
    const h = mk([cafe('1'), cafe('2')], [buzz('1'), buzz('2')], {
      llm: { name: 'f', modelVersion: 'v', extract: async () => {
        if (++n === 1) throw new Error('LLM 장애')
        return goodAttrs
      } },
    })
    const r = await runClassify(h.deps)
    expect(r.failed).toBe(1)
    expect(r.classified).toBe(1)
  })

  it('limit 으로 처리량을 제한한다 (무료 티어 일일 한도 대응)', async () => {
    const h = mk([cafe('1'), cafe('2'), cafe('3')], [buzz('1'), buzz('2'), buzz('3')])
    const r = await runClassify(h.deps, { limit: 2 })
    expect(r.classified).toBe(2)
    expect(h.saved().filter((c: any) => c.status === 'pending_extraction')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/jobs/classify.test.ts` — FAIL

- [ ] **Step 3: 구현**

`src/jobs/classify.ts`:

```ts
import { passesLayer2 } from '../pipeline/buzz.js'
import { extractAttributes } from '../pipeline/extract.js'
import { assignTags } from '../pipeline/tag.js'
import { passesGate } from '../pipeline/gate.js'
import { recordFailure } from '../sources/health.js'
import type { BuzzSnapshot, Cafe } from '../schema.js'
import type { LlmClient } from '../llm/types.js'

export interface ClassifyDeps {
  store: any
  blog: { search: (q: string, o?: object) => Promise<{ docs: { title: string; contents: string }[]; payload: unknown }> }
  llm: LlmClient
  now?: Date
}

/**
 * Layer 2~5 를 순서대로 적용해 카페 상태를 확정한다.
 *
 * Layer 2(화제량 컷)를 LLM 호출 **앞에** 둔다. 탈락할 카페에 Gemini 를
 * 쓰지 않는다. 통과율이 약 20% 이므로 LLM 호출이 1/5로 줄어든다.
 */
export async function runClassify(
  deps: ClassifyDeps,
  opts: { limit?: number } = {},
) {
  const { store, blog, llm, now = new Date() } = deps
  const cafes: Cafe[] = await store.readCafes()
  const buzz: BuzzSnapshot[] = await store.readBuzz()

  const latest = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latest.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latest.set(b.kakaoPlaceId, b)
  }

  const targets = cafes
    .filter((c) => c.status === 'pending_extraction')
    .slice(0, opts.limit ?? Infinity)

  let classified = 0, excluded = 0, skipped = 0, failed = 0

  for (const c of targets) {
    try {
      const b = latest.get(c.kakaoPlaceId)
      if (!b) {
        // daily-buzz 가 아직 안 돌았다. 탈락시키지 않고 다음 회차로 미룬다.
        skipped++
        continue
      }

      // --- Layer 2 (LLM 앞에 둔다) ---
      const l2 = passesLayer2(b, { now })
      if (!l2.pass) {
        c.status = 'excluded_auto'
        c.excludeReason = l2.reason ?? 'Layer 2 탈락'
        excluded++
        continue
      }

      // --- 주차 전용 스니펫 (스펙 7.3) ---
      // 한국 블로거는 주차를 거의 항상 쓴다. 전용 검색 1회가 등급
      // 정확도를 크게 올린다.
      const parkingQuery = `${c.sigungu} ${c.name} 주차`
      const parkingRes = await blog.search(parkingQuery, { size: 10, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-parking', parkingQuery, parkingRes.payload, now)

      const mainQuery = `${c.sigungu} ${c.name}`
      const mainRes = await blog.search(mainQuery, { size: 15, sort: 'accuracy' })
      await store.appendRaw('kakao-blog-extract', mainQuery, mainRes.payload, now)

      // --- Layer 3 ---
      const attributes = await extractAttributes({ llm, now }, {
        name: c.name,
        sigungu: c.sigungu,
        categoryName: c.categoryName ?? '',
        snippets: mainRes.docs.map((d) => `${d.title} ${d.contents}`),
        parkingSnippets: parkingRes.docs.map((d) => `${d.title} ${d.contents}`),
      })
      c.attributes = attributes

      // --- Layer 4 ---
      c.tags = assignTags(attributes)

      // --- Layer 5 ---
      const gate = passesGate(
        { tags: c.tags, parkingGrade: attributes.parkingGrade })
      if (!gate.pass) {
        c.status = 'excluded_auto'
        c.excludeReason = gate.reason ?? 'Layer 5 탈락'
        excluded++
      } else {
        c.status = 'active'
        c.excludeReason = null
        classified++
      }
    } catch (e) {
      // 한 카페가 실패해도 나머지를 계속한다. pending_extraction 으로
      // 남으므로 다음 회차에 자동 재시도된다.
      failed++
      await recordFailure(store, 'classify', e, now)
    }
  }

  await store.writeCafes(cafes)
  return { classified, excluded, skipped, failed }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/jobs/classify.test.ts` — PASS (7 tests)

- [ ] **Step 5: CLI 와 워크플로에 배선**

```bash
npm pkg set scripts.classify="tsx src/cli/run.ts classify"
```

`.github/workflows/daily-classify.yml` — 무료 티어 일일 한도를 고려해
**하루 200건씩** 처리한다. 초기 백필 약 1,200건은 6일에 나뉘어 끝난다
(스펙 11절: "초기 백필은 며칠에 걸쳐 나누어 돌리는 것을 전제").

```yaml
name: daily-classify
on:
  schedule:
    - cron: '0 20 * * *'      # 20:00 UTC = 05:00 KST (buzz 뒤)
  workflow_dispatch:

permissions:
  contents: write

jobs:
  classify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run classify -- --limit 200
        env:
          KAKAO_REST_API_KEY: ${{ secrets.KAKAO_REST_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - name: 데이터 커밋
        run: |
          git config user.name  "cafe-bot"
          git config user.email "cafe-bot@users.noreply.github.com"
          git add data/
          git diff --staged --quiet || git commit -m "data: 판정 갱신 $(date -u +%Y-%m-%d)"
          git push
```

- [ ] **Step 6: 커밋**

```bash
git add src/jobs/classify.ts tests/jobs/classify.test.ts .github/workflows/daily-classify.yml package.json
git commit -m "feat: 판정 잡 — Layer 2~5 를 실제로 꿰는 단계"
```

본문:
```
자체 검토에서 발견한 누락을 메운다. 각 Layer 를 순수 함수로 만들었지만
그것들을 순서대로 호출해 카페 상태를 확정하는 잡이 없었다.

Layer 2(화제량 컷)를 LLM 호출 앞에 둔다. 탈락할 카페에 Gemini 를 쓰지
않는다. 통과율이 약 20% 이므로 LLM 호출이 1/5로 줄어든다.

주차 전용 스니펫도 여기서 수집한다. buildExtractPrompt 가 받도록
설계됐지만 아무도 채우지 않고 있었다. 한국 블로거는 주차를 거의 항상
쓰므로 전용 검색 1회가 등급 정확도를 크게 올린다 (스펙 7.3).

화제량 스냅샷이 없으면 탈락이 아니라 skip 이다. daily-buzz 가 아직
안 돌았을 뿐이므로 다음 회차에 다시 시도한다.

무료 티어 일일 한도를 고려해 limit 을 받는다. 초기 백필 약 1,200건은
하루 200건씩 6일에 나뉘어 끝난다.
```

---

## 구현하지 않는 것 (의도적 보류)

**그물 B — 카카오 카테고리 반경 검색.** 스펙 6.4 에 있지만 이 계획에서
구현하지 않는다.

- 카카오 카테고리 검색은 좌표 + 반경 기반이라 시군구 단위 스캔과 축이 다르다
- 요청당 45건 상한이 있어 카페 밀도가 높은 서울 도심에서는 전수 수집이
  애초에 불가능하다
- 그물 A(키워드 6종 x 3페이지)와 그물 C(블로그 큐레이션)로 recall 이
  충분한지 **골든셋(계획 2)의 "오탈락률"로 측정**한 뒤 판단한다

**침묵으로 빠뜨리는 것이 아니라 측정 후 결정으로 미루는 것이다.** 계획 2에서
오탈락률이 높게 나오면 그때 그물 B 를 추가한다.


## 완료 기준

계획 1이 끝나면 다음이 성립해야 한다.

1. `npm test` 전체 통과, `npm run typecheck` 오류 0
2. `npm run discover` 로 수도권 65개 시군구가 수집되고 `data/cafes.json` 생성
3. `npm run buzz` 로 화제량이 채워지고 `data/buzz.json` 생성
4. `npm run classify` 로 Layer 2~5 가 적용되어 `status` 와 `tags` 가 확정됨
5. `npm run suggest` 로 주말 후보 3곳이 나오고 **태그가 2종 이상 다름**
6. `npm run inspect <카페>` 로 판정 근거(evidence 포함)가 전부 보임
7. GitHub Actions 4개(buzz·classify·discover·suggest)가 수동 실행(`workflow_dispatch`)으로 성공
8. 어떤 소스가 죽어도 배치가 완주하고 `npm run health` 에 실패가 기록됨

**여기까지가 계획 1이다.** 이 시점에 웹앱은 아직 없지만 데이터는 완성되어
있고 CLI 로 확인할 수 있다. 다음은 **계획 2 — 골든셋 라벨링과 품질 튜닝**
이며, 필터 품질을 검증한 뒤에야 **계획 3 — 웹앱**으로 넘어간다.
나쁜 데이터 위에 UI 를 쌓는 낭비를 피하기 위한 순서다.
