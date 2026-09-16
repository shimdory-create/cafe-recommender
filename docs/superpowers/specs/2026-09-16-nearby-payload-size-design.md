# 근처 추천 페이로드 용량 축소 — 설계

**작성일**: 2026-09-16
**상태**: 사용자 승인 완료 (안 B — 위경도를 리스트 페이로드로 옮기고 read-time 조립)

## 배경과 목적

2단계(실제 이동시간) 배포 뒤 실측해보니 근처 추천 3파일이 예상보다 훨씬
컸다: `site-restaurant-nearby.json` 19MB, `site-cafe-nearby.json` 10MB,
`site-spot-nearby.json` 2.7MB — 합쳐서 32MB. 기존 리스트 페이로드
(`site.json` 2.5MB, `site-restaurant.json` 3.9MB)보다 훨씬 크고, 이
파일들은 **매일 git에 커밋되어 GitHub(원격 저장소)에 그대로 쌓인다** —
로컬 `.git`이 이미 230MB인 주된 원인이다.

원인은 중복이다. 식당 하나가 평균 9곳 정도의 카페 앵커의 top-10 후보에
들어가는데, 그때마다 그 식당의 이름·이미지·태그·평점을 **통째로 다시
저장**한다. 정작 필요한 새 정보(거리·실측 이동시간)는 몇 바이트인데,
같이 딸려오는 표시용 필드가 대부분의 용량을 차지한다.

**아직 체감되는 장애는 없다** — 사용자가 명시적으로 예방 차원이라고
확인함. 그래서 효과가 확실한 안(안 B)으로 가되, 범위는 이 파일들의
저장 형식과 그걸 읽는 웹 쪽 조립 로직으로 한정한다.

## 합의된 방향

- 근처 추천 파일에는 **관계 정보만** 남긴다: `{id, distanceKm,
  driveMinutes}`. 이름·이미지·태그·평점·`directionsUrl`은 저장하지 않는다.
- 그 표시용 필드들은 **읽는 시점에** 해당 도메인의 기존 리스트 페이로드
  (`site.json`/`site-restaurant.json`/`site-spot.json`)에서 id로 찾아
  채운다 — 이 페이로드들은 페이지가 어차피 이미 메모리에 들고 있다.
- `directionsUrl`(네이버지도 자동차 길찾기 링크)은 위경도가 있어야
  계산할 수 있는데, 지금 리스트 페이로드엔 위경도가 없다. **리스트
  페이로드 3개에 `lat`/`lng`를 추가**해서, `directionsUrl` 계산 자체를
  build 시점(`src/site/nearby-payload.ts`)에서 read 시점(`web/`)으로
  옮긴다.
- `nearby-card.tsx`·`nearby-sections.tsx`·`course-section.tsx`는
  **전혀 안 건드린다** — 이 컴포넌트들이 받는 `NearbyCard`(웹 쪽 타입,
  `web/src/lib/nearby-types.ts`)의 모양은 그대로 유지되고, 조립을
  대신해주는 함수만 그 앞에 하나 생긴다.

## 데이터 모델 변경

### 리스트 페이로드에 위경도 추가

`src/schema.ts`(`SiteCafeSchema`), `src/restaurant-schema.ts`
(`SiteRestaurantSchema`), `src/spot-schema.ts`(`SiteSpotSchema`) —
3개 스키마 전부에 추가:

```typescript
lat: z.number(),
lng: z.number(),
```

각 payload 빌더(`src/site/payload.ts`, `src/site/restaurant-payload.ts`,
`src/site/spot-payload.ts`)에서 행을 만드는 자리에 원본 레코드의
`lat`/`lng`를 그대로 흘려보낸다(계산 없음, 값 전달만). 도메인당 몇십 KB
수준의 증가라 무시할 수 있다(리스트는 도메인당 1,500~1,700개 행뿐이고,
숫자 두 개 추가일 뿐이다 — 근처 추천 파일처럼 앵커×후보로 곱해지지
않는다).

이 좌표는 클라이언트 번들(리스트 페이지의 `'use client'` 컴포넌트)에도
그대로 실린다 — 다만 카페·식당·가볼 곳은 전부 공개 사업장이고, 이미
`naverMapUrl`/`kakaoPlaceUrl`로 위치를 찾아갈 수 있게 돼 있으므로
위경도 노출 자체는 새로운 정보 노출이 아니다.

### `src/site/nearby-payload.ts` — 저장 형식 축소

```typescript
export interface NearbyRelation {
  id: string
  distanceKm: number
  /** 실측 있으면 분 단위, 없으면 null */
  driveMinutes: number | null
}

export interface BuildNearbyInput {
  cafeSite: SiteCafe[]
  restaurantSite: SiteRestaurant[]
  spotSite: SiteSpot[]
  driveCache: NearbyDrivePair[]
  preLimit: number
  limit: number
}

export interface NearbyPayloads {
  cafe: Record<string, { restaurants: NearbyRelation[]; spots: NearbyRelation[] }>
  restaurant: Record<string, { cafes: NearbyRelation[]; spots: NearbyRelation[] }>
  spot: Record<string, { cafes: NearbyRelation[]; restaurants: NearbyRelation[] }>
}
```

**`cafes`/`restaurants`/`spots`(원본 배열) 입력이 사라진다.** 지금은
위경도를 얻으려고 원본 배열과 사이트 페이로드를 id로 join했는데(`toGeoCards`),
사이트 페이로드에 위경도가 생기면 그 join 자체가 필요 없어진다 —
사이트 페이로드 하나만 있으면 좌표도, `cityOnly`도, 후보 판단도 다
된다. `toGeoCards`는 `GeoPoint`(id/lat/lng)만 반환하도록 단순화되고,
표시 필드를 나르던 `GeoCard`·이름/이미지/태그 인자는 전부 제거된다.

`directionsUrl()` 함수는 이 파일에서 **완전히 삭제**한다 — read 시점
(웹 쪽)으로 옮겨간다.

`toCards`/`nearbyMap`도 같이 단순해진다: `directionsUrl`이 read 시점으로
옮겨가면서 앵커의 좌표·이름도, 후보의 표시 필드도 이 함수들엔 더는
필요 없다 — `lookupPair(driveIndex, anchorId, candidateId)`는 문자열
id 두 개만 있으면 되기 때문이다. 그래서 `toCards`는 앵커를
`GeoCard` 객체가 아니라 **`anchorId: string`**으로 받고,
`nearbyMap`도 `anchorById` 조회 없이 `nearestByDomain`이 돌려준
`Map<anchorId, NearbyMatch[]>`을 그대로 순회한다:

```typescript
function toCards(
  anchorId: string,
  matches: NearbyMatch[],
  driveIndex: Map<string, NearbyDrivePair>,
  finalLimit: number,
): NearbyRelation[]

function nearbyMap(
  anchors: GeoPoint[],
  candidates: GeoPoint[],
  driveIndex: Map<string, NearbyDrivePair>,
  preLimit: number,
  finalLimit: number,
): Map<string, NearbyRelation[]>
```

정렬 기준(캐시 실측 우선, 없으면 `estimateDriveMinutes(distanceKm)`)은
그대로다 — 무엇을 저장하느냐와 무엇을 조회 근거로 쓰느냐만 바뀐다.

`case 'site':`(`src/cli/run.ts`)의 `buildNearbyPayloads(...)` 호출부도
`cafes`/`outerRestaurants`/`outerSpots` 인자를 더 이상 안 넘기게
짧아진다.

## 웹 쪽 — read 시점 조립

### 신규 — `web/src/lib/nearby-resolve.ts`

카페·식당·가볼 곳 리스트 페이로드(이미 있는 `payload`/`restaurantPayload`/
`spotPayload`, 이제 위경도 포함) 3개를 모듈 로드 시 한 번씩 `Map`으로
색인해두고, `{도메인, id}`로 조회하는 함수 하나와, `NearbyRelation` 배열을
받아 기존과 똑같은 모양의 `NearbyCard[]`로 조립하는 함수 하나를 내보낸다.

```typescript
export type Domain = 'cafe' | 'restaurant' | 'spot'

export function resolveNearbyCards(
  anchorDomain: Domain, anchorId: string,
  candidateDomain: Domain, relations: NearbyRelation[],
): NearbyCard[]
```

내부에서 앵커를 못 찾으면(판정 대기 등으로 아직 리스트에 없는 경우)
빈 배열을 반환한다 — 1단계 때 "앵커 자신의 데이터가 없으면 근처 추천
섹션 전체를 안 그린다"는 규칙과 동일한 결과가 나온다. 후보를 못 찾는
경우(블랙리스트·판정 탈락 등으로 리스트에서 빠진 경우)는 그 항목만
건너뛴다(전체를 안 비운다 — 다른 유효한 후보는 그대로 보여준다).

`directionsUrl` 계산 공식은 `src/site/nearby-payload.ts`에서 삭제된
것과 **동일한 공식**을 그대로 옮겨온다(좌표 뒤에 이름을 붙이는 3차
시도 형식 — 스펙 v1의 코드 주석 그대로 보존).

### `web/src/lib/site.ts`/`restaurant-site.ts`/`spot-site.ts` 수정

`nearbyForCafe`/`nearbyForRestaurant`/`nearbyForSpot`가 원시 JSON을
그대로 반환하던 것에서, `resolveNearbyCards`를 거쳐 조립한 결과를
반환하도록 바뀐다. **반환 타입(`{ restaurants: NearbyCard[]; spots:
NearbyCard[] } | undefined` 등)은 그대로다** — 이 함수를 호출하는
`nearby-sections.tsx` 3개는 코드 변경이 전혀 없다.

## 명시적으로 범위 밖

- `web/src/lib/nearby-types.ts`의 `NearbyCard` 모양 자체는 안 바뀐다
  (여전히 name/imageUrl/tags/…/directionsUrl 다 있음) — 바뀌는 건
  "어디서 채우느냐"뿐이다.
- `data/raw/`(696MB, OneDrive 동기화 문제)는 이 작업과 무관한 별개
  사안이다 — 프로젝트 폴더를 OneDrive 밖으로 옮기는 것으로 사용자가
  별도 처리하기로 했다.
- 근처 추천 2단계의 다른 부분(캐시 채우기 잡, 대칭 근사, K=10 등)은
  전혀 안 건드린다.
- "#9 파이프라인 상태 요약"은 별도 작업이다(이 스펙 다음에 따로
  브레인스토밍).

## 테스트

- `tests/site/nearby-payload.test.ts`: 출력 검증을 `NearbyRelation`
  기준(`{id, distanceKm, driveMinutes}`)으로 다시 쓴다. `directionsUrl`·
  `name`·`imageUrl` 관련 기존 assertion은 전부 지운다(이 파일이 더는
  그 값들을 안 만든다). `cafes`/`restaurants`/`spots` 입력 없이
  `cafeSite`/`restaurantSite`/`spotSite`만으로 호출하도록 모든 테스트
  케이스 갱신 — 이때 각 테스트의 site 픽스처에 `lat`/`lng`를 추가해야
  한다(지금은 좌표가 원본 배열 쪽에만 있었다).
- 신규 `tests/lib/nearby-resolve.test.ts`(web): 정상 조회 시 기존
  `NearbyCard` 모양대로 채워지는지, 앵커를 못 찾으면 빈 배열인지,
  후보 중 일부를 못 찾으면 그것만 건너뛰는지, `directionsUrl`이 기존
  공식과 같은 값을 내는지(알려진 좌표 쌍으로 골든 값 비교) 검증한다.
- `src/schema.ts`/`restaurant-schema.ts`/`spot-schema.ts`의 기존
  스키마 테스트가 있다면(SiteCafeSchema 등을 파싱하는 테스트) lat/lng
  누락 시 파싱 실패하는지도 자연히 커버된다 — 필수 필드라서 없으면
  zod가 에러를 낸다.
