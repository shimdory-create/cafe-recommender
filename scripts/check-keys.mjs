#!/usr/bin/env node
// Task 0 검증: v3 키 구성이 실제로 동작하는지 각각 1회 호출로 확인한다.
// 의존성 없음. `node scripts/check-keys.mjs` 로 실행.
// 키 값은 절대 출력하지 않는다.

import { readFileSync } from 'node:fs'

function loadDotEnv(path = '.env') {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    console.error(`\n  .env 파일이 없습니다. 먼저 만들어 주세요:\n    cp .env.example .env\n`)
    process.exit(1)
  }
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadDotEnv()
const provider = env.LLM_PROVIDER || 'gemini'

const kakaoHeaders = () => ({ Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` })

/** 카카오 403 은 원인이 두 가지뿐이고, 서버가 원문으로 알려준다. */
function kakaoFailure(status, body) {
  const msg = body.msg || body.message || ''
  if (status === 401) {
    return 'REST API 키가 잘못되었습니다 (401). 앱 키 화면의 세 번째 값인지 확인하세요'
  }
  if (status === 403) {
    if (/OPEN_MAP_AND_LOCAL/i.test(msg)) {
      return '403 — 카카오 개발자 콘솔 > 해당 앱 > [제품 설정] > 카카오맵 에서 활성화하세요. 원문: ' + msg
    }
    return '403 — ' + (msg || '권한 없음')
  }
  return `HTTP ${status} ${msg || JSON.stringify(body).slice(0, 120)}`
}

const checks = [
  {
    name: '카카오 로컬 (장소 검색)',
    key: 'KAKAO_REST_API_KEY',
    async run() {
      const url = 'https://dapi.kakao.com/v2/local/search/keyword.json'
        + '?query=' + encodeURIComponent('양평군 베이커리카페') + '&size=1'
      const res = await fetch(url, { headers: kakaoHeaders() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, detail: kakaoFailure(res.status, body) }
      const first = body.documents?.[0]
      return {
        ok: true,
        detail: first ? `검색 성공 — 예: ${first.place_name}` : '응답 정상 (결과 0건)',
      }
    },
  },
  {
    name: '카카오 블로그 검색',
    key: 'KAKAO_REST_API_KEY',
    async run() {
      // 화제량 측정의 원천. 네이버 검색 API 를 대체한다 (스펙 v3 6절).
      const url = 'https://dapi.kakao.com/v2/search/blog'
        + '?query=' + encodeURIComponent('양평군 테라로사') + '&size=50&sort=recency'
      const res = await fetch(url, { headers: kakaoHeaders() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, detail: kakaoFailure(res.status, body) }
      const docs = body.documents ?? []
      // total_count 는 OR 매칭이라 신뢰할 수 없다. 관련 문서 수를 직접 센다.
      const strip = (s) => (s || '').replace(/<[^>]+>/g, '')
      const relevant = docs.filter((d) => strip(d.title + d.contents).includes('테라로사'))
      const pct = docs.length ? Math.round((relevant.length / docs.length) * 100) : 0
      return { ok: true, detail: `${docs.length}건 수신, 관련 ${relevant.length}건 (정밀도 ${pct}%)` }
    },
  },
  {
    name: `LLM (${provider})`,
    key: provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY',
    async run() {
      if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        })
        if (res.status === 401) return { ok: false, detail: 'API 키가 잘못되었습니다 (401)' }
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
        return { ok: true, detail: '인증 성공' }
      }
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, detail: `HTTP ${res.status} ${(body.error?.message ?? '').slice(0, 140)}` }
      }
      const names = (body.models ?? []).map((m) => m.name.replace('models/', ''))
      // 별칭(*-latest)은 503 을 뱉으므로 고정 버전을 쓴다 (스펙 v3 6.6)
      const target = 'gemini-3.1-flash-lite'
      const has = names.includes(target)
      return {
        ok: has,
        detail: has ? `${target} 사용 가능` : `${target} 를 찾을 수 없습니다. 사용 가능: ${names.filter((n) => n.includes('flash')).slice(0, 4).join(', ')}`,
      }
    },
  },
]

console.log('\n  Task 0 — API 키 검증 (v3: 카카오 1개 + LLM 1개)')
console.log('  ' + '-'.repeat(66))

let failures = 0
for (const c of checks) {
  if (!env[c.key]) {
    failures++
    console.log(`  [ ]  ${c.name}\n         .env 에 ${c.key} 가 비어 있습니다`)
    continue
  }
  let result
  try {
    result = await c.run()
  } catch (e) {
    result = { ok: false, detail: `네트워크 오류: ${e.message}` }
  }
  if (!result.ok) failures++
  console.log(`  [${result.ok ? 'v' : 'X'}]  ${c.name}\n         ${result.detail}`)
}

console.log('  ' + '-'.repeat(66))
if (failures === 0) {
  console.log('  모두 정상입니다.\n')
} else {
  console.log(`  ${failures}개 항목이 남았습니다. 위 메시지를 확인하세요.\n`)
  process.exitCode = 1
}
