/** 골든셋 카드를 채팅에 붙일 수 있는 형태로 뽑는다. 인자: 시작번호 개수 */
import { createJsonStore } from '../src/store/json-store.js'
import { buildCandidates } from '../src/cli/label.js'
import { stratifiedSample } from '../src/pipeline/sample.js'

const from = Number(process.argv[2] ?? 1)
const count = Number(process.argv[3] ?? 10)
const store = createJsonStore('data')
const [cafes, buzz, visits] = await Promise.all([
  store.readCafes(), store.readBuzz(), store.readVisits(),
])
const scored = buildCandidates({ cafes, buzz, visits, now: new Date() })
const byId = new Map(scored.map((s) => [s.cafe.kakaoPlaceId, s]))
const sample = stratifiedSample(scored.map((s) => s.candidate), { perStratum: 10 })
const LABEL = { top: '상위', mid: '중간', boundary: '경계', rejected: '탈락' } as const

sample.slice(from - 1, from - 1 + count).forEach((s, i) => {
  const t = byId.get(s.kakaoPlaceId)!
  const c = t.cafe
  const a = c.attributes
  const n = from + i
  console.log(`\n**${n}. ${c.name}** — ${c.sigungu} · ${c.driveMinutesEst}분 · [${LABEL[s.stratum]}]`)
  if (a) {
    console.log(`규모 ${a.scale ?? '미확인'} / 주차 ${a.parkingGrade} / 메뉴 Lv${a.menuLevel}`
      + (c.tags.length ? ` / ${c.tags.join(' · ')}` : ''))
    if (a.evidence) console.log(`> ${a.evidence.slice(0, 130)}`)
    if (a.parkingEvidence) console.log(`> 주차: ${a.parkingEvidence.slice(0, 100)}`)
  } else {
    console.log('속성 없음 (LLM 추출 전에 탈락)')
  }
  if (c.excludeReason) console.log(`탈락 사유: ${c.excludeReason}`)
  console.log(c.naverMapUrl)
})
