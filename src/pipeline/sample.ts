export type Stratum = 'top' | 'mid' | 'boundary' | 'rejected'

export interface SampleCandidate {
  kakaoPlaceId: string
  /** 게이트까지 통과해 점수가 있는가 */
  scored: boolean
  finalScore: number
  /** 자동 배제 사유. 프랜차이즈·카테고리는 표본에서 제외한다 */
  excludeReason: string | null
  ambiguousName: boolean
  tagCount: number
  parkingGrade: 'A' | 'B' | 'C' | 'D' | '?' | null
  /** Layer 2 를 볼륨이 아니라 구제 경로로 통과했는지 판단하는 근거 */
  postsPer30: number | null
}

export interface SampledRow {
  kakaoPlaceId: string
  stratum: Stratum
}

/** 사람이 판정해도 배울 것이 없는 배제 사유 (스타벅스가 아니냐고 물을 필요는 없다) */
const UNINFORMATIVE_REASONS = ['franchise', 'category', 'out_of_region']

/** 구제 경로로만 통과한 경계 판단 기준 (발견 C) */
const RESCUE_POSTS_PER_30 = 8

/**
 * 점수 정렬된 배열에서 균등 간격으로 n개를 고른다.
 *
 * 난수를 쓰지 않는다. 골든셋은 프롬프트·공식을 바꿀 때마다 다시 돌리는
 * 회귀 기준선이므로, 같은 입력에서 같은 표본이 나와야 비교가 성립한다.
 */
export function pickEvenly<T>(arr: T[], n: number): T[] {
  if (n <= 0) return []
  if (arr.length <= n) return [...arr]
  if (n === 1) return [arr[Math.floor((arr.length - 1) / 2)]!]
  const out: T[] = []
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]!)
  }
  return out
}

/**
 * 스펙 13.1 층화 추출.
 *
 * 상위만 뽑으면 정작 판정이 흔들리는 구간을 측정하지 못한다. 경계 구간이
 * 가장 중요하며, 경계는 점수가 아니라 **구조적으로** 정의한다:
 * 일반명사 상호 / 태그 1개 이하 / 주차 미확인 / Layer 2 구제 통과.
 * 이 네 가지가 오통과의 알려진 경로다.
 *
 * 경계에 해당하면 상위·중간대에서 빼서 경계로만 뽑는다. 같은 카페를 두
 * 구간에서 묻는 것은 사람의 시간을 낭비한다.
 */
export function stratifiedSample(
  rows: SampleCandidate[],
  opts: { perStratum?: number } = {},
): SampledRow[] {
  const n = opts.perStratum ?? 10

  const isBoundary = (c: SampleCandidate) =>
    c.ambiguousName
    || c.tagCount <= 1
    || c.parkingGrade === '?'
    || (c.postsPer30 !== null && c.postsPer30 < RESCUE_POSTS_PER_30)

  const scored = rows
    .filter((c) => c.scored)
    .sort((a, b) => b.finalScore - a.finalScore || a.kakaoPlaceId.localeCompare(b.kakaoPlaceId))

  const boundary = scored.filter(isBoundary)
  const rest = scored.filter((c) => !isBoundary(c))

  // 상위 20%. 표본이 적을 때도 최소 n개는 확보한다.
  const topCut = Math.max(n, Math.ceil(rest.length * 0.2))
  const top = rest.slice(0, topCut)
  const mid = rest.slice(topCut)

  const rejected = rows
    .filter((c) => !c.scored)
    .filter((c) => !UNINFORMATIVE_REASONS.includes(c.excludeReason ?? ''))
    .sort((a, b) => a.kakaoPlaceId.localeCompare(b.kakaoPlaceId))

  const out: SampledRow[] = []
  const seen = new Set<string>()
  const take = (pool: SampleCandidate[], stratum: Stratum) => {
    for (const c of pickEvenly(pool, n)) {
      if (seen.has(c.kakaoPlaceId)) continue
      seen.add(c.kakaoPlaceId)
      out.push({ kakaoPlaceId: c.kakaoPlaceId, stratum })
    }
  }

  take(top, 'top')
  take(mid, 'mid')
  take(boundary, 'boundary')
  take(rejected, 'rejected')
  return out
}

export interface ReportInput {
  stratum: Stratum
  verdict: 'O' | 'X' | 'UNKNOWN'
  rejectReason?: string | null
}

export interface Report {
  /** 상위·중간대에서 X 비율. 체감 품질을 결정하는 값 */
  falsePassRate: number | null
  /** 탈락 구간에서 O 비율. 좋은 곳을 버리고 있는가 */
  falseRejectRate: number | null
  /** 경계 구간 O 비율. 0.5 에 가까우면 컷 위치가 적절하다 */
  boundaryPassRate: number | null
  counts: Record<Stratum, { o: number; x: number; unknown: number }>
  reasons: Record<string, number>
}

/**
 * 스펙 13.1 측정 항목. `UNKNOWN` 은 모든 비율에서 제외한다 — 모르는 곳에
 * 억지로 답한 라벨을 섞으면 기준선이 오염된다.
 */
export function buildReport(rows: ReportInput[]): Report {
  const empty = () => ({ o: 0, x: 0, unknown: 0 })
  const counts: Record<Stratum, { o: number; x: number; unknown: number }> = {
    top: empty(), mid: empty(), boundary: empty(), rejected: empty(),
  }
  const reasons: Record<string, number> = {}

  for (const r of rows) {
    const c = counts[r.stratum]
    if (r.verdict === 'O') c.o++
    else if (r.verdict === 'X') c.x++
    else c.unknown++
    if (r.verdict === 'X' && r.rejectReason) {
      reasons[r.rejectReason] = (reasons[r.rejectReason] ?? 0) + 1
    }
  }

  const ratio = (o: number, x: number, of: 'x' | 'o') => {
    const total = o + x
    if (total === 0) return null
    return Number(((of === 'x' ? x : o) / total).toFixed(3))
  }

  const upper = { o: counts.top.o + counts.mid.o, x: counts.top.x + counts.mid.x }

  return {
    falsePassRate: ratio(upper.o, upper.x, 'x'),
    falseRejectRate: ratio(counts.rejected.o, counts.rejected.x, 'o'),
    boundaryPassRate: ratio(counts.boundary.o, counts.boundary.x, 'o'),
    counts,
    reasons,
  }
}
