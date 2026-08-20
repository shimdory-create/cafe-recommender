/**
 * 일회성 정리 — 동명 시군구 오염으로 들어온 카페를 배제 처리한다.
 * 지우지 않고 excluded_auto 로 남긴다 (감사 흔적).
 */
import { createJsonStore } from '../src/store/json-store.js'
const IN_SCOPE = ['서울', '인천', '경기']

const store = createJsonStore('data')
const cafes = await store.readCafes()
let n = 0
for (const c of cafes) {
  if (c.status === 'excluded_auto' && c.excludeReason === 'out_of_region') continue
  const addr = (c.address || c.roadAddress || '').trim()
  if (addr && IN_SCOPE.some((s) => addr.startsWith(s))) continue
  if (!addr) continue // 주소가 없으면 좌표를 믿는다 (발굴 시 이미 검증됨)
  console.log(`  ${c.sigungu} ${c.name}  ${c.driveMinutesEst}분  ${c.address ?? ''}`)
  c.status = 'excluded_auto'
  c.excludeReason = 'out_of_region'
  c.attributes = null
  c.tags = []
  n++
}
await store.writeCafes(cafes)
console.log(`\n${n}곳 배제 처리`)
