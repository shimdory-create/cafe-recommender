# 앵커 기반 도메인 간 근처 추천 — 2단계 설계 (실제 이동시간 정밀화)

**작성일**: 2026-09-15
**상태**: 사용자 승인 완료
**전 단계**: [2026-09-03-anchor-nearby-recommendations-design.md](2026-09-03-anchor-nearby-recommendations-design.md) (1단계, 직선거리 기반, 라이브)

## 배경과 목적

1단계는 상세 페이지에서 다른 두 도메인의 가까운 곳을 **직선거리**(haversine)
기준으로 보여준다. 1단계 스펙 자체에 "이동시간 정밀화는 2단계로 유예"라고
명시돼 있었고, 그 2단계가 이것이다.

직선거리는 방향까지 틀릴 수 있다 — 기존 `kakao-directions.ts` 주석의 실측
사례(강화 46분 추정/64분 실측, 양평 104분 추정/85분 실측)가 근처 추천에도
그대로 적용된다. 다리 하나뿐인 지역, 우회로가 필요한 지역에서 "직선거리로는
가깝지만 실제로는 먼 곳"이 상위에 뜨면 추천의 신뢰가 깨진다.

## 합의된 요구사항

- 상세 페이지에 최종 노출하는 개수는 1단계와 동일하게 **5개**.
- 1차로 직선거리 기준 **상위 10개**(K=10)를 추려서, 그 10개만 카카오
  길찾기로 실측한다 — 전체 조합(N×M)을 다 재지 않는다. K가 클수록 순위
  정확도는 올라가지만 API 호출량도 늘어난다는 트레이드오프를 사용자에게
  설명하고 10으로 확정했다.
- **A→B와 B→A는 대칭으로 근사한다.** 일방통행 등으로 미세한 오차가
  생길 수 있지만, 안전·과금에 영향이 없는 "근처 추천"이라는 기능 성격상
  허용 가능하다고 사용자가 승인했다. 이 근사로 필요한 API 호출량이 대략
  절반으로 줄어든다.
- 캐시는 **한 번 재면 영구 보관**(append-only, 덮어쓰지 않음) — 좌표가
  안 바뀌므로 페어의 실제 이동시간도 안 바뀐다. 기존 `kakao-directions.ts`
  의 "카페는 움직이지 않으므로 한 번 재서 영구 보관" 원칙을 페어 단위로
  그대로 확장한다.
- 새 잡은 **매일** 돈다(처음엔 "주간"으로 검토했으나, 주 1회로는 하루
  예산이 있어도 실제 처리 속도가 주 단위로 떨어져 초기 백필에만 9~14주가
  걸린다는 게 드러나 매일로 정정했다).
- 초기 백필(캐시가 비어 있는 상태에서 첫 실행들) 하루 예산은 **5,000건**.
  카카오 길찾기 무료 한도(일 10,000건)와 기존 도메인별 `weekly-drive`(증분,
  소량)를 감안한 절충값. 방향별로 따로 재면(대칭 근사 없이) 카페 활성
  ~1,500 × K10 × 2방향 + 식당 ~1,700 × K10 × 2방향 + 가볼 곳 ~350 × K10
  × 2방향 ≈ 71,000건. 대칭 근사(같은 페어가 반대 방향 계산 때 캐시
  히트로 스킵됨)를 적용하면 실제 고유 페어 수는 이보다 줄어 대략
  4만~7만 건 사이로 추정되며(완전 대칭이 아니므로 정확히 절반은 아님),
  이 예산으로 8~14일 정도 걸릴 것으로 본다.
- 근처 추천 카드 표시: **실측치가 있으면 "차로 N분", 없으면(아직 캐시가
  못 채운 페어) 1단계처럼 직선거리** 표시. 1단계에서 `driveMinutes`를
  일부러 카드에서 뺐던 이유(집 기준 필드와 혼동)는 이제 해당하지 않는다
  — 이번엔 "이 앵커에서 이 후보까지"를 정확히 계산한 새 값이라 혼동
  소지가 없다.

## 데이터 모델

### 신규 캐시 파일 — `data/nearby-drive-cache.json`

```typescript
export interface NearbyDrivePair {
  /** [id1, id2].sort().join(':') — 방향 무관, 대칭 근사 */
  pairKey: string
  minutes: number
  km: number
  tollWon: number | null
  measuredAt: string
}
```

append-only 배열. 기존 `data/*.json`과 같은 저장 규약(들여쓰기 2 + 끝
개행, `writeArray` 패턴 재사용)을 따른다.

### 신규 순수 함수 — `src/site/nearby-drive-cache.ts`

```typescript
/** 방향 무관 페어 키. pairKeyOf(a,b) === pairKeyOf(b,a) */
export function pairKeyOf(idA: string, idB: string): string {
  return [idA, idB].sort().join(':')
}

/** 캐시 배열을 pairKey -> 항목 Map으로 색인한다. 호출자가 한 번만 만들어 재사용한다 */
export function buildPairIndex(cache: NearbyDrivePair[]): Map<string, NearbyDrivePair>

/** 색인에서 두 지점 간 실측 페어를 찾는다. 없으면 null */
export function lookupPair(
  index: Map<string, NearbyDrivePair>,
  idA: string,
  idB: string,
): NearbyDrivePair | null
```

**설계 시 잡았던 초안(매 호출마다 배열을 받아 내부에서 Map을 새로 만드는
안)은 계획 작성 중 성능 문제로 정정했다.** site 빌드는 앵커×후보 조합마다
(하루 여러 번, 앵커 수천 개) 이 조회를 반복 호출하는데, 매번 캐시 배열
전체(수만 건까지 자람)로 Map을 다시 만들면 안 된다. 그래서 색인은
`buildPairIndex`로 **호출자가 한 번만** 만들고, `lookupPair`는 그 색인을
받아 O(1)로 찾는다 — 잡·빌드 양쪽에서 이 순서(먼저 색인, 그다음 반복 조회)
로 재사용한다.

## 잡 파이프라인

### 신규 매일 잡 — `src/jobs/nearby-drive-times.ts`

기존 `src/jobs/drive-times.ts`(카페 집→장소 실측)와 같은 얇은 구조를
따르되, 대상이 "장소 하나"가 아니라 "도메인 간 페어"라는 점이 다르다.

```typescript
export interface NearbyDriveDeps {
  store: {
    readCafes(): Promise<Cafe[]>
    readRestaurants(): Promise<Restaurant[]>
    readSpots(): Promise<Spot[]>
    readNearbyDriveCache(): Promise<NearbyDrivePair[]>
    writeNearbyDriveCache(rows: NearbyDrivePair[]): Promise<void>
    appendRaw: /* 기존과 동일 */
    readHealth: /* 기존과 동일 */
    writeHealth: /* 기존과 동일 */
  }
  directions: { route: (o: Coord, d: Coord) => Promise<{ route: Route | null; payload: unknown }> }
  now?: Date
}

export interface NearbyDriveResult {
  /** 이번 실행에서 새로 캐시에 채운 페어 수 */
  measured: number
  unroutable: number
  failed: number
  /** 예산 소진으로 오늘은 여기까지만 했다는 표시 (실패 아님) */
  budgetExhausted: boolean
}

export const DAILY_BUDGET = 5000

export async function runNearbyDriveTimes(
  deps: NearbyDriveDeps,
  opts: { budget?: number } = {},
): Promise<NearbyDriveResult>
```

동작:

1. 활성(`status === 'active'`) 카페·식당·가볼 곳을 읽는다(1단계 `nearby.ts`
   의 `toGeoCards`와 같은 방식으로 좌표를 뽑되, `cityOnly` 제외 규칙도
   1단계와 동일하게 후보 쪽에만 적용한다).
2. `nearestByDomain`(1단계, 기존 함수 재사용)으로 6방향 top-10을 계산한다.
3. 6방향 결과를 순회하며 각 (anchor, candidate) 페어에 대해
   `lookupPair(cache, anchorId, candidateId)`로 캐시 히트 여부를 본다.
   히트면 건너뛴다(같은 페어가 여러 방향에서 중복으로 나오는 경우도
   두 번째부터는 캐시 히트로 처리되므로 자연스럽게 대칭 근사가 적용된다).
4. 미스인 페어만 모아 `DAILY_BUDGET`(또는 `opts.budget`)만큼 앞에서부터
   잘라 카카오 길찾기를 호출한다. 남은 미스가 있으면 `budgetExhausted:
   true` — 내일 잡이 이어서 처리한다(순서는 매번 같은 기준으로 재계산되는
   top-10에서 나오므로, 오늘 예산에서 밀린 페어가 내일도 top-10 안에
   남아 있으면 자연히 우선 처리된다. 밀려나면 처리 안 해도 무방하다 —
   그 페어를 더 이상 아무도 필요로 하지 않는다는 뜻이다).
5. 성공한(경로를 찾은) 페어만 캐시에 append하고 저장한다. **경로를 못
   찾은 페어(섬 등)는 캐시에 안 남긴다** — 기존 `drive-times.ts`가
   `driveMinutes == null`인 카페를 매주 다시 시도하는 것과 같은 이유로,
   다음날 다시 시도된다. 빈도가 낮고(섬 지역) 재시도 비용이 작아 별도
   "영구 실패" 캐시는 두지 않는다. `FLUSH_EVERY`(기존 잡들과 같은 25건
   주기) 중간 저장으로 중단 시 손실을 줄인다.
6. **health 기록**: `classify.ts`에서 이미 고친 원칙을 처음부터 반영한다
   — 오늘 처리할 미스가 0건(=캐시가 이미 다 채워진 정상 상태)이어도
   성공으로 기록한다. 미스가 있었는데 전부 실패한 경우만 성공 기록을
   안 한다.
   ```typescript
   if (misses.length === 0 || measured > 0) await recordSuccess(store, NEARBY_DRIVE_SOURCE, now)
   ```
7. 쿼터 소진(429) 감지·조기 중단은 기존 discover/classify 잡들과 같은
   `QUOTA_GIVE_UP = 3` 연속 오류 패턴을 그대로 쓴다. 카카오 길찾기는
   Gemini와 다른 키·한도지만, 네트워크 장애 등 다른 원인의 연속 실패도
   일찍 멈추는 게 안전하다는 원칙은 동일하다.

### health 소스명

`kakao-directions-nearby` — 기존 `kakao-directions`(카페 집→장소)와
구분되는 별도 이름. `src/jobs/usage-watch.ts`의 `WEEKLY_SOURCES` 배열에
추가한다(이 잡 자체는 매일 돌지만, 캐시가 다 채워진 뒤엔 "오늘 신규 0건"
이 며칠 이어질 수 있는 성격이 週간 소스들과 비슷하다 — `DAILY_STALE_HOURS`
36시간보다 `WEEKLY_STALE_HOURS` 216시간이 오탐 위험이 적다).

### 스케줄 — `.github/workflows/daily-nearby-drive.yml` (신규)

```yaml
cron: '5 11 * * *'  # 11:05 UTC = 20:05 KST
```

기존 자리들과 안 겹치는 시각. 그날의 카페·식당·가볼 곳 판정(저녁
18:23·18:56·19:29 KST)이 전부 끝난 뒤라, 그날 새로 `active`가 된 곳도
당일 저녁부터 근처 추천 후보에 반영된다. `data-write` concurrency
그룹을 공유한다(다른 모든 데이터 쓰기 잡과 동일).

## 빌드 시점 통합 — `src/site/nearby-payload.ts` 수정

API 호출은 전혀 없다. `buildNearbyPayloads`에 캐시 배열을 새 입력으로
받아, `nearbyMap`(기존 함수) 안에서 각 top-10 페어를 캐시 조회 후
다음 우선순위로 정렬 기준 값을 정한다:

```typescript
function rankMinutes(anchor: GeoCard, cand: GeoCard, cache: NearbyDrivePair[]): number {
  const hit = lookupPair(cache, anchor.id, cand.id)
  if (hit) return hit.minutes
  // 폴백: 기존 estimateDriveMinutes(src/pipeline/geo.ts, 이미 존재)
  return estimateDriveMinutes(haversineKm(anchor, cand))
}
```

1단계의 `nearestByDomain`(직선거리 top-10 추리기)은 그대로 1차 필터로
쓰고, 그 top-10 안에서만 `rankMinutes` 기준으로 재정렬해 상위 5개를
자른다 — 직선거리 top-10 밖에 있는 곳이 실측 후 더 가까워 보여도
후보에 들어오지는 않는다(K=10 밖은 애초에 안 재므로 값 자체가 없다).
이 트레이드오프는 "합의된 요구사항"에서 이미 사용자가 승인한 부분이다.

`NearbyCard` 출력 타입에 필드 추가:

```typescript
export interface NearbyCard {
  // ...기존 필드(id, name, imageUrl, tags, sigungu, ratingAvg, ratingCount, directionsUrl)
  distanceKm: number            // 유지 — 실측 없을 때 폴백 표시용
  driveMinutes: number | null   // 신규. 캐시 히트 시 실측값, 미스면 null
}
```

`distanceKm`은 그대로 두되(1단계와 하위 호환, 폴백 표시에 필요),
`driveMinutes`가 화면 표시의 우선순위를 갖는다.

## UI — `web/src/app/nearby-card.tsx` 수정

카드 하단 표시 로직만 변경:

```tsx
{item.driveMinutes != null
  ? `차로 ${item.driveMinutes}분`
  : `직선거리 ${item.distanceKm}km`}
```

나머지 레이아웃·클릭 동작·1단계에서 정한 배치(리뷰 섹션 아래,
위시리스트/블랙리스트 토글 없음)는 그대로 유지한다.

## 테스트

- `tests/site/nearby-drive-cache.test.ts`: `pairKeyOf(a,b) === pairKeyOf(b,a)`
  대칭성, `lookupPair` 히트/미스, 빈 캐시 처리.
- `tests/jobs/nearby-drive-times.test.ts`:
  - 캐시에 없는 페어만 API를 호출한다(이미 있는 페어는 스킵).
  - 예산(`opts.budget`)을 넘으면 `budgetExhausted: true`로 멈춘다.
  - 미스 0건이어도 health 성공을 기록한다(classify.ts 회귀 방지와 같은
    패턴의 테스트).
  - 대칭 근사: A→B로 이미 캐시된 페어는 B→A 방향 계산 때 재호출되지
    않는다.
  - 쿼터 연속 3회 실패 시 조기 중단한다.
- `tests/site/nearby-payload.test.ts`(기존 파일에 추가): 캐시 히트 시
  `driveMinutes`가 채워지고 그 값 기준으로 재정렬되는지, 미스면
  `driveMinutes: null`에 `estimateDriveMinutes` 폴백이 쓰이는지.

## 명시적으로 범위 밖

- K(=10)를 넘는 후보까지 실측 대상에 넣는 것 — 직선거리 1차 필터 자체를
  없애는 방향은 이번 스펙에 없다.
- 카드에 "실측"/"추정" 배지 등 값의 출처를 구분해 보여주는 것 — 사용자가
  단순하게 "차로 N분" 아니면 "직선거리"만 보는 걸로 확정했다.
- 코스 짜기(day-course composer), 날씨 연동 등 로드맵의 더 뒤 단계는
  1단계 스펙과 마찬가지로 범위 밖.
