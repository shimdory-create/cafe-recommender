import raw from '../generated/site.json'
import nearbyRaw from '../generated/site-cafe-nearby.json'
import { resolveNearbyCards, type NearbyRelation } from './nearby-resolve'
// 경계를 넘는 import 를 쓰지 않는다 — src/schema.ts 는 web 밖이라 모듈
// 해석이 위로 올라가고, Vercel 은 web 에서만 설치하므로 zod 를 못 찾는다.
// 드리프트는 파이프라인 테스트(types-conformance)가 잡는다.
import type { SiteCafe, SitePayload, SiteVisited } from './site-types'
import type { NearbyCard } from './nearby-types'

export type { SiteCafe, SitePayload, SiteVisited }
// driveLabel/addedLabel 은 payload 를 안 쓰는 순수 함수라 labels.ts 로
// 옮겼다 (식당 쪽이 이 파일 전체를 끌고 들어가지 않도록). 여기서 재수출해서
// 기존에 `@/lib/site` 에서 가져다 쓰던 카페 코드는 그대로 동작한다.
export { driveLabel, addedLabel, postsLabel } from './labels'

/**
 * JSON import 는 값에서 타입을 추론하므로(널이 없으면 non-null, 문자열은
 * string) 스키마 타입에 그대로 대입되지 않는다. 그래서 캐스트를 쓴다 —
 * **런타임 검증은 생성기가 이미 했다** (npm run site 가 zod 로 parse 한 뒤
 * 쓴다). 여기서 또 검증하면 매 빌드마다 페이로드만큼 파싱 비용을 낸다.
 */
export const payload = raw as unknown as SitePayload

/**
 * 목록 화면이 쓰는 필드만 남긴 투영.
 *
 * 전체 리스트는 클라이언트 컴포넌트라 서버가 넘긴 props 가 그대로 브라우저로
 * 내려간다. 전체 페이로드를 넘기면 판정이 다 끝났을 때 1.5MB 가 모바일로
 * 간다 — 주차 근거·후기 원문·체류시간 같은 상세 전용 필드는 목록에 필요 없다.
 * 카드가 근거를 90자에서 자르므로 문자열도 그때 잘라 보낸다.
 */
export type ListRow = Pick<
  SiteCafe,
  'id' | 'name' | 'sigungu' | 'area' | 'driveMinutes' | 'scale' | 'parkingGrade'
  | 'menuLevel' | 'tags' | 'evidence' | 'naverMapUrl' | 'imageUrl' | 'hotScore'
  | 'finalScore' | 'ratingAvg' | 'ratingCount' | 'cityOnly' | 'visitedOn' | 'isNew'
  | 'firstSeenAt' | 'lastSeenAt' | 'posts30' | 'posts90'
>

const CARD_EVIDENCE_CHARS = 90

export function toListRow(c: SiteCafe): ListRow {
  return {
    id: c.id,
    name: c.name,
    sigungu: c.sigungu,
    area: c.area,
    driveMinutes: c.driveMinutes,
    scale: c.scale,
    parkingGrade: c.parkingGrade,
    menuLevel: c.menuLevel,
    tags: c.tags,
    evidence: c.evidence.length > CARD_EVIDENCE_CHARS
      ? c.evidence.slice(0, CARD_EVIDENCE_CHARS) + '…'
      : c.evidence,
    naverMapUrl: c.naverMapUrl,
    imageUrl: c.imageUrl,
    hotScore: c.hotScore,
    finalScore: c.finalScore,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    cityOnly: c.cityOnly,
    visitedOn: c.visitedOn,
    isNew: c.isNew,
    firstSeenAt: c.firstSeenAt,
    lastSeenAt: c.lastSeenAt,
    posts30: c.posts30,
    posts90: c.posts90,
  }
}

export const byId = (id: string): SiteCafe | undefined =>
  payload.cafes.find((c) => c.id === id)

export type { NearbyCard }

const cafeNearby = nearbyRaw as unknown as Record<string, { restaurants: NearbyRelation[]; spots: NearbyRelation[] }>

export function nearbyForCafe(id: string) {
  const raw = cafeNearby[id]
  if (!raw) return undefined
  return {
    restaurants: resolveNearbyCards('cafe', id, 'restaurant', raw.restaurants),
    spots: resolveNearbyCards('cafe', id, 'spot', raw.spots),
  }
}

/**
 * 홈 피드. 이번 주 추천을 앞에 두고 나머지를 종합점수 순으로 잇는다.
 *
 * 추천 10곳 안에서 못 고르면 다음 10곳으로 넘어갈 수 있어야 한다 —
 * 4인 가족이 취향을 맞추려면 폭이 필요하다. 그래서 "3곳 + 끝" 이 아니라
 * 끊기지 않는 피드로 만든다.
 */
export function homeFeed(now = new Date()): SiteCafe[] {
  // 다녀온 곳은 6개월간 추천에서 내려간다 (스펙 8.2). 점수를 깎는 것으로는
  // 목록에 계속 남아 "또 거기?" 가 되므로 아예 뺀다. 전체 리스트에서는
  // 계속 찾을 수 있다.
  const fresh = (c: SiteCafe) => !c.cityOnly && !recentlyVisited(c.visitedOn, now)
  const ranked = payload.week
    .map((w) => byId(w.id))
    .filter((c): c is SiteCafe => c !== undefined && fresh(c))
  const seen = new Set(ranked.map((c) => c.id))
  const rest = payload.cafes.filter((c) => fresh(c) && !seen.has(c.id))
  // payload.cafes 는 이미 종합점수 내림차순이다
  return [...ranked, ...rest]
}

export const MENU_LABEL: Record<number, string> = {
  1: '음료 위주',
  2: '빵·디저트',
  3: '식사 가능',
}

export const PARKING_LABEL: Record<string, string> = {
  A: '주차 넉넉',
  B: '주차 보통',
  C: '주차 어려움',
  D: '주차 불가',
  '?': '주차 미확인',
}

export const ALL_TAGS = [
  '대형베이커리', '대형카페', '브런치카페', '뷰맛집',
  '정원마당형', '창고형', '전시복합문화', '디저트특화',
] as const

/**
 * 다녀온 곳을 추천에서 내리는 기간.
 *
 * **파이프라인이 정한 값을 그대로 쓴다** (`src/pipeline/revisit.ts`). 여기에
 * 숫자를 적어 두면 두 곳이 갈라져 "카톡에는 있는데 눌러보면 없는" 상태가
 * 된다 — 실제로 한 번 그랬다.
 */
export const REVISIT_DAYS = payload.stats.revisitDays

/** 방문 후 재방문 기간이 지나지 않았는가 (카드 배지용) */
export function recentlyVisited(visitedOn: string | null, now = new Date()): boolean {
  if (!visitedOn) return false
  const days = (now.getTime() - new Date(visitedOn).getTime()) / 86_400_000
  return days >= 0 && days <= REVISIT_DAYS
}

/**
 * liveness 잡이 기준일보다 오래 못 본 카페인가 (폐업 의심 배지용).
 *
 * 파이프라인의 `staleCafes` (`src/jobs/liveness.ts`) 와 같은 규칙이다 —
 * 값을 여기 새로 적지 않고 `payload.stats.staleDays` 를 그대로 쓴다.
 */
export const STALE_DAYS = payload.stats.staleDays

export function isStale(lastSeenAt: string | null, now = new Date()): boolean {
  if (!lastSeenAt) return false
  const days = (now.getTime() - new Date(lastSeenAt).getTime()) / 86_400_000
  return days > STALE_DAYS
}

/**
 * 실시간 방문 기록에서 **아직 추천에서 내려가 있어야 할** 카페 id 만 고른다.
 *
 * 홈 피드가 이것으로 거른다. 날짜를 안 보고 "기록이 있으면 제외" 로 두었더니
 * 페이로드(`recentlyVisited` 로 거름)와 기준이 갈렸다 — 재방문 기간이 지난
 * 곳이 영영 안 올라온다. 기록이 전부 이번 달이라 증상이 없었을 뿐이다.
 */
export function hiddenByVisit(
  visits: { kakaoPlaceId: string; visitedOn: string }[],
  now = new Date(),
): Set<string> {
  return new Set(
    visits.filter((v) => recentlyVisited(v.visitedOn, now)).map((v) => v.kakaoPlaceId),
  )
}
