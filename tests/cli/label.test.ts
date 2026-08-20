import { describe, it, expect } from 'vitest'
import { buildCandidates, runLabel, runLabelReport, type LabelDeps } from '../../src/cli/label.js'
import type { BuzzSnapshot, Cafe, CafeAttributes, GoldenLabel } from '../../src/schema.js'

const NOW = new Date('2026-08-20T00:00:00Z')

const attrs = (over: Partial<CafeAttributes> = {}): CafeAttributes => ({
  scale: '대형', seatsEstimate: null, floors: 2,
  hasBakery: true, breadBakedOnsite: true, menuLevel: 3,
  mealTypes: ['파스타'], viewStrength: 4, viewTypes: ['강'], outdoorSeating: true,
  parkingGrade: 'A', parkingEvidence: '주차장 넓음', photoSpot: 4, teenAppeal: 3,
  confidence: 0.9, evidence: '2층 통창 강뷰',
  extractedAt: NOW.toISOString(), modelVersion: 'gemini-3.1-flash-lite+p2',
  ...over,
})

const cafe = (id: string, over: Partial<Cafe> = {}): Cafe => ({
  kakaoPlaceId: id,
  name: `카페${id}`,
  sigungu: '양평군',
  lat: 37.49, lng: 127.48,
  driveMinutesEst: 70,
  naverMapUrl: 'https://map.naver.com/p/search/x',
  firstSeenAt: '2026-08-01T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  attributes: attrs(),
  tags: ['대형카페', '뷰맛집', '브런치카페'],
  ...over,
})

const buzz = (id: string, over: Partial<BuzzSnapshot> = {}): BuzzSnapshot => ({
  kakaoPlaceId: id, capturedAt: '2026-08-19',
  receivedCount: 50, relevantCount: 40, precision: 0.8,
  spanDays: 20, postsPer30: 60, posts30d: 30, postsPrev: 15,
  firstPostDate: '2026-07-01', latestPostDate: '2026-08-19',
  acceleration: 1.6, suspectAmbiguous: false,
  ...over,
})

function harness(cafes: Cafe[], buzzRows: BuzzSnapshot[], keys: string[]) {
  let golden: GoldenLabel[] = []
  const printed: string[] = []
  const queue = [...keys]
  const deps: LabelDeps = {
    store: {
      readCafes: async () => cafes,
      readBuzz: async () => buzzRows,
      readVisits: async () => [],
      readGolden: async () => golden,
      writeGolden: async (r) => { golden = r },
    },
    now: NOW,
    ask: async () => queue.shift() ?? 'q',
    print: (s) => printed.push(s),
  }
  return { deps, golden: () => golden, printed: () => printed.join('\n'), left: () => queue.length }
}

describe('buildCandidates', () => {
  it('판정 전 카페는 표본에서 뺀다', () => {
    // pending 은 통과도 탈락도 아니다. 물어볼 것이 없다.
    const rows = buildCandidates({
      cafes: [cafe('1'), cafe('2', { status: 'pending_extraction', attributes: null })],
      buzz: [buzz('1'), buzz('2')], visits: [], now: NOW,
    })
    expect(rows.map((r) => r.cafe.kakaoPlaceId)).toEqual(['1'])
  })

  it('숨긴 카페도 뺀다 (사람이 이미 판정한 것이다)', () => {
    const rows = buildCandidates({
      cafes: [cafe('1', { status: 'hidden' })], buzz: [buzz('1')], visits: [], now: NOW,
    })
    expect(rows).toHaveLength(0)
  })

  it('게이트 통과분에 점수를 매긴다', () => {
    const rows = buildCandidates({ cafes: [cafe('1')], buzz: [buzz('1')], visits: [], now: NOW })
    expect(rows[0]!.candidate.scored).toBe(true)
    expect(rows[0]!.candidate.finalScore).toBeGreaterThan(0)
  })

  it('탈락한 카페는 점수 없이 사유를 들고 온다', () => {
    const rows = buildCandidates({
      cafes: [cafe('1', {
        status: 'excluded_auto', excludeReason: '월 4.1건 < 8건', attributes: null, tags: [],
      })],
      buzz: [buzz('1')], visits: [], now: NOW,
    })
    expect(rows[0]!.candidate.scored).toBe(false)
    expect(rows[0]!.candidate.excludeReason).toBe('월 4.1건 < 8건')
  })

  it('화제량 스냅샷이 없으면 점수를 매기지 않는다', () => {
    const rows = buildCandidates({ cafes: [cafe('1')], buzz: [], visits: [], now: NOW })
    expect(rows[0]!.candidate.scored).toBe(false)
  })
})

describe('runLabel', () => {
  it('o 를 누르면 O 로 저장한다', async () => {
    const h = harness([cafe('1')], [buzz('1')], ['o'])
    const r = await runLabel(h.deps, { perStratum: 1 })
    expect(r.labeled).toBe(1)
    expect(h.golden()[0]!.verdict).toBe('O')
    expect(h.golden()[0]!.stratum).toBe('top')
  })

  it('x 를 누르면 이유를 한 번 더 묻는다', async () => {
    // 이유가 없으면 정확도만 알고 무엇을 고칠지는 모른다
    const h = harness([cafe('1')], [buzz('1')], ['x', '1'])
    await runLabel(h.deps, { perStratum: 1 })
    expect(h.golden()[0]!.verdict).toBe('X')
    expect(h.golden()[0]!.rejectReason).toBe('neighborhood')
  })

  it('알 수 없는 이유 키를 누르면 이유 없이 X 로 남긴다', async () => {
    const h = harness([cafe('1')], [buzz('1')], ['x', '9'])
    await runLabel(h.deps, { perStratum: 1 })
    expect(h.golden()[0]!.rejectReason).toBeNull()
  })

  it('? 는 UNKNOWN 이다', async () => {
    const h = harness([cafe('1')], [buzz('1')], ['?'])
    await runLabel(h.deps, { perStratum: 1 })
    expect(h.golden()[0]!.verdict).toBe('UNKNOWN')
  })

  it('q 로 중단하면 그때까지가 저장된다', async () => {
    const cafes = [cafe('1'), cafe('2'), cafe('3')]
    const h = harness(cafes, cafes.map((c) => buzz(c.kakaoPlaceId)), ['o', 'q'])
    const r = await runLabel(h.deps, { perStratum: 3 })
    expect(r.labeled).toBe(1)
    expect(r.remaining).toBe(2)
    expect(h.golden()).toHaveLength(1)
  })

  it('이미 판정한 곳은 다시 묻지 않는다', async () => {
    const cafes = [cafe('1'), cafe('2')]
    const h = harness(cafes, cafes.map((c) => buzz(c.kakaoPlaceId)), ['o', 'o'])
    await runLabel(h.deps, { perStratum: 2 })
    const again = await runLabel(
      { ...h.deps, store: { ...h.deps.store, readGolden: async () => h.golden() } },
      { perStratum: 2 },
    )
    expect(again.labeled).toBe(0)
  })

  it('한 건마다 저장한다 (7분을 다시 하게 만들지 않는다)', async () => {
    let writes = 0
    const cafes = [cafe('1'), cafe('2')]
    const h = harness(cafes, cafes.map((c) => buzz(c.kakaoPlaceId)), ['o', 'x', '2'])
    await runLabel(
      { ...h.deps, store: { ...h.deps.store, writeGolden: async () => { writes++ } } },
      { perStratum: 2 },
    )
    expect(writes).toBe(2)
  })

  it('카드에 판단 재료와 네이버 링크를 보여준다', async () => {
    const h = harness([cafe('1')], [buzz('1')], ['o'])
    await runLabel(h.deps, { perStratum: 1 })
    const out = h.printed()
    expect(out).toContain('카페1')
    expect(out).toContain('주차 A')
    expect(out).toContain('뷰맛집')
    expect(out).toContain('2층 통창 강뷰')
    expect(out).toContain('map.naver.com')
  })

  it('좌석 수가 없으면 규모로 대체해 보여준다', async () => {
    // 실측: seatsEstimate 는 28/28 이 null 이고 scale 은 28/28 이 채워졌다
    const h = harness([cafe('1')], [buzz('1')], ['o'])
    await runLabel(h.deps, { perStratum: 1 })
    expect(h.printed()).toContain('대형')
  })

  it('일반명사 상호에는 경고를 띄운다', async () => {
    const h = harness([cafe('1', { ambiguousName: true })], [buzz('1')], ['o'])
    await runLabel(h.deps, { perStratum: 1 })
    expect(h.printed()).toContain('일반명사 상호')
  })

  it('탈락한 카페는 사유를 보여준다', async () => {
    const h = harness(
      [cafe('1', {
        status: 'excluded_auto', excludeReason: '월 4.1건 < 8건', attributes: null, tags: [],
      })],
      [buzz('1')], ['o'],
    )
    await runLabel(h.deps, { perStratum: 1 })
    expect(h.printed()).toContain('월 4.1건 < 8건')
  })
})

describe('runLabelReport', () => {
  const store = (golden: GoldenLabel[], cafes: Cafe[] = [cafe('1')]) => ({
    readCafes: async () => cafes,
    readGolden: async () => golden,
  })

  it('라벨이 없으면 안내만 한다', async () => {
    const out: string[] = []
    await runLabelReport({ store: store([]), print: (s) => out.push(s) })
    expect(out.join('\n')).toContain('라벨이 없습니다')
  })

  it('측정 항목 세 가지를 출력한다', async () => {
    const out: string[] = []
    const g: GoldenLabel[] = [
      { kakaoPlaceId: '1', verdict: 'X', rejectReason: 'neighborhood', stratum: 'top', modelVersion: 'v', labeledAt: 'a' },
      { kakaoPlaceId: '2', verdict: 'O', rejectReason: null, stratum: 'rejected', modelVersion: 'v', labeledAt: 'a' },
      { kakaoPlaceId: '3', verdict: 'O', rejectReason: null, stratum: 'boundary', modelVersion: 'v', labeledAt: 'a' },
    ]
    await runLabelReport({ store: store(g), print: (s) => out.push(s) })
    const text = out.join('\n')
    expect(text).toContain('오통과율')
    expect(text).toContain('오탈락률')
    expect(text).toContain('경계 구간 통과율')
  })

  it('오판정 목록에 이름을 띄운다 (고칠 대상)', async () => {
    const out: string[] = []
    const g: GoldenLabel[] = [
      { kakaoPlaceId: '1', verdict: 'X', rejectReason: 'parking', stratum: 'top', modelVersion: 'v', labeledAt: 'a' },
    ]
    await runLabelReport({ store: store(g), print: (s) => out.push(s) })
    expect(out.join('\n')).toContain('카페1')
  })
})
