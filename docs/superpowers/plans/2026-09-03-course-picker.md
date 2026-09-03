# 코스 추천 (오늘 코스) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카페/식당/가볼 곳 상세 페이지에 앵커 + 근처 두 도메인 자동 조합("오늘 코스")을 보여주고, 각 도메인마다 독립적으로 "다음 보기" 버튼으로 순환할 수 있게 한다.

**Architecture:** 새 백엔드 계산·새 생성 파일이 전혀 없다. 이미 각 상세 페이지가 들고 있는(블랙리스트·다녀온 곳으로 걸러진) 근처 카페/식당/가볼 곳 배열을 그대로 재사용해, 클라이언트 컴포넌트 안에서 순환 인덱스(`useState`)로 카드 하나씩 골라 보여준다. 서버 저장 없음 — 새로고침하면 1번 조합으로 리셋.

**Tech Stack:** TypeScript, Next.js 클라이언트 컴포넌트(`useState`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-course-picker-design.md`

## Global Constraints

- 수동 큐레이션("코스에 담기" 버튼)은 만들지 않는다 — 자동 조합 + 순환뿐이다.
- 다중 경유지 길찾기 링크는 만들지 않는다 — 기존 `NaverMapLink`/`directionsUrl`(앵커→목적지 1쌍)을 그대로 재사용한다.
- 코스 순환 인덱스는 서버에 저장하지 않는다 — 컴포넌트 상태(`useState`)뿐이다.
- 필터링(블랙리스트·다녀온 곳) 후 두 도메인 중 하나라도 후보가 0개면 "오늘 코스" 섹션 자체를 숨긴다.
- 필터링 후 후보가 1개뿐인 도메인은 "다음 보기" 버튼을 숨긴다.
- 이 프로젝트의 `web/` 패키지엔 컴포넌트 테스트 인프라(`@testing-library/react`, jsdom)가 전혀 없다 — 새로 들이지 않는다. 테스트가 필요한 로직은 순수 함수로 뽑아 `.test.ts`로 검증한다(기존 `nearby-filter.ts`/`nearby-filter.test.ts` 관례).

---

### Task 1: 코스 카드 선택 순수 함수

**Files:**
- Create: `web/src/lib/course-cycle.ts`
- Test: `web/src/lib/course-cycle.test.ts`

**Interfaces:**
- Consumes: `NearbyCard` type from `./nearby-types` (이미 존재, `directionsUrl` 필드 포함)
- Produces: `pickCourseItem(items: NearbyCard[], index: number): NearbyCard | null`

- [ ] **Step 1: Write the failing test**

```typescript
// web/src/lib/course-cycle.test.ts
import { describe, it, expect } from 'vitest'
import { pickCourseItem } from './course-cycle'
import type { NearbyCard } from './nearby-types'

function card(id: string): NearbyCard {
  return {
    id, name: id, imageUrl: null, tags: [], sigungu: '', ratingAvg: 0,
    ratingCount: 0, distanceKm: 1, directionsUrl: 'https://map.naver.com/p/directions/x',
  }
}

describe('pickCourseItem', () => {
  it('빈 배열이면 null', () => {
    expect(pickCourseItem([], 0)).toBeNull()
  })

  it('인덱스가 배열 길이 안이면 그 자리의 카드', () => {
    const items = [card('a'), card('b'), card('c')]
    expect(pickCourseItem(items, 0)).toEqual(card('a'))
    expect(pickCourseItem(items, 1)).toEqual(card('b'))
  })

  it('인덱스가 배열 길이를 넘으면 모듈로 순환한다', () => {
    const items = [card('a'), card('b'), card('c')]
    expect(pickCourseItem(items, 3)).toEqual(card('a'))
    expect(pickCourseItem(items, 4)).toEqual(card('b'))
    expect(pickCourseItem(items, 100)).toEqual(card('b')) // 100 % 3 === 1
  })

  it('배열이 1개뿐이면 인덱스와 상관없이 그 카드', () => {
    const items = [card('only')]
    expect(pickCourseItem(items, 0)).toEqual(card('only'))
    expect(pickCourseItem(items, 5)).toEqual(card('only'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/course-cycle.test.ts`
Expected: FAIL — `Cannot find module './course-cycle'`

- [ ] **Step 3: Write the implementation**

```typescript
// web/src/lib/course-cycle.ts
import type { NearbyCard } from './nearby-types'

/** 배열과 (모듈로 순환하는) 인덱스로 코스에 보여줄 카드 하나를 고른다. 배열이 비어있으면 null. */
export function pickCourseItem(items: NearbyCard[], index: number): NearbyCard | null {
  if (items.length === 0) return null
  return items[index % items.length]!
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/course-cycle.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/course-cycle.ts web/src/lib/course-cycle.test.ts
git commit -m "feat(course): 코스 카드 순환 선택 순수 함수"
```

---

### Task 2: `NearbyCard` export + `CourseSection` 컴포넌트

**Files:**
- Modify: `web/src/app/nearby-card.tsx`
- Create: `web/src/app/course-section.tsx`

**Interfaces:**
- Consumes: `pickCourseItem` from `@/lib/course-cycle` (Task 1), `NearbyCard` (컴포넌트, export 추가) from `./nearby-card`, `NearbyCard` (타입) from `@/lib/nearby-types`
- Produces: `CourseSection({ items, hrefPrefix, icon, label, index, onNext }): JSX.Element | null`

**이 태스크엔 컴포넌트 유닛 테스트가 없다.** `web/` 패키지엔 React 컴포넌트를
렌더링하는 테스트 인프라가 없다 — 기존 `NearbySection`/카드 컴포넌트 전부
같은 관례(테스트 없음, 실측 브라우저 확인으로 검증)를 따른다.

- [ ] **Step 1: `nearby-card.tsx`에서 `NearbyCard` 함수를 export**

`web/src/app/nearby-card.tsx` 7번째 줄:

```typescript
function NearbyCard({ item, href, icon }: { item: NearbyCardData; href: string; icon: string }) {
```

를 다음으로 바꾼다(딱 `export` 하나 추가, 나머지 본문은 그대로):

```typescript
export function NearbyCard({ item, href, icon }: { item: NearbyCardData; href: string; icon: string }) {
```

- [ ] **Step 2: `course-section.tsx` 작성**

```typescript
// web/src/app/course-section.tsx
import { pickCourseItem } from '@/lib/course-cycle'
import type { NearbyCard as NearbyCardData } from '@/lib/nearby-types'
import { NearbyCard } from './nearby-card'

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

- [ ] **Step 3: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add web/src/app/nearby-card.tsx web/src/app/course-section.tsx
git commit -m "feat(course): NearbyCard export + 코스 카드·다음 버튼 컴포넌트"
```

---

### Task 3: 세 도메인 상세 페이지에 "오늘 코스" 섹션 배치

**Files:**
- Modify: `web/src/app/cafe/[id]/nearby-sections.tsx`
- Modify: `web/src/app/restaurant/[id]/nearby-sections.tsx`
- Modify: `web/src/app/spot/[id]/nearby-sections.tsx`

**Interfaces:**
- Consumes: `CourseSection` from `../../course-section` (Task 2), `filterOutHidden` from `@/lib/nearby-filter`(이미 존재), 각 파일이 이미 쓰던 블랙리스트/다녀온 곳 훅 그대로
- 세 파일 다 완전히 같은 모양의 변경 — 도메인 이름과 아이콘만 다르다. 하나의
  구현자가 세 파일을 한 번에 처리한다(리뷰도 한 번에).

각 파일의 **현재 전체 내용**은 아래와 같고(이 계획 작성 시점 기준), 전체를
아래 **변경 후 내용**으로 통째로 교체한다.

- [ ] **Step 1: `web/src/app/cafe/[id]/nearby-sections.tsx` 현재 내용 확인**

```typescript
'use client'

import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

export function CafeNearbySections(
  { restaurants, spots }: { restaurants: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const restHidden = new Set([...restBlacklisted, ...restDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])

  return (
    <>
      <NearbySection
        title="근처 식당"
        items={filterOutHidden(restaurants, restHidden)}
        hrefPrefix="/restaurant/"
        icon="🍚"
      />
      <NearbySection
        title="근처 가볼 곳"
        items={filterOutHidden(spots, spotHidden)}
        hrefPrefix="/spot/"
        icon="🏞️"
      />
    </>
  )
}
```

- [ ] **Step 2: 위 파일 전체를 아래로 교체**

```typescript
'use client'

import { useState } from 'react'
import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'
import { CourseSection } from '../../course-section'

export function CafeNearbySections(
  { restaurants, spots }: { restaurants: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const restHidden = new Set([...restBlacklisted, ...restDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])
  const filteredRest = filterOutHidden(restaurants, restHidden)
  const filteredSpots = filterOutHidden(spots, spotHidden)

  const [restIdx, setRestIdx] = useState(0)
  const [spotIdx, setSpotIdx] = useState(0)

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
      <NearbySection
        title="근처 식당"
        items={filteredRest}
        hrefPrefix="/restaurant/"
        icon="🍚"
      />
      <NearbySection
        title="근처 가볼 곳"
        items={filteredSpots}
        hrefPrefix="/spot/"
        icon="🏞️"
      />
    </>
  )
}
```

- [ ] **Step 3: `web/src/app/restaurant/[id]/nearby-sections.tsx` 현재 내용 확인**

```typescript
'use client'

import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

export function RestaurantNearbySections(
  { cafes, spots }: { cafes: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])

  return (
    <>
      <NearbySection title="근처 카페" items={filterOutHidden(cafes, cafeHidden)} hrefPrefix="/cafe/" icon="☕" />
      <NearbySection title="근처 가볼 곳" items={filterOutHidden(spots, spotHidden)} hrefPrefix="/spot/" icon="🏞️" />
    </>
  )
}
```

- [ ] **Step 4: 위 파일 전체를 아래로 교체**

```typescript
'use client'

import { useState } from 'react'
import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useSpotBlacklist } from '@/lib/use-spot-blacklist'
import { useSpotDismissed } from '@/lib/use-spot-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'
import { CourseSection } from '../../course-section'

export function RestaurantNearbySections(
  { cafes, spots }: { cafes: NearbyCard[]; spots: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: spotBlacklisted } = useSpotBlacklist()
  const { dismissed: spotDismissed } = useSpotDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const spotHidden = new Set([...spotBlacklisted, ...spotDismissed])
  const filteredCafes = filterOutHidden(cafes, cafeHidden)
  const filteredSpots = filterOutHidden(spots, spotHidden)

  const [cafeIdx, setCafeIdx] = useState(0)
  const [spotIdx, setSpotIdx] = useState(0)

  return (
    <>
      {filteredCafes.length > 0 && filteredSpots.length > 0 && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">오늘 코스</h2>
          <div className="mt-2 flex gap-3">
            <CourseSection
              items={filteredCafes} hrefPrefix="/cafe/" icon="☕" label="카페"
              index={cafeIdx} onNext={() => setCafeIdx((i) => i + 1)}
            />
            <CourseSection
              items={filteredSpots} hrefPrefix="/spot/" icon="🏞️" label="가볼 곳"
              index={spotIdx} onNext={() => setSpotIdx((i) => i + 1)}
            />
          </div>
        </section>
      )}
      <NearbySection title="근처 카페" items={filteredCafes} hrefPrefix="/cafe/" icon="☕" />
      <NearbySection title="근처 가볼 곳" items={filteredSpots} hrefPrefix="/spot/" icon="🏞️" />
    </>
  )
}
```

- [ ] **Step 5: `web/src/app/spot/[id]/nearby-sections.tsx` 현재 내용 확인**

```typescript
'use client'

import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'

export function SpotNearbySections(
  { cafes, restaurants }: { cafes: NearbyCard[]; restaurants: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const restHidden = new Set([...restBlacklisted, ...restDismissed])

  return (
    <>
      <NearbySection title="근처 카페" items={filterOutHidden(cafes, cafeHidden)} hrefPrefix="/cafe/" icon="☕" />
      <NearbySection title="근처 식당" items={filterOutHidden(restaurants, restHidden)} hrefPrefix="/restaurant/" icon="🍚" />
    </>
  )
}
```

- [ ] **Step 6: 위 파일 전체를 아래로 교체**

```typescript
'use client'

import { useState } from 'react'
import { useBlacklist } from '@/lib/use-blacklist'
import { useDismissed } from '@/lib/use-dismissed'
import { useRestaurantBlacklist } from '@/lib/use-restaurant-blacklist'
import { useRestaurantDismissed } from '@/lib/use-restaurant-dismissed'
import { filterOutHidden } from '@/lib/nearby-filter'
import type { NearbyCard } from '@/lib/nearby-types'
import { NearbySection } from '../../nearby-card'
import { CourseSection } from '../../course-section'

export function SpotNearbySections(
  { cafes, restaurants }: { cafes: NearbyCard[]; restaurants: NearbyCard[] },
) {
  const { blacklisted: cafeBlacklisted } = useBlacklist()
  const { dismissed: cafeDismissed } = useDismissed()
  const { blacklisted: restBlacklisted } = useRestaurantBlacklist()
  const { dismissed: restDismissed } = useRestaurantDismissed()

  const cafeHidden = new Set([...cafeBlacklisted, ...cafeDismissed])
  const restHidden = new Set([...restBlacklisted, ...restDismissed])
  const filteredCafes = filterOutHidden(cafes, cafeHidden)
  const filteredRest = filterOutHidden(restaurants, restHidden)

  const [cafeIdx, setCafeIdx] = useState(0)
  const [restIdx, setRestIdx] = useState(0)

  return (
    <>
      {filteredCafes.length > 0 && filteredRest.length > 0 && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">오늘 코스</h2>
          <div className="mt-2 flex gap-3">
            <CourseSection
              items={filteredCafes} hrefPrefix="/cafe/" icon="☕" label="카페"
              index={cafeIdx} onNext={() => setCafeIdx((i) => i + 1)}
            />
            <CourseSection
              items={filteredRest} hrefPrefix="/restaurant/" icon="🍚" label="식당"
              index={restIdx} onNext={() => setRestIdx((i) => i + 1)}
            />
          </div>
        </section>
      )}
      <NearbySection title="근처 카페" items={filteredCafes} hrefPrefix="/cafe/" icon="☕" />
      <NearbySection title="근처 식당" items={filteredRest} hrefPrefix="/restaurant/" icon="🍚" />
    </>
  )
}
```

- [ ] **Step 7: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 8: 웹 전체 테스트**

Run: `cd web && npm test`
Expected: 기존 테스트 전부 PASS (이 태스크는 새 유닛 테스트를 추가하지 않는다 — JSX 조건부 렌더링뿐이라 Task 1의 `pickCourseItem` 테스트가 핵심 로직을 이미 커버한다)

- [ ] **Step 9: Commit**

```bash
git add web/src/app/cafe/[id]/nearby-sections.tsx web/src/app/restaurant/[id]/nearby-sections.tsx web/src/app/spot/[id]/nearby-sections.tsx
git commit -m "feat(course): 카페·식당·가볼 곳 상세 페이지에 오늘 코스 섹션 배치"
```

---

### Task 4: 빌드 + 실측 검증

**Files:** 없음(검증 전용 태스크)

**Interfaces:**
- Consumes: Task 1~3 전부

- [ ] **Step 1: 루트 + 웹 전체 테스트, 타입 검사**

Run: `npm test && npx tsc --noEmit && cd web && npm test && npx tsc --noEmit`
Expected: 전부 통과

- [ ] **Step 2: 웹 프로덕션 빌드**

Run: `cd web && npm run build`
Expected: 빌드 성공(카페/식당/가볼 곳 상세 페이지 전부 정적 생성됨). 이
워크트리 환경에서는 `preview_start`가 워크트리가 아니라 메인 체크아웃을
보므로, 로컬 프리뷰로 검증하지 말고 다음 스텝처럼 실제 배포 후 확인한다.

- [ ] **Step 3: master로 푸시**

이 프로젝트는 이 규모의 기능은 PR 없이 직접 master로 푸시해 온 관례다
(anchor-nearby-recommendations 이후 계속). `git fetch origin`으로 최신 확인 후:

```bash
git push origin <현재 브랜치>:master
```

- [ ] **Step 4: 배포 확인 + 브라우저로 실제 렌더링 확인**

Vercel 배포가 끝나길 기다린 후(`curl`로 폴링), 배포 URL의 카페 상세
페이지 하나, 식당 상세 페이지 하나, 가볼 곳 상세 페이지 하나에 브라우저로
접속해 확인한다:
- "오늘 코스" 섹션이 "근처 X" 목록들 위에 뜨는가
- 두 카드(예: 카페 페이지라면 식당 카드 + 가볼 곳 카드) 각각에 "다음 OO
  보기" 버튼이 있는가
- "다음 식당 보기"를 누르면 식당 카드만 바뀌고 가볼 곳 카드는 그대로인가
  (반대도 마찬가지)
- 각 코스 카드의 "차로 길찾기" 버튼이 기존과 같은 형식의 링크를 갖고
  있는가(앵커→그 카드, `/-/car` 포함)
- 근처 후보가 적은 앵커(예: 가볼 곳처럼 전체 수가 적은 도메인)에서 "다음"
  버튼이 후보 1개일 때 안 뜨는지, 후보 0개인 도메인이 있을 때 "오늘 코스"
  섹션 자체가 안 뜨는지
- 콘솔 에러가 없는가

- [ ] **Step 5: 발견된 문제가 있으면 수정 후 재확인, 없으면 완료 보고**
