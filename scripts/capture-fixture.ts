/**
 * 실제 API 를 1회만 호출해 응답을 tests/fixtures/ 에 저장한다.
 * 이후 모든 테스트는 이 파일만 읽는다 (Global Constraints: 테스트는
 * 외부 API 를 호출하지 않는다).
 *
 * 사용법:
 *   npx tsx --env-file=.env scripts/capture-fixture.ts local yangpyeong "경기 양평군 베이커리카페"
 *   npx tsx --env-file=.env scripts/capture-fixture.ts blog terarosa "양평군 테라로사"
 *
 * slug 는 ASCII 로 받는다. 한글 파일명은 Windows/git 의 유니코드 정규화
 * (NFC/NFD) 차이로 CI 에서 파일을 못 찾는 사고를 낸다.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { loadEnv } from '../src/config/env.js'

const [kind, slug, ...rest] = process.argv.slice(2)
const query = rest.join(' ')

if (!kind || !slug || !query) {
  console.error('사용법: capture-fixture.ts <local|blog> <ascii-slug> <검색어>')
  process.exit(1)
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`slug 는 소문자·숫자·하이픈만 허용한다: "${slug}"`)
  process.exit(1)
}

const env = loadEnv()

const urls: Record<string, string> = {
  local:
    'https://dapi.kakao.com/v2/local/search/keyword.json'
    + `?query=${encodeURIComponent(query)}&size=15&page=1`,
  blog:
    'https://dapi.kakao.com/v2/search/blog'
    + `?query=${encodeURIComponent(query)}&size=50&sort=recency`,
}

const url = urls[kind]
if (!url) {
  console.error(`알 수 없는 kind: ${kind} (local 또는 blog)`)
  process.exit(1)
}

const res = await fetch(url, {
  headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
})
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  process.exit(1)
}
const payload = await res.json()

await mkdir('tests/fixtures', { recursive: true })
const path = `tests/fixtures/kakao-${kind}-${slug}.json`
await writeFile(path, JSON.stringify(payload, null, 2) + '\n', 'utf8')

const n = (payload as { documents?: unknown[] }).documents?.length ?? 0
console.log(`저장: ${path}  (검색어 "${query}", 문서 ${n}건)`)
