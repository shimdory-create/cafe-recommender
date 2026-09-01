# 식당 추천 웹 화면 (2단계) — 설계 문서

- 작성일: 2026-09-01
- 상태: 승인됨 (구현 계획 작성 대기)
- 선행 작업: `docs/superpowers/specs/2026-09-01-restaurant-pipeline-design.md` (1단계, 데이터 파이프라인만, master 병합 완료)

---

## 1. 무엇을 만드는가

1단계에서 만든 식당 추천 데이터(파이프라인 `data/restaurants.json` 등)를
가족용 웹앱(`web/`)에서 실제로 볼 수 있게 만든다. 카페 화면과 같은 기능을
전부(이번 주 추천·전체 목록·상세·다녀온 곳·후기·위시리스트) 식당 쪽에도
그대로 만든다.

**최우선 제약은 1단계와 같다: 지금 배포된 카페 화면은 한 줄도 동작이
바뀌지 않는다.** 새 라우트·새 데이터 파일만 추가한다.

## 2. 통합 방식 — 카페/식당 전환 스위치

하단 탭바(이번 주/전체/다녀온 곳/정보)는 이미 4칸이 꽉 차 있고, 엄지
도달 범위를 지키려 햄버거 메뉴를 쓰지 않기로 한 원칙(스펙 10.1)이 있다.
그래서 탭을 늘리지 않고, **상단 헤더에 카페/식당 전환 스위치**를 둔다.

- 헤더 높이는 56px 고정을 유지한다 — 전체 목록의 지역 헤더가 이 값을
  기준으로 붙어 있어(주석: "여기가 바뀌면 그쪽도 같이 바꿔야 한다"),
  새 행을 추가하지 않고 기존 56px 바 안에 스위치를 넣는다.
- 카페 쪽 기존 경로(`/`, `/list`, `/visited`, `/info`, `/cafe/[id]`)는
  그대로 두고, 식당 쪽을 `/restaurant`, `/restaurant/list`,
  `/restaurant/visited`, `/restaurant/info`, `/restaurant/[id]`로
  나란히 만든다.
- 전환 스위치는 "지금 보던 화면과 같은 종류"로 이동한다 — 목록을 보다가
  누르면 식당 목록으로, 상세 페이지에서는 대응하는 식당이 없으므로
  식당 홈(`/restaurant`)으로 보낸다. `usePathname()`으로 현재 세그먼트를
  읽어 대응 경로를 계산하는 순수 함수 하나(`web/src/lib/domain-switch.ts`)로
  처리한다.
- 하단 탭바(`tab-bar.tsx`)는 도메인을 인식하도록 확장한다 — 지금 하드코딩된
  `href="/"`, `href="/list"` 등을 현재 도메인(카페/식당) 접두어에 따라
  계산한다. **탭바 자체의 구조(4칸, 아이콘, 44px 터치 타겟)는 그대로다.**

## 3. 데이터 계층

### 3.1 표시용 스키마 확장

`src/restaurant-schema.ts`의 `SiteRestaurantSchema`(1단계 때 타입만 정의해
둔 placeholder)를 카페의 `SiteCafeSchema`와 동등한 수준으로 확장한다:

- 카페와 동일하게 유지: `hotScore`, `finalScore`, `postsPer30`, `posts30`,
  `posts90`, `acceleration`, `trend`, `ratingAvg`, `ratingCount`,
  `familyReviews`, `visitedOn`, `firstSeenAt`, `isNew`, `lastSeenAt`,
  `zone`, `area`, `driveMinutes`, `naverMapUrl`, `kakaoPlaceUrl`, `imageUrl`,
  `tags`, `evidence`, `parkingEvidence`, `parkingGrade`, `sigungu`, `name`, `id`
- 카페 전용 필드(`menuLevel`, `scale`, `mealTypes`, `stayDuration`) 대신
  식당 전용 필드를 쓴다: `cuisineType`, `hasRoom`, `reservable` (1단계
  `RestaurantAttributesSchema`에 이미 있음), `viewTypes`, `outdoorSeating`,
  `teenAppeal`도 카페와 동일하게 유지(가족적합도 계산에 이미 쓰이고 있음)
- `cityOnly` 개념은 식당에도 그대로 적용한다 — 주차 C는 배제가 아니라
  조건부 노출(1단계 게이트가 이미 이 규칙을 그대로 재사용 중)

### 3.2 페이로드 생성기

`src/site/restaurant-payload.ts`를 새로 만든다 — 카페의
`src/site/payload.ts`(`buildSitePayload`)와 대응하는 `buildRestaurantSitePayload`.
dedup 로직(`dedupeListings`), 이번 주 추천 선정(`pickWeek`), 화제 추이
판정(`trendOf`)은 **로직이 동일하므로 그대로 import해서 쓴다** — 카페
전용 필드를 참조하지 않는 순수 함수들이다. 새로 쓰는 부분은 식당
attributes → `SiteRestaurant` 필드 매핑뿐이다.

`src/cli/run.ts`의 `case 'site':`에 식당 페이로드 생성을 추가한다(기존
카페 생성 로직 위에 순수 추가) — `web/src/generated/site.json`과 나란히
`web/src/generated/site-restaurant.json`을 쓴다. `npm run site` /
`build:web` 스크립트는 손대지 않아도 이 case 안에서 같이 처리된다.

### 3.3 후기·다녀온 곳·위시리스트·숨김

카페가 쓰는 `web/src/lib/reviews.ts`, `web/src/lib/filter.ts`,
`web/src/lib/store.ts`, `web/src/lib/github-store.ts`는 **이미 도메인
무관한 범용 코드**임을 확인했다 — `kakaoPlaceId` 문자열과 `ListRow`
구조(제네릭 `<T extends ListRow>`)로만 동작하고 카페 전용 필드를
참조하지 않는다. `RestaurantListRow`를 `SiteRestaurant`와 같은 필드
이름으로 정의하면(카페 전용 필드 대신 식당 전용 필드가 들어가되 구조는
호환) 구조적 타이핑으로 그대로 재사용된다.

**그래서 새 파일을 만들지 않고, `reviews.ts`에 경로 상수 4개만 순수
추가한다:**

```typescript
export const RESTAURANT_REVIEWS_PATH = 'data/restaurant-reviews.json'
export const RESTAURANT_VISITS_PATH = 'data/restaurant-visits.json'
export const RESTAURANT_WISHLIST_PATH = 'data/restaurant-wishlist.json'
export const RESTAURANT_DISMISSED_PATH = 'data/restaurant-dismissed.json'
```

API 라우트는 새로 만든다(Next.js 라우팅이 파일 경로 기반이라 물리적으로
분리돼야 한다): `/api/restaurant/reviews`, `/api/restaurant/visited`,
`/api/restaurant/wishlist`, `/api/restaurant/dismissed`. 내부 로직은
기존 `/api/reviews` 등의 라우트 핸들러를 그대로 복사하되, 카페 라우트가
쓰는 `byId`(카페 존재 확인용)만 식당판 `byId`로 바꾼다. 나머지(검증,
락 재시도, 에러 응답 형태)는 동일하다.

### 3.4 식당판 site.ts / site-types.ts

카페의 `web/src/lib/site.ts`(`payload`/`homeFeed`/`byId`/`toListRow`/
`driveLabel`/`addedLabel`/`recentlyVisited`/`isStale`/`REVISIT_DAYS`/
`STALE_DAYS`)와 `web/src/lib/site-types.ts`(`SiteCafe`/`SitePayload`
인터페이스, zod 의존성 없는 순수 타입 파일 — Vercel이 `web/`에서만
설치해 `zod`를 못 찾는 문제를 피하려고 분리돼 있음)는 **1단계 백엔드가
`restaurant-schema.ts`를 `schema.ts`와 분리했던 것과 같은 이유로**
카페 파일에 얹지 않고 새 파일로 만든다:

- `web/src/lib/restaurant-site-types.ts` — `SiteRestaurant`,
  `RestaurantSitePayload` 인터페이스 (구조는 §3.1 참고)
- `web/src/lib/restaurant-site.ts` — `restaurantPayload`,
  `restaurantHomeFeed`, `restaurantById`, `toRestaurantListRow`,
  `CUISINE_LABEL`(카페의 `MENU_LABEL`에 대응), `ROOM_LABEL` 등. `driveLabel`/
  `addedLabel`/`recentlyVisited`/`isStale`는 날짜·숫자 계산만 하는
  순수 함수라 **`site.ts`에서 그대로 import해서 재사용**한다(중복 정의
  하지 않음).

## 4. 라우팅·UI 구성

### 4.1 새로 만드는 페이지 (카페 쪽 파일과 1:1 대응)

| 식당 | 대응 카페 파일 | 비고 |
|---|---|---|
| `web/src/app/restaurant/page.tsx` | `app/page.tsx` | 이번 주 추천 |
| `web/src/app/restaurant/home-feed.tsx` | `app/home-feed.tsx` | |
| `web/src/app/restaurant/feed-cards.tsx` | `app/feed-cards.tsx` | |
| `web/src/app/restaurant/list/page.tsx` + `list-client.tsx` | `app/list/*` | |
| `web/src/app/restaurant/visited/page.tsx` + `visited-list.tsx` | `app/visited/*` | |
| `web/src/app/restaurant/info/page.tsx` | `app/info/page.tsx` | |
| `web/src/app/restaurant/[id]/page.tsx` + `review-panel.tsx` + `wish-heart.tsx` + `back-link.tsx` | `app/cafe/[id]/*` | |
| `web/src/app/restaurant-card.tsx` | `app/cafe-card.tsx` | 카드 상단 3종을 `cuisineType`/`parkingGrade`/`hasRoom·reservable`로 교체 |

`filters.tsx`(칩·검색창), `thumb.tsx`, `naver-map-link.tsx`는 이미
도메인 무관(props로 데이터를 받음) — **그대로 재사용**하고 새로 만들지
않는다.

### 4.2 카드 표시 내용 변경

카페 카드의 "규모 · 주차 · 메뉴 레벨" 3종 고정 정보 자리에, 식당은
"음식종류 · 주차 · 룸/예약"을 놓는다:

```
한식 · 주차 넉넉 · 룸 있음 · 예약 가능
```

(`hasRoom`/`reservable`이 둘 다 없으면 그 자리는 생략 — 카페의
`menuLevel` 미확인 처리와 같은 방식)

### 4.3 레이아웃·전환 스위치

`web/src/app/layout.tsx`에 스위치 컴포넌트(`domain-switch.tsx`, 신규
파일)를 추가한다. 헤더 오른쪽(현재 `VIEW_ONLY` 배지가 있는 자리 옆)에
"☕ 카페 / 🍚 식당" 두 칸짜리 세그먼트 버튼을 놓는다. 44px 터치 타겟은
유지하되 56px 헤더 높이 안에 들어가야 하므로 버튼 자체 높이는 36~40px로
잡는다(칩과 동일한 판단 — `filters.tsx`의 `CHIP_BASE` 40px 결정과 같은
이유).

## 5. 테스트 방침

카페 웹의 테스트 스타일(순수 함수 단위 테스트: `filter.test.ts`,
`paging.test.ts`, `reviews.test.ts`, `view-only.test.ts`,
`visited-list.test.ts`)을 그대로 따른다. `filter.ts`/`reviews.ts`는
코드를 공유하므로 **새 테스트 파일을 만들지 않고 기존 테스트가 이미
검증**한다 — 식당 전용으로 새로 필요한 테스트는:

- `restaurant-card.test.ts` 또는 스냅샷 — 카드 상단 3종 표시 로직
- `domain-switch.test.ts` — 현재 경로 → 대응 경로 계산 순수 함수
- `restaurant-payload.test.ts` (파이프라인 쪽) — `buildRestaurantSitePayload`
- `types-conformance.test.ts` 확장 — `SiteRestaurant` zod 스키마와
  web의 `site-types.ts` 인터페이스가 서로 대입 가능한지 (드리프트 감지,
  카페 쪽과 같은 안전장치)

빌드 검증: `npm run build:web`이 `site-restaurant.json` 생성까지 포함해
성공하는지 확인한다. 브라우저로 전환 스위치·목록·상세·후기 작성(로컬
스토어 폴백)을 한 번씩 눌러 확인한다.

## 6. 범위 밖 (더 뒤로 미룬다)

- "이 카페 근처 식당" 연관 검색 (스펙 자체 언급, 아직 안 함)
- `Cafe`/`Restaurant`를 공용 `Place` 타입으로 합치는 리팩터
- 데스크톱 전용 레이아웃 (카페도 안 만들었음 — 480px 센터 정렬 그대로)
- PWA 매니페스트/아이콘에 식당 전용 브랜딩 추가 (지금은 "심김 빵지순례"
  타이틀을 그대로 씀 — 카페/식당 통합 앱 하나라는 관점 유지)
