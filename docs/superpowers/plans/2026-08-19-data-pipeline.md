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

## Task 0: API 키 발급 (사람이 직접 — 위임 불가)

이 태스크는 **사용자만 수행 가능**하다. 코드가 없다. Task 4부터 실제 키가 필요하므로 그 전에 끝나 있어야 한다.

- [ ] **Step 1: 카카오 REST API 키 발급**

1. https://developers.kakao.com 로그인
2. 내 애플리케이션 -> 애플리케이션 추가하기 -> 앱 이름 `cafe-recommender`
3. 앱 키 화면에서 **REST API 키** 복사
4. 카카오맵 -> 활성화 설정 ON (로컬 API 사용에 필요)

- [ ] **Step 2: 네이버 검색 API 키 발급**

1. https://developers.naver.com/apps/#/register 접속
2. 애플리케이션 이름 `cafe-recommender`
3. 사용 API에서 **검색** 선택
4. 환경 추가 -> **WEB 설정** -> 서비스 URL `http://localhost:3000`
5. 발급된 **Client ID / Client Secret** 복사

- [ ] **Step 3: Supabase 프로젝트 생성**

1. https://supabase.com 로그인 -> New project
2. 이름 `cafe-recommender`, 리전 **Northeast Asia (Seoul)**
3. Project Settings -> API 에서 **Project URL** 과 **service_role key** 복사
   (service_role 키는 RLS를 우회한다. 서버 배치에서만 쓰고 브라우저에 노출하지 않는다)

- [ ] **Step 4: Anthropic API 키 발급**

1. https://console.anthropic.com -> API Keys -> Create Key
2. 결제 수단 등록 필요. 사용량은 월 수천 원 수준

- [ ] **Step 5: `.env` 파일 작성**

Task 1에서 생성되는 `.env.example` 을 복사해 `.env` 로 만들고 위 값들을 채운다.
`.env` 는 `.gitignore` 에 이미 차단되어 있다.
