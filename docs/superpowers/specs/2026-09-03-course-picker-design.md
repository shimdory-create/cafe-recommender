# 코스 추천 (오늘 코스) 설계

## 배경

[근처 추천 기능](2026-09-03-anchor-nearby-recommendations-design.md)이 병합·배포되어
가족이 쓰고 있고 반응이 좋다. 로드맵의 다음 단계인 "여러 도메인을 엮어서 하나의
나들이로 추천"을 이 근처 추천 데이터를 재활용해 가볍게 얹는다.

## 목표

카페/식당/가볼 곳 상세 페이지 어디서 보든, "지금 보는 곳 + 근처 식당 1곳 +
근처 가볼 곳 1곳"(또는 도메인에 맞게 카페+가볼 곳, 카페+식당) 조합을 자동으로
보여준다. 식당·가볼 곳 각각에 "다음 OO 보기" 버튼이 있어서, 마음에 드는 조합이
나올 때까지 두 후보를 독립적으로 넘겨볼 수 있다.

## 비목표 (1단계에서 안 하는 것)

- **직접 담기(수동 큐레이션)**: 근처 카드에 "코스에 담기" 버튼을 붙여 가족이
  직접 조합을 고르는 방식은 하지 않는다. 새로운 저장 상태(코스 장바구니)가
  필요해지고, 이미 위시리스트·블랙리스트·다녀온 곳 3개 리스트가 있어 개념이
  늘어난다. 자동 조합 + 순환으로 먼저 검증하고, 필요해지면 나중에 얹는다.
- **다중 경유지 길찾기**: "카페→식당→가볼 곳"을 한 번에 잇는 단일 경로 링크는
  만들지 않는다. 기존 anchor→destination 두 지점 링크(이미 검증된 형식)를
  식당 카드·가볼 곳 카드 각각에 그대로 쓴다.
- **코스 저장/공유**: 순환 인덱스는 컴포넌트 상태일 뿐이다. 새로고침하면
  1번 조합으로 리셋된다. 서버에 저장하거나 링크로 공유하는 기능은 없다.
- **처음부터 만드는 코스 생성기**(지역/조건만 주고 전체 코스를 새로 짜는 것)는
  이 스펙의 범위 밖이다. 이번 스펙은 반드시 상세 페이지의 앵커 하나에서
  출발한다.
- **가볼 곳↔가볼 곳처럼 같은 도메인끼리의 조합**은 다루지 않는다. 근처 추천이
  원래 "자기 도메인 제외 나머지 두 도메인"으로 설계돼 있으므로 코스도 그대로
  따른다.

## 데이터 흐름

새 백엔드 계산이나 새 생성 파일이 없다. 세 도메인의 상세 페이지(`nearby-sections.tsx`)가
이미 블랙리스트·다녀온 곳 숨김 항목을 뺀 근처 카페/식당/가볼 곳 배열을 들고
있다 — 코스 섹션은 그 배열을 그대로 받아, 그 안에서 순환 인덱스로 카드 하나를
고른다.

```
site-{domain}-nearby.json (빌드 타임 생성, 기존)
  → nearby-sections.tsx: 블랙리스트/다녀온 곳으로 필터링 (기존)
    → CourseSection: 필터링된 배열 + 순환 인덱스로 카드 1장 선택 (신규, 클라이언트 상태만)
```

## 컴포넌트 구조

기존 `web/src/app/nearby-card.tsx`가 "카드 하나 그리기"와 "가로 스크롤 목록"을
`NearbySection`으로 함께 내보내던 것을, 카드 렌더링 부분을 재사용 가능하게
분리한다. 그리고 "배열 + 인덱스 → 보여줄 카드 하나(또는 없음)"를 고르는 로직은
**순수 함수로 뽑아서 별도 테스트한다** — 이 프로젝트는 `.test.tsx`/컴포넌트
테스트 인프라(`@testing-library/react` 등)가 전혀 없고 전부 순수 함수를
co-located `.test.ts`로 테스트하는 방식이라(`nearby-filter.ts` 참고), 새
테스트 프레임워크를 들이는 대신 그 관례를 따른다.

- `web/src/app/nearby-card.tsx`: 내부 `NearbyCard` 함수를 **export**하도록
  바꾼다 (지금은 파일 내부 전용). `NearbySection`은 그대로 유지.
- `web/src/lib/course-cycle.ts` (신규): 순수 함수 `pickCourseItem`.
- `web/src/app/course-section.tsx` (신규, 공용): `pickCourseItem` + `NearbyCard`를
  써서 카드 1장 + "다음 {라벨} 보기" 버튼을 그린다. 이 파일 자체는 조건부
  렌더링뿐이라 별도 테스트를 붙이지 않는다(`NearbySection`도 그렇다).

```typescript
// web/src/lib/course-cycle.ts
import type { NearbyCard } from './nearby-types'

/** 배열과(모듈로 순환하는) 인덱스로 보여줄 카드 하나를 고른다. 배열이 비어있으면 null. */
export function pickCourseItem(items: NearbyCard[], index: number): NearbyCard | null {
  if (items.length === 0) return null
  return items[index % items.length]!
}
```

```typescript
// web/src/app/course-section.tsx
import { pickCourseItem } from '@/lib/course-cycle'
import { NearbyCard } from './nearby-card'
import type { NearbyCard as NearbyCardData } from '@/lib/nearby-types'

export function CourseSection(
  { items, hrefPrefix, icon, label, index, onNext }: {
    items: NearbyCardData[]
    hrefPrefix: string
    icon: string
    /** 버튼 문구에 쓰는 이름 — "식당", "가볼 곳", "카페" */
    label: string
    index: number
    onNext: () => void
  },
) {
  const item = pickCourseItem(items, index)
  if (!item) return null
  return (
    <div className="flex flex-col gap-2">
      <NearbyCard item={item} href={`${hrefPrefix}${item.id}`} icon={icon} />
      {items.length > 1 && (
        <button
          type="button"
          onClick={onNext}
          className="text-[12px] font-semibold text-bean"
        >
          다음 {label} 보기 →
        </button>
      )}
    </div>
  )
}
```

각 도메인의 `nearby-sections.tsx`가 순환 인덱스(useState)를 들고 있다가
`CourseSection` 두 개(예: 카페 페이지라면 식당 1장 + 가볼 곳 1장)를 위에,
기존 `NearbySection` 두 개(근처 식당·근처 가볼 곳 전체 목록)를 아래에 그린다.
세 파일(`cafe/[id]/nearby-sections.tsx`, `restaurant/[id]/nearby-sections.tsx`,
`spot/[id]/nearby-sections.tsx`)이 각자의 인덱스 상태와 두 `CourseSection`
호출을 추가하는 동일한 모양의 변경이다.

```typescript
// web/src/app/cafe/[id]/nearby-sections.tsx (변경 후 형태)
export function CafeNearbySections({ restaurants, spots }: {...}) {
  const [restIdx, setRestIdx] = useState(0)
  const [spotIdx, setSpotIdx] = useState(0)
  // ...기존 필터링(restHidden, spotHidden)은 그대로...
  const filteredRest = filterOutHidden(restaurants, restHidden)
  const filteredSpots = filterOutHidden(spots, spotHidden)

  return (
    <>
      {filteredRest.length > 0 && filteredSpots.length > 0 && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">오늘 코스</h2>
          <div className="mt-2 flex gap-3">
            <CourseSection
              items={filteredRest} hrefPrefix="/restaurant/" icon="🍚" label="식당"
              index={restIdx} onNext={() => setRestIdx((i) => i + 1)}
            />
            <CourseSection
              items={filteredSpots} hrefPrefix="/spot/" icon="🏞️" label="가볼 곳"
              index={spotIdx} onNext={() => setSpotIdx((i) => i + 1)}
            />
          </div>
        </section>
      )}
      <NearbySection title="근처 식당" items={filteredRest} hrefPrefix="/restaurant/" icon="🍚" />
      <NearbySection title="근처 가볼 곳" items={filteredSpots} hrefPrefix="/spot/" icon="🏞️" />
    </>
  )
}
```

(`onNext`는 인덱스를 그냥 1씩 증가시킨다 — `CourseSection` 내부에서
`index % items.length`로 순환시키므로 컴포넌트 쪽은 modulo를 몰라도 된다.
정수 오버플로는 실질적으로 걱정할 필요 없다 — 버튼을 수십억 번 눌러야
JS 정수 한계에 닿는다.)

## 엣지 케이스

- **필터링 후 한쪽 도메인이라도 0개**: "오늘 코스" 섹션 전체를 숨긴다(코스가
  성립하려면 두 도메인 다 있어야 함). 기존 "근처 X" 목록은 각자 독립적으로
  0개면 그 섹션만 숨는 기존 동작(`NearbySection`이 이미 그렇게 함) 그대로 둔다.
- **필터링 후 후보가 1개뿐인 도메인**: "다음 {라벨} 보기" 버튼을 숨긴다(순환할
  대상이 없음). 카드 자체는 그대로 보여준다.
- **필터링 후 후보가 여러 개**: 마지막 후보에서 "다음"을 누르면 첫 후보로
  돌아간다(모듈로 순환).
- **블랙리스트/다녀온 곳 처리 중 순환 도중 후보가 사라지는 경우**(예: 코스로
  보고 있던 식당을 다른 탭에서 블랙리스트에 넣고 돌아온 경우): 필터링된 배열
  길이가 줄어들 수 있으므로 인덱스가 배열 길이를 넘을 수 있다 —
  `index % items.length`로 이미 방어되어 있어 별도 처리가 필요 없다.

## 테스트

- `pickCourseItem`을 `web/src/lib/course-cycle.test.ts`로 테스트한다: 빈
  배열이면 null, 인덱스가 배열 길이 안이면 그 카드, 인덱스가 배열 길이를
  넘으면(모듈로 순환) 올바른 카드, 인덱스 0이면 첫 카드.
- `CourseSection`·각 도메인 `nearby-sections.tsx`는 조건부 렌더링(JSX)뿐이라
  컴포넌트 테스트 없이 둔다 — `NearbySection`도 지금까지 그래 왔다. 대신
  실제 배포 후 브라우저로 3도메인 각각 코스 섹션이 뜨는지, "다음" 버튼이
  실제로 카드를 바꾸는지, 후보 1개/0개 케이스를 눈으로 확인한다(이 프로젝트
  전체에 컴포넌트 테스트 인프라가 없으므로 다른 UI 조건부 렌더링과 동일한
  검증 수준).

## 영향받는 파일

- 수정: `web/src/app/nearby-card.tsx` (`NearbyCard` export 추가)
- 신규: `web/src/lib/course-cycle.ts`
- 신규: `web/src/lib/course-cycle.test.ts`
- 신규: `web/src/app/course-section.tsx`
- 수정: `web/src/app/cafe/[id]/nearby-sections.tsx`
- 수정: `web/src/app/restaurant/[id]/nearby-sections.tsx`
- 수정: `web/src/app/spot/[id]/nearby-sections.tsx`
