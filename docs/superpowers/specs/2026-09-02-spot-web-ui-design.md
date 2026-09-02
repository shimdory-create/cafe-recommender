# 가볼 곳 추천 웹 화면 (2단계) — 설계 문서

- 작성일: 2026-09-02
- 상태: 승인됨 (구현 계획 작성 대기)
- 전제: [2026-09-02-spot-pipeline-design.md](2026-09-02-spot-pipeline-design.md)(1단계, 이미 master 병합)의
  데이터가 존재한다. `data/spots.json`에 실제 판정 데이터가 있고 GitHub
  Actions가 계속 채우는 중이다.

---

## 1. 무엇을 만드는가

카페·식당에 이어 세 번째 도메인 "가볼 곳"의 웹 화면을 만든다. 1단계는
데이터 파이프라인만 있었고 화면에는 아무것도 안 보였다 — 이 문서가 그
화면을 만든다.

**최우선 제약은 이전 두 단계와 동일: 지금 배포된 카페·식당 화면은 한 글자도
동작이 바뀌지 않는다.** 새 파일, 새 라우트, 새 API만 추가한다.

식당 2단계([2026-09-01-restaurant-web-ui-design.md](2026-09-01-restaurant-web-ui-design.md))를
구조적 템플릿으로 삼는다 — 같은 패턴이 두 번 증명됐으므로 세 번째는 설계
결정을 거의 다시 할 필요가 없다. 이 문서는 식당과 **다른 점**과, 식당
때의 시행착오를 이번엔 처음부터 피하는 지점을 중심으로 적는다.

## 2. 식당 2단계와 다른 점

| 항목 | 식당 | 가볼 곳 |
|---|---|---|
| 전환 스위치 | 2-way(☕카페/🍚식당) | **3-way**(☕카페/🍚식당/🏞️가볼곳) |
| 필터 칩 방식 | 음식종류 **단일 선택**(식당 2단계에서 발견된 버그를 고쳐 라디오 방식으로 구현됨) | **다중 선택**(카페와 동일한 AND 조합 — `filter.ts` 무변경 재사용) |
| 카드/상세에 새로 뜨는 정보 | 룸·예약 여부 | **체류시간·실내외·계절** — 표시만, 필터·정렬에는 안 씀 |
| 페이로드 비대 버그 | 2단계 진행 중 발견되어 사후 수정(`labels.ts`/`badge.tsx` 추출) | **처음부터** 그 두 파일에서 직접 import — 재발 자체가 불가능 |
| 도메인 스위치 컴포넌트 구조 | 하드코딩 2-way 튜플 배열을 그대로 확장 | 같은 배열에 항목 하나 더(3-way) — 제네릭화 불필요 |

## 3. 통합 방식 — 전환 스위치

`web/src/lib/domain-switch.ts`의 `Domain` 타입을 `'cafe' | 'restaurant' | 'spot'`로
확장하고, `switchDomainPath`의 분기 로직(현재 `restaurant` 접두사 유무로만
판별하는 2-way if문)을 3개 접두사를 보는 형태로 바꾼다. `web/src/app/domain-switch.tsx`의
`OPTIONS` 배열에 `['spot', '🏞️ 가볼곳']`을 추가한다.

지금 구조(하드코딩된 `[Domain, string][]` 튜플 배열, `domainOf`의 문자열
접두사 매칭)가 이미 충분히 단순해서 제네릭 리스트 구조로 리팩터할 필요가
없다 — 항목만 늘리면 된다. 헤더 높이 56px / 버튼 최소높이 36px 제약은
그대로 유지한다. "가볼곳"이 "식당"보다 한 글자 길지만 세 개를 나란히
둬도 줄바꿈 없이 들어가는 폭이다(실제 구현 시 브라우저로 눈으로 확인).

## 4. 데이터 계층

식당 2단계의 구조를 그대로 미러링한다:

- `src/site/spot-payload.ts` — `Spot`(1단계 스키마) → `SiteSpot`/`SiteSpotVisited`/`SpotSitePayload`
  로 조립. `src/site/restaurant-payload.ts`가 직접 템플릿.
- `web/src/lib/spot-site-types.ts` — zod 의존성 없는 순수 인터페이스 파일.
  `SiteSpot`은 `restaurant-site-types.ts`의 `SiteRestaurant`과 같은 필드
  구조에서 `cuisineType`(단일값) 대신 `tags: string[]`(다중값, 이미
  1단계 `Spot.tags`가 이 형태), `hasRoom`/`reservable` 대신
  `stayDuration: string | null`/`indoorOutdoor: 'indoor'|'outdoor'|'mixed'|null`/
  `season: string | null`을 넣는다. `teenAppeal`/`parkingGrade`/`evidence`/
  `parkingEvidence`/`hotScore`/`finalScore`/`postsPer30`/`trend`/`ratingAvg`/
  `familyReviews`/`cityOnly`/`visitedOn`/`isNew` 등 나머지는 식당과 동일한
  구조를 그대로 따른다.
- `web/src/lib/spot-site.ts` — fetch/파싱 헬퍼. `restaurant-site.ts`가 템플릿.
- `web/src/lib/reviews.ts`에 `SPOT_REVIEWS_PATH`/`SPOT_VISITS_PATH`/
  `SPOT_WISHLIST_PATH`/`SPOT_DISMISSED_PATH` 상수를 가산적으로 추가.
  `data/spot-reviews.json`/`spot-visits.json`/`spot-wishlist.json`/
  `spot-dismissed.json` 새 파일 — 기존 카페·식당 파일은 안 건드린다.
- API 라우트 4종: `web/src/app/api/spot/{reviews,visited,wishlist,dismissed}/route.ts`.
  식당의 대응 라우트가 직접 템플릿.
- `src/cli/run.ts`의 `case 'site':`에 스팟 페이로드 생성 블록을 추가한다.
  **식당 블록이 이미 try/catch로 감싸져 있는 것과 같은 이유로, 스팟
  블록도 독립된 try/catch로 감싼다** — 스팟 데이터 문제가 카페·식당 빌드를
  막으면 안 된다(1단계 문서에 기록된, 식당 2단계에서 실제로 겪은 실패
  모드를 재발시키지 않는다).

## 5. 라우팅·UI 구성

표준 5-route를 그대로 미러: `/spot`(홈, 이번 주 추천), `/spot/list`(전체
목록 + 필터), `/spot/[id]`(상세), `/spot/visited`(다녀온 곳), `/spot/info`(안내).

**필터 칩은 다중 선택이다.** 식당 2단계에서 음식종류를 단일 선택(라디오
방식)으로 고쳤던 것과 달리, 가볼 곳의 10개 성격 태그는 카페의 성격 태그와
똑같이 여러 개를 동시에 켤 수 있어야 한다(설계 문서 1단계 2절 — "자연/공원"
이면서 동시에 "아이와 가기 좋은 곳"일 수 있음). `web/src/lib/filter.ts`는
이미 이 방식(다중 선택 AND 조합)으로 동작하므로 **완전히 무변경 재사용**한다
— 식당 때처럼 별도 단일선택 UI를 새로 만들 필요가 없다.

**카드/상세 컴포넌트는 이미 추출된 leaf 모듈에서 직접 import한다** —
`web/src/lib/labels.ts`의 `driveLabel`/`addedLabel`, `web/src/app/badge.tsx`의
`Badge`. 식당은 2단계 진행 중에 이 두 파일이 카페의 무거운 `site.json`을
모듈 스코프에서 즉시 평가하는 것 때문에 `/restaurant` 페이로드가 약
2.37MB 부풀었던 버그를 겪고 나서야 이 leaf 모듈들을 뒤늦게 추출했다.
가볼 곳은 그 leaf 모듈이 이미 존재하므로 **처음부터** 거기서 직접
import — 같은 버그가 재발할 수 없는 구조다.

**새 속성(체류시간·실내외·계절) 노출**: 목록 카드에는 짧은 배지로(예:
"🕐 1~2시간 · 🏞️ 실외"), 상세 페이지에는 전체 정보로 표시한다. 셋 다
**표시 전용** — 필터링·정렬·랭킹 로직에는 쓰지 않는다(1단계 설계 문서
6절의 원칙을 웹 화면에도 그대로 적용 — 저장은 해 두고 로직은 코스 추천
단계로 미룬다).

## 6. 테스트 방침

카페·식당 2단계와 동일한 스타일. `tests/site/spot-payload.test.ts`(순수
빌더 함수), `tests/site/spot-types-conformance.test.ts`(zod 스키마와
`SiteSpot` 인터페이스의 필드 드리프트를 tsc로 잡는 컴파일 타임 테스트 —
식당의 `restaurant-types-conformance.test.ts`가 템플릿), API 라우트별
단위 테스트. 기존 카페·식당 테스트는 건드리지 않는다 — 전량 통과가
"카페·식당 영향 0"의 실측 증거다.

## 7. 범위 밖 (뒤로 미룬다)

- 코스 추천(카페+식당+가볼 곳을 하루 일정으로 묶기), 날씨 연동 — 1단계
  문서와 동일하게 완전히 새로운 브레인스토밍으로 다룬다.
- `Cafe`/`Restaurant`/`Spot`을 공용 `Place` 타입으로 합치는 리팩터.
- 체류시간·실내외·계절을 이용한 자동 랭킹/필터 로직 — 저장·표시까지만
  이번 범위, 로직은 코스 추천 단계로 미룬다.
- 가족 구성원별 취향 학습, 카톡 투표 등 — 로드맵 후반부 항목, 아직 이
  프로젝트의 확정 범위가 아니다.
