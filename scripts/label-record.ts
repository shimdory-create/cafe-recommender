/**
 * 채팅에서 받은 판정을 골든셋에 기록한다.
 *   npx tsx scripts/label-record.ts 1 "o o o x ?" [이유:4=too_far,...]
 * 이유는 "번호=사유" 쌍을 콤마로 (사유: neighborhood|parking|too_small|too_far|taste)
 */
import { createJsonStore } from '../src/store/json-store.js'
import { buildCandidates } from '../src/cli/label.js'
import { stratifiedSample } from '../src/pipeline/sample.js'
import type { GoldenLabel } from '../src/schema.js'

const from = Number(process.argv[2])
const verdicts = (process.argv[3] ?? '').trim().split(/\s+/).filter(Boolean)
const reasonArg = process.argv[4] ?? ''
const reasons = new Map<number, GoldenLabel['rejectReason']>()
for (const pair of reasonArg.split(',').filter(Boolean)) {
  const [n, r] = pair.split('=')
  reasons.set(Number(n), r as GoldenLabel['rejectReason'])
}

const store = createJsonStore('data')
const [cafes, buzz, visits, golden] = await Promise.all([
  store.readCafes(), store.readBuzz(), store.readVisits(), store.readGolden(),
])
const scored = buildCandidates({ cafes, buzz, visits, now: new Date() })
const byId = new Map(scored.map((s) => [s.cafe.kakaoPlaceId, s]))
const sample = stratifiedSample(scored.map((s) => s.candidate), { perStratum: 10 })

const now = new Date().toISOString()
const rows = [...golden]
verdicts.forEach((v, i) => {
  const n = from + i
  const s = sample[n - 1]
  if (!s) throw new Error(`${n}번 표본이 없다`)
  const t = byId.get(s.kakaoPlaceId)!
  const verdict = v === 'o' ? 'O' : v === 'x' ? 'X' : 'UNKNOWN'
  const idx = rows.findIndex((r) => r.kakaoPlaceId === s.kakaoPlaceId)
  const row: GoldenLabel = {
    kakaoPlaceId: s.kakaoPlaceId,
    verdict,
    rejectReason: verdict === 'X' ? (reasons.get(n) ?? null) : null,
    stratum: s.stratum,
    modelVersion: t.cafe.attributes?.modelVersion ?? 'none',
    labeledAt: now,
  }
  if (idx >= 0) rows[idx] = row
  else rows.push(row)
  console.log(`  ${n}. ${t.cafe.name} -> ${verdict}${row.rejectReason ? ` (${row.rejectReason})` : ''}`)
})
await store.writeGolden(rows)
console.log(`\n골든셋 ${rows.length}/40`)
