# 앵커 기반 도메인 간 근처 추천 — 1단계 설계

**작성일**: 2026-09-03
**상태**: 사용자 승인 완료 (직선거리 방식, 복수 추천, 상세 페이지 노출)

## 배경과 목적

카페·식당·가볼 곳 세 도메인이 각자 완전히 독립된 리스트로만 존재한다.
사용자가 로드맵에서 밝힌 다음 단계는 "오늘 어디갈까"류의 코스 짜기
기능인데, 그 전 단계로 가장 작고 즉시 유용한 조각을 먼저 만든다:
**상세 페이지에서 다른 두 도메인의 가까운 곳을 보여주기.** 카페를 보다가
"이 근처에 갈 만한 식당·가볼 곳"을 바로 알 수 있게 한다.

이 스펙은 **1단계**만 다룬다. 이동시간 정밀화(카카오 길찾기 API 기반),
전체 코스 짜기(day-course composer)는 명시적으로 범위 밖이며 각자 별도
브레인스토밍이 필요하다.

## 합의된 요구사항

- 카페·식당·가볼 곳 **어느 쪽에서 봐도** 나머지 두 도메인이 대칭으로
  나온다 (카페 상세 → 근처 식당 + 근처 가볼 곳, 식당 상세 → 근처 카페 +
  근처 가볼 곳, 가볼 곳 상세 → 근처 카페 + 근처 식당).
- 거리는 **직선거리**(위경도 haversine)로만 계산한다. 실제 도로 이동시간은
  2단계로 유예.
- 도메인당 **5개**까지 보여준다.
- **거리 상한 없음** — 아무리 멀어도 가까운 순으로 5개는 채운다(단,
  후보 자체가 5개 미만이면 있는 만큼만).
- **상세 페이지에만** 노출한다. 리스트 카드 미리보기는 범위 밖.

## 데이터 모델

### 소스 필드

좌표(`lat`/`lng`)는 최종 사이트 페이로드(`SiteCafeSchema` 등)엔 없고
원본 데이터(`data/cafes.json`/`restaurants.json`/`spots.json`, 필드
`lat`/`lng`, `status`)에만 있다. `src/cli/run.ts`의 `site` 케이스는 이미
세 원본 배열과 세 최종 페이로드를 전부 메모리에 들고 있으므로, 이 시점에
원본에서 좌표를, 페이로드에서 카드 표시 필드를 뽑아 ID(`kakaoPlaceId`)로
조인한다.

후보는 각 도메인의 `status === 'active'`(= 최종 페이로드에 실제로 실린
곳)만 대상으로 한다. **`cityOnly`(주차 C, 도심 전용) 항목은 근처 추천
후보에서 제외한다** — 전체 리스트에서 도심 모드를 켜야만 보이는 것과
같은 기본값을 유지해, 도심 모드를 한 번도 안 켠 사용자에게 다른 화면을
통해 주차 어려운 곳이 섞여 들어가지 않게 한다.

### 계산 함수 — `src/site/nearby.ts` (신규, 순수 함수)

```typescript
export interface GeoPoint {
  id: string
  lat: number
  lng: number
}

export interface NearbyMatch {
  id: string
  distanceKm: number
}

/**
 * anchors 각각에 대해 candidates 중 haversine 직선거리로 가장 가까운
 * limit 개를 오름차순으로 반환한다. anchors 와 candidates 는 서로 다른
 * 도메인이라는 전제 — 같은 도메인끼리는 호출하지 않는다.
 */
export function nearestByDomain(
  anchors: GeoPoint[],
  candidates: GeoPoint[],
  limit: number,
): Map<string, NearbyMatch[]>

/** km, 소수 첫째 자리까지 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number
```

`nearestByDomain`은 각 anchor마다 candidates 전체와 거리를 계산해
정렬 후 `limit`개를 자른다. anchor 수 × candidate 수가 지금 규모
(카페 ~1,500 × 식당 수천)에서도 순수 산술이라 밀리초 단위로 끝난다 —
API 호출이 전혀 없다.

### 출력 파일 — 3개, 도메인당 하나

`web/src/generated/site-cafe-nearby.json`,
`site-restaurant-nearby.json`, `site-spot-nearby.json`.

각 파일의 모양(카페 예시 — 자기 자신인 카페는 안 담고 나머지 둘만):

```typescript
export interface NearbyCard {
  id: string
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
  /** 이 카드의 앵커로부터의 직선거리, km, 소수 첫째 자리 */
  distanceKm: number
}

export type NearbyPayload = Record<
  string, // 앵커의 id
  { restaurants: NearbyCard[]; spots: NearbyCard[] } // 카페 파일 기준
>
```

**`driveMinutes`는 이 카드에 넣지 않는다.** 기존 페이로드의
`driveMinutes`는 "집에서 그 장소까지"인데, 근처 추천 카드에 그대로
쓰면 "지금 보는 카페에서 근처 식당까지"로 오해하기 쉽다. 혼동 소지가
있는 필드를 아예 빼고, `distanceKm`(앵커 기준 직선거리)만 보여준다.

앵커 자신의 데이터가 없는 경우(예: 판정 대기 중이라 아직 `active`가
아닌 곳)는 그 앵커 키 자체가 파일에 없다 — 상세 페이지 쪽에서 lookup이
실패하면(값이 `undefined`) 근처 추천 섹션 전체를 안 그린다.

## 빌드 파이프라인 연결

`src/cli/run.ts`의 `'site'` 케이스, 카페·식당·가볼 곳 페이로드를 전부
쓴 뒤 맨 끝에 한 단계 추가한다:

```typescript
// 근처 추천 3파일 — 카페·식당·가볼 곳 페이로드가 전부 준비된 뒤에만
// 계산 가능하다. 실패해도 이미 써진 세 페이로드는 그대로 유지 —
// 식당·가볼 곳 페이로드 실패 처리와 같은 이유(독립 try/catch).
try {
  const nearby = buildNearbyPayloads({
    cafes, restaurants, spots, // 원본 배열 (좌표)
    cafePayload: payload, restPayload, spotPayload, // 표시 필드
  })
  await writeFile(cafeNearbyOut, JSON.stringify(nearby.cafe, null, 2) + '\n', 'utf8')
  await writeFile(restNearbyOut, JSON.stringify(nearby.restaurant, null, 2) + '\n', 'utf8')
  await writeFile(spotNearbyOut, JSON.stringify(nearby.spot, null, 2) + '\n', 'utf8')
} catch (e) {
  console.error(`[!] 근처 추천 계산 실패 — 다른 페이로드는 이미 써졌다: ${(e as Error).message}`)
}
```

`buildNearbyPayloads`(신규, `src/site/nearby-payload.ts`)가 원본
배열에서 좌표를 뽑고 `nearestByDomain`을 세 방향(카페→식당, 카페→가볼곳,
식당→가볼곳, 그리고 그 반대 방향까지 총 6번 — 카페→식당과 식당→카페는
서로 다른 anchor 기준이라 별도 계산이 필요하다)으로 호출해 세 페이로드
객체를 만들어 반환한다. 이 함수는 파일 I/O를 하지 않는 순수 함수로 두어
유닛 테스트가 가능하게 한다.

`restaurants`/`spots`가 이전 단계의 try/catch에서 실패해 비어있는
채로 넘어올 수 있다 — 그 경우 그 도메인 관련 근처 추천은 빈 배열이
된다(에러는 아님, 자연스럽게 "그 도메인은 근처에 없음"과 같은 결과).

## UI

### 신규 공용 컴포넌트 — `web/src/app/nearby-card.tsx`

```typescript
export function NearbyCard({ item, href }: { item: NearbyCard; href: string }): JSX.Element
export function NearbySection(
  { title, items, hrefPrefix }: { title: string; items: NearbyCard[]; hrefPrefix: string },
): JSX.Element | null // items 가 빈 배열이면 null (섹션 자체를 안 그림)
```

카드 하나는 작은 썸네일 + 이름 + 태그 1~2개 + 평점(있으면) +
"직선거리 X.Xkm" 정도의 가벼운 표시. 클릭하면 해당 도메인의 상세
페이지(`/cafe/{id}`, `/restaurant/{id}`, `/spot/{id}`)로 이동하는
평범한 링크 — 어디서 왔는지 같은 컨텍스트는 안 싣는다(다른 도메인 전환
pill과 같은 수준의 단순 네비게이션).

**위시리스트·블랙리스트 토글은 이 카드에 안 넣는다.** 넣으려면 카페
상세 페이지가 식당·가볼 곳 도메인의 훅(`useRestaurantWishlist`,
`useSpotBlacklist` 등)까지 전부 끌어와야 해서 1단계치고 과하다 — 담고
싶으면 카드를 눌러 그 도메인 상세 페이지로 가서 담으면 된다.

### 도메인별 필터링 (클라이언트 사이드)

정적 페이로드는 특정 사용자의 블랙리스트·폐업숨김 상태를 모른다(빌드
타임 계산이라 전역 데이터). 상세 페이지 컴포넌트에서 렌더링 직전에
**해당 도메인의 기존 훅**으로 걸러낸다 — 카페 상세 페이지가 근처 식당을
그릴 때 `useRestaurantBlacklist()` + `useRestaurantDismissed()`를 불러
`!blacklisted.has(id) && !dismissed.has(id)`로 필터링. 새 훅은 필요 없다
— 이미 있는 3×2개(도메인×블랙리스트/폐업숨김) 훅을 그대로 재사용한다.

### 세 상세 페이지에 배치

`web/src/app/{cafe,restaurant,spot}/[id]/page.tsx` 각각에 근처
추천 데이터를 읽는 신규 lib 함수(`nearbyForCafe(id)` 등, 기존
`spotById` 패턴과 동일하게 도메인별 lib 파일에 추가)를 불러, 리뷰
섹션 아래쪽에 `<NearbySection>` 두 개(자기 도메인 제외 나머지 둘)를
배치한다. 클라이언트 필터링이 필요하므로 이 부분은 서버 컴포넌트인
`page.tsx`가 아니라 새 클라이언트 컴포넌트(`nearby-sections.tsx`,
도메인별 3개)로 분리해 훅을 쓴다 — `ReviewPanel`이 이미 같은 이유로
클라이언트 컴포넌트로 분리돼 있는 것과 같은 패턴.

## 테스트

- `src/site/nearby.test.ts`: `haversineKm`(알려진 두 좌표 간 거리로
  정답 검증), `nearestByDomain`(정렬·상한·anchor 없음/candidate 없음
  경계 케이스).
- `src/site/nearby-payload.test.ts`: `cityOnly` 제외, `driveMinutes`가
  출력에 없는지, 앵커 자신 도메인이 결과에 안 섞이는지.
- 상세 페이지 자체는 기존 관례대로(서버 컴포넌트, 별도 렌더 테스트
  없음) 프로덕션 브라우저 실측으로 검증한다.

## 명시적으로 범위 밖 (2단계 이후)

- 실제 도로 이동시간 반영 (직선거리로 1차 후보 좁힌 뒤 카카오 길찾기로
  정밀화 — 이전 대화에서 합의한 방향, 이번 스펙엔 없음)
- 리스트 카드 미리보기, 근처 추천 카드의 위시리스트/블랙리스트 토글
- 코스 짜기(여러 곳을 시간대별로 묶기), 날씨 연동, 가족 구성원별
  선호 학습 — 전부 로드맵의 더 뒤 단계
