/** 일회성 — 주차 C 로 굳어버린 카페를 active 로 되돌린다 (도심 모드에서 노출). */
import { createJsonStore } from '../src/store/json-store.js'

const store = createJsonStore('data')
const cafes = await store.readCafes()
let n = 0
for (const c of cafes) {
  if (c.status !== 'excluded_auto') continue
  if (!c.excludeReason?.startsWith('주차 C')) continue
  c.status = 'active'
  c.excludeReason = null
  n++
}
await store.writeCafes(cafes)
console.log(`${n}곳 복구 — 도심 모드(--city)에서 노출된다`)
