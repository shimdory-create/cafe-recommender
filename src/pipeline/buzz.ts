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

/** 월 300건을 넘으면 카페 한 곳의 글이 아닐 가능성이 높다 (실측: 수목원 634) */
const AMBIGUOUS_RATE_THRESHOLD = 300

/**
 * Layer 2 화제량 산출.
 *
 * total_count 를 쓰지 않는다. 다음 검색의 집계는 OR 매칭이라 존재하지
 * 않는 카페도 수백~수천 건을 받고, 검색어 희소성에 따라 20배씩 흔들려
 * 임계값을 걸 수 없다 (실측). 대신 문서를 직접 검증한다.
 */
export function computeBuzz(input: {
  docs: BlogDoc[]
  cafeName: string
  now: Date
}): BuzzMetrics {
  const { docs, cafeName, now } = input
  const relevant = docs.filter((d) => isRelevant(d, cafeName))
  const times = relevant.map((d) => d.dateTime.getTime()).sort((a, b) => b - a)
  const t = now.getTime()

  const newest = times[0]
  const oldest = times[times.length - 1]
  const spanDays = times.length > 1 ? (newest! - oldest!) / DAY : 0
  const postsPer30 =
    times.length === 0 ? 0 : spanDays > 0 ? (times.length * 30) / spanDays : times.length

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
    firstPostDate: oldest === undefined ? null : iso(oldest),
    latestPostDate: newest === undefined ? null : iso(newest),
    acceleration: Number(acceleration.toFixed(4)),
    suspectAmbiguous: postsPer30 > AMBIGUOUS_RATE_THRESHOLD,
  }
}

/**
 * 카드에 붙일 대표 이미지를 고른다.
 *
 * **관련성 판정을 통과한 문서에서만 고른다.** 엉뚱한 사진 한 장은 텍스트
 * 오류보다 신뢰를 더 깎는다 — 상호명과 카페 문맥어가 함께 있는 글에
 * 올라온 사진이어야 그 카페 사진일 확률이 높다.
 *
 * 카카오 썸네일은 130x130 정사각이다. 카드 상단의 큰 사진으로 늘리면
 * 뭉개지므로 상호명 옆 작은 정사각으로만 쓴다 (스펙 10.4).
 */
export function pickThumbnail(input: { docs: BlogDoc[]; cafeName: string }): string {
  for (const d of input.docs) {
    if (!d.thumbnail) continue
    if (!isRelevant(d, input.cafeName)) continue
    return d.thumbnail
  }
  return ''
}

export interface Layer2Options {
  now: Date
  minPrecision?: number
  minPostsPer30?: number
  newOpeningDays?: number
  /** 집에서의 이동시간. 가까우면 화제량 컷을 낮춘다 (아래 minPostsFor) */
  driveMinutes?: number | null
}

/**
 * 거리별 화제량 컷.
 *
 * 컷을 절대값 하나(월 8건)로 두었더니 **집 근처가 집중적으로 잘려 나갔다.**
 * 실측: 화제량 부족으로 배제된 179곳 중 **123곳(69%)이 40분 이내**였다.
 * 가족 의견 "송도와 영종도 카페가 너무 없다" 의 실제 원인이 이것이다.
 *
 * 블로그 글은 **멀리 나들이 간 곳**에 쓰인다. 집에서 25분 거리 카페는 글감이
 * 되지 않아 월 3~7건에 머무는데, 그렇다고 안 갈 곳이 아니다. 오히려 가장
 * 자주 가는 곳이다.
 *
 * 월 8건이라는 기준이 실제로 묻고 있던 것은 **"한 시간 넘게 운전할 만큼
 * 뜨거운가"** 다. 25분 거리에는 그만한 근거를 요구할 이유가 없다.
 *
 * 품질은 뒤쪽 게이트가 지킨다 — 동네 카페 판별은 화제량이 아니라 **성격 태그
 * 0개**가 한다 (스펙 7절). 여기서 통과해도 태그가 없으면 목록에 못 오른다.
 * 이 컷의 실질 역할은 LLM 호출 비용 절약이다.
 *
 * 경계값은 스펙의 거리 감쇠 기준을 따른다 — 70분이 e^-1 지점이고, 40분은
 * "가볍게 다녀오는" 거리다.
 */
export function minPostsFor(driveMinutes: number | null | undefined, base = 8): number {
  const m = driveMinutes ?? Number.POSITIVE_INFINITY
  if (m <= 40) return base * 0.5
  if (m <= 70) return base * 0.75
  return base
}

export type Layer2Input = Pick<BuzzMetrics, 'precision' | 'postsPer30' | 'firstPostDate'>

/**
 * Layer 2 컷. 초기값은 스펙 v3 기준이며 13.1절 골든셋으로 보정한다.
 * 실측 기준값: 테라로사 96%/월86, 더티트렁크 86%/월69, 없는카페 0%/월0.
 */
export function passesLayer2(
  m: Layer2Input,
  opts: Layer2Options,
): { pass: boolean; reason?: string } {
  const { now, minPrecision = 0.3, minPostsPer30 = 8, newOpeningDays = 180 } = opts
  const postsCut = minPostsFor(opts.driveMinutes, minPostsPer30)

  // 정밀도는 신규 오픈에도 면제하지 않는다. 실존하지 않는 카페를
  // "신규"로 통과시켜서는 안 된다.
  if (m.precision < minPrecision) {
    return {
      pass: false,
      reason: `정밀도 ${(m.precision * 100).toFixed(0)}% < ${(minPrecision * 100).toFixed(0)}%`,
    }
  }

  // 신규 오픈 구제 — 없으면 갓 오픈한 대형카페가 전부 탈락한다
  const first = m.firstPostDate ? new Date(m.firstPostDate).getTime() : null
  if (first !== null && (now.getTime() - first) / DAY <= newOpeningDays) {
    return { pass: true }
  }

  if (m.postsPer30 < postsCut) {
    return { pass: false, reason: `월 ${m.postsPer30.toFixed(1)}건 < ${postsCut}건` }
  }
  return { pass: true }
}
