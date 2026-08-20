import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { hotScore, familyFit, finalScore } from '../pipeline/score.js'
import { passesGate } from '../pipeline/gate.js'
import { driveMinutesOf } from '../jobs/drive-times.js'
import { stratifiedSample, buildReport, type SampleCandidate, type Stratum } from '../pipeline/sample.js'
import type { BuzzSnapshot, Cafe, GoldenLabel } from '../schema.js'
import type { Store } from '../store/types.js'

const STRATUM_LABEL: Record<Stratum, string> = {
  top: '상위 구간',
  mid: '중간대',
  boundary: '경계 구간',
  rejected: '자동 탈락',
}

const REASONS = [
  { key: '1', value: 'neighborhood' as const, label: '동네 카페다' },
  { key: '2', value: 'parking' as const, label: '주차가 안 된다' },
  { key: '3', value: 'too_small' as const, label: '너무 작다' },
  { key: '4', value: 'too_far' as const, label: '너무 멀다' },
  { key: '5', value: 'taste' as const, label: '그냥 취향이 아니다' },
]

interface Scored {
  cafe: Cafe
  candidate: SampleCandidate
}

/**
 * 골든셋 후보를 만든다. weekly-suggest 와 같은 점수 경로를 쓴다 —
 * 라벨을 붙이는 대상이 실제로 추천에 오르는 대상과 달라지면 기준선이
 * 의미를 잃는다.
 */
export function buildCandidates(input: {
  cafes: Cafe[]
  buzz: BuzzSnapshot[]
  visits: { kakaoPlaceId: string; visitedOn: string }[]
  now: Date
}): Scored[] {
  const { cafes, buzz, visits, now } = input

  const latest = new Map<string, BuzzSnapshot>()
  for (const b of buzz) {
    const prev = latest.get(b.kakaoPlaceId)
    if (!prev || b.capturedAt > prev.capturedAt) latest.set(b.kakaoPlaceId, b)
  }
  const lastVisit = new Map<string, string>()
  for (const v of visits) {
    const prev = lastVisit.get(v.kakaoPlaceId)
    if (!prev || v.visitedOn > prev) lastVisit.set(v.kakaoPlaceId, v.visitedOn)
  }

  const out: Scored[] = []
  for (const c of cafes) {
    // 아직 판정되지 않은 카페는 표본에 넣지 않는다. 통과도 탈락도 아니다.
    if (c.status === 'pending_extraction' || c.status === 'hidden') continue

    const b = latest.get(c.kakaoPlaceId) ?? null
    const a = c.attributes
    const gated =
      c.status === 'active'
      && a !== null
      && passesGate({ tags: c.tags, parkingGrade: a.parkingGrade }).pass
      && b !== null

    let score = 0
    if (gated && a && b) {
      const hot = hotScore(b, now)
      const fit = familyFit(
        {
          driveMinutes: driveMinutesOf(c) ?? 90,
          parkingGrade: a.parkingGrade,
          menuLevel: a.menuLevel,
          lastVisitedOn: lastVisit.get(c.kakaoPlaceId) ?? null,
          outdoorOnly: Boolean(a.outdoorSeating) && a.menuLevel === 1,
          teenAppeal: a.teenAppeal ?? 2,
        },
        now,
      )
      score = finalScore(hot, fit)
    }

    out.push({
      cafe: c,
      candidate: {
        kakaoPlaceId: c.kakaoPlaceId,
        scored: Boolean(gated),
        finalScore: score,
        excludeReason: c.excludeReason ?? null,
        ambiguousName: c.ambiguousName,
        tagCount: c.tags.length,
        parkingGrade: a?.parkingGrade ?? null,
        postsPer30: b?.postsPer30 ?? null,
      },
    })
  }
  return out
}

function renderCard(s: Scored, stratum: Stratum, i: number, total: number): string {
  const c = s.cafe
  const a = c.attributes
  const L: string[] = []
  L.push('')
  L.push(`[${i}/${total}]  ${STRATUM_LABEL[stratum]}`)
  L.push('')
  const min = driveMinutesOf(c)
  L.push(`  ${c.name}  (${c.sigungu}${min ? ` · 약 ${min}분` : ''})`)

  if (a) {
    const scale = a.scale ?? (a.seatsEstimate ? `${a.seatsEstimate}석` : '규모 미확인')
    L.push(`  ${scale}   주차 ${a.parkingGrade}   메뉴 Lv${a.menuLevel}`)
    if (c.tags.length) L.push(`  태그  ${c.tags.join(' · ')}`)
    if (a.evidence) L.push(`  근거  "${a.evidence.slice(0, 160)}"`)
    if (a.parkingEvidence) L.push(`  주차  "${a.parkingEvidence.slice(0, 120)}"`)
  } else {
    L.push(`  속성 없음 (LLM 추출 전에 탈락)`)
  }
  if (c.excludeReason) L.push(`  탈락  ${c.excludeReason}`)
  if (c.ambiguousName) L.push(`  주의  일반명사 상호 — 검색 오염 가능`)
  L.push('')
  if (c.naverMapUrl) L.push(`  네이버  ${c.naverMapUrl}`)
  L.push('')
  L.push('  [o] 나왔으면 좋겠다   [x] 안 갈 곳   [?] 모름   [q] 중단')
  return L.join('\n')
}

export interface LabelDeps {
  store: Pick<Store, 'readCafes' | 'readBuzz' | 'readVisits' | 'readGolden' | 'writeGolden'>
  now?: Date
  /** 테스트에서 키 입력을 주입한다 */
  ask?: (prompt: string) => Promise<string>
  print?: (s: string) => void
}

export async function runLabel(
  deps: LabelDeps,
  opts: { perStratum?: number; redo?: boolean } = {},
): Promise<{ labeled: number; remaining: number }> {
  const { store, now = new Date() } = deps
  const print = deps.print ?? ((s: string) => console.log(s))

  const rl = deps.ask ? null : createInterface({ input: stdin, output: stdout })
  const ask = deps.ask ?? (async (p: string) => {
    try {
      return (await rl!.question(p)).trim().toLowerCase()
    } catch {
      // 입력 스트림이 닫혔다 (Ctrl+C, 파이프 EOF). 스택 트레이스를 토하지
      // 말고 중단으로 취급한다. 여기까지의 라벨은 이미 저장되어 있다.
      return 'q'
    }
  })

  try {
    const [cafes, buzz, visits, golden] = await Promise.all([
      store.readCafes(), store.readBuzz(), store.readVisits(), store.readGolden(),
    ])
    const scored = buildCandidates({ cafes, buzz, visits, now })
    const byId = new Map(scored.map((s) => [s.cafe.kakaoPlaceId, s]))
    const sample = stratifiedSample(scored.map((s) => s.candidate), opts)

    const done = new Set(opts.redo ? [] : golden.map((g) => g.kakaoPlaceId))
    const todo = sample.filter((s) => !done.has(s.kakaoPlaceId))

    if (todo.length === 0) {
      print('\n골든셋이 이미 완성되었습니다. 결과는 `npm run label -- --report` 로 봅니다.\n')
      return { labeled: 0, remaining: 0 }
    }

    print(`\n골든셋 판정 ${todo.length}곳. 곳당 10초, 약 ${Math.ceil(todo.length / 6)}분.`)
    print('판단이 안 서면 네이버 링크를 열어보고, 모르면 그냥 ? 를 누르세요.')
    print('중간에 q 로 멈춰도 여기까지가 저장되고 다음에 이어서 합니다.')

    const rows: GoldenLabel[] = [...golden.filter((g) => !opts.redo || !sample.some((s) => s.kakaoPlaceId === g.kakaoPlaceId))]
    let labeled = 0

    for (const [idx, s] of todo.entries()) {
      const target = byId.get(s.kakaoPlaceId)
      if (!target) continue
      print(renderCard(target, s.stratum, idx + 1, todo.length))

      const key = await ask('> ')
      if (key === 'q') break

      let verdict: GoldenLabel['verdict'] = 'UNKNOWN'
      let rejectReason: GoldenLabel['rejectReason'] = null
      if (key === 'o') verdict = 'O'
      else if (key === 'x') {
        verdict = 'X'
        print('\n  왜 아닌가?')
        print(`  ${REASONS.map((r) => `[${r.key}] ${r.label}`).join('   ')}`)
        const rk = await ask('> ')
        rejectReason = REASONS.find((r) => r.key === rk)?.value ?? null
      }

      rows.push({
        kakaoPlaceId: s.kakaoPlaceId,
        verdict,
        rejectReason,
        stratum: s.stratum,
        modelVersion: target.cafe.attributes?.modelVersion ?? 'none',
        labeledAt: now.toISOString(),
      })
      labeled++
      // 한 건마다 저장한다. 7분을 다시 하게 만들지 않는다.
      await store.writeGolden(rows)
    }

    const remaining = todo.length - labeled
    print(`\n${labeled}곳 저장. 남은 ${remaining}곳.`)
    if (remaining === 0) print('`npm run label -- --report` 로 측정 결과를 봅니다.\n')
    return { labeled, remaining }
  } finally {
    rl?.close()
  }
}

export async function runLabelReport(deps: {
  store: Pick<Store, 'readCafes' | 'readGolden'>
  print?: (s: string) => void
}): Promise<void> {
  const print = deps.print ?? ((s: string) => console.log(s))
  const [cafes, golden] = await Promise.all([deps.store.readCafes(), deps.store.readGolden()])
  const names = new Map(cafes.map((c) => [c.kakaoPlaceId, c.name]))

  if (golden.length === 0) {
    print('\n라벨이 없습니다. `npm run label` 을 먼저 실행하세요.\n')
    return
  }

  const r = buildReport(golden)
  const pct = (v: number | null) => (v === null ? '측정 불가 (표본 0)' : `${(v * 100).toFixed(0)}%`)

  print('')
  print(`골든셋 ${golden.length}곳`)
  print('')
  for (const k of ['top', 'mid', 'boundary', 'rejected'] as const) {
    const c = r.counts[k]
    print(`  ${STRATUM_LABEL[k].padEnd(10)} O ${c.o}  X ${c.x}  ? ${c.unknown}`)
  }
  print('')
  print(`  동네카페 오통과율  ${pct(r.falsePassRate)}   (상위·중간대의 X 비율)`)
  print(`  오탈락률           ${pct(r.falseRejectRate)}   (탈락 구간의 O 비율)`)
  print(`  경계 구간 통과율   ${pct(r.boundaryPassRate)}   (50% 에 가까우면 컷 위치가 적절)`)
  print('')
  if (Object.keys(r.reasons).length) {
    print('  X 이유 분포')
    const map: Record<string, string> = {
      neighborhood: '동네 카페 -> Layer 2 컷 / Layer 4 임계',
      parking: '주차 -> Layer 4c 주차 등급',
      too_small: '너무 작다 -> scale · seatsEstimate 추출',
      too_far: '너무 멀다 -> distance_decay 계수',
      taste: '취향 -> 알고리즘 문제 아님',
    }
    for (const [k, v] of Object.entries(r.reasons).sort((a, b) => b[1] - a[1])) {
      print(`    ${String(v).padStart(2)}건  ${map[k] ?? k}`)
    }
    print('')
  }

  const wrong = golden.filter((g) => (g.stratum === 'rejected' && g.verdict === 'O')
    || (g.stratum !== 'rejected' && g.stratum !== 'boundary' && g.verdict === 'X'))
  if (wrong.length) {
    print('  오판정 목록 (고칠 대상)')
    for (const g of wrong) {
      print(`    ${g.verdict}  ${names.get(g.kakaoPlaceId) ?? g.kakaoPlaceId}  (${STRATUM_LABEL[g.stratum]})`)
    }
    print('')
  }
}
