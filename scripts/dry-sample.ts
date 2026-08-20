/** 골든셋 표본을 실데이터로 미리 본다. 상태를 바꾸지 않는다. */
import { createJsonStore } from '../src/store/json-store.js'
import { buildCandidates } from '../src/cli/label.js'
import { stratifiedSample } from '../src/pipeline/sample.js'

const store = createJsonStore('data')
const [cafes, buzz, visits] = await Promise.all([
  store.readCafes(), store.readBuzz(), store.readVisits(),
])
const now = new Date()
const scored = buildCandidates({ cafes, buzz, visits, now })
const byId = new Map(scored.map((s) => [s.cafe.kakaoPlaceId, s]))
const sample = stratifiedSample(scored.map((s) => s.candidate), { perStratum: 10 })

console.log(`판정 완료 ${scored.length}곳 -> 표본 ${sample.length}곳`)
let cur = ''
for (const s of sample) {
  if (s.stratum !== cur) { cur = s.stratum; console.log(`\n[${cur}]`) }
  const t = byId.get(s.kakaoPlaceId)!
  const a = t.cafe.attributes
  console.log(
    `  ${t.candidate.finalScore.toFixed(2).padStart(7)}  ${t.cafe.sigungu} ${t.cafe.name}`
    + `  ${a ? `규모 ${a.scale ?? '?'} 주차 ${a.parkingGrade} 뷰 ${a.viewStrength}` : '속성없음'}`
    + `  [${t.cafe.tags.join(',')}]`
    + (t.cafe.excludeReason ? `  탈락:${t.cafe.excludeReason}` : ''),
  )
}
