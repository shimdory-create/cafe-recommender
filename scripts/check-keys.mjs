#!/usr/bin/env node
// Task 0 검증: API 키 4종이 실제로 동작하는지 각각 1회 호출로 확인한다.
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

// 각 검사는 { ok, detail } 을 돌려준다. 절대 throw 하지 않는다.
const checks = [
  {
    name: '카카오 로컬 API',
    key: 'KAKAO_REST_API_KEY',
    async run() {
      const url = 'https://dapi.kakao.com/v2/local/search/keyword.json'
        + '?query=' + encodeURIComponent('양평 베이커리카페') + '&size=1'
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
      })
      const body = await res.json().catch(() => ({}))
      const msg = body.msg || body.message || ''
      if (res.status === 401) return { ok: false, detail: 'REST API 키가 잘못되었습니다 (401). 앱 키 화면의 세 번째 값인지 확인하세요' }
      if (res.status === 403) {
        if (/OPEN_MAP_AND_LOCAL/i.test(msg)) {
          return {
            ok: false,
detail: '403 — 앱에 카카오맵(로컬) 서비스가 꺼져 있습니다. '              + '카카오 개발자 콘솔 > 해당 앱 > 좌측 [카카오맵] 에서 활성화하세요. '              + '원문: ' + msg,
          }
        }
        return { ok: false, detail: '403 — ' + (msg || '권한 없음') }
      }
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}` }
      const first = body.documents?.[0]
      return {
        ok: true,
        detail: first ? `검색 성공 — 예: ${first.place_name} (${first.category_name})` : '응답 정상 (결과 0건)',
      }
    },
  },
  {
    name: '네이버 블로그 검색 API',
    key: 'NAVER_CLIENT_ID',
    async run() {
      const url = 'https://openapi.naver.com/v1/search/blog.json'
        + '?query=' + encodeURIComponent('양평 대형카페') + '&display=1&sort=date'
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET,
        },
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) return { ok: false, detail: 'Client ID/Secret 이 잘못되었습니다 (401)' }
      if (res.status === 403) return { ok: false, detail: '403 — 앱의 [사용 API]에 "검색"이 추가되어 있는지 확인하세요' }
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}` }
      return { ok: true, detail: `총 ${body.total?.toLocaleString() ?? '?'}건 조회됨 (핫함 측정의 원천)` }
    },
  },
  {
    name: 'Supabase',
    key: 'SUPABASE_URL',
    async run() {
      const base = env.SUPABASE_URL.replace(/\/+$/, '')
      const res = await fetch(`${base}/rest/v1/`, {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      })
      if (res.status === 401) return { ok: false, detail: 'service_role 키가 잘못되었습니다 (401)' }
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} — SUPABASE_URL 을 확인하세요` }
      return { ok: true, detail: 'REST 엔드포인트 인증 성공' }
    },
  },
  {
    name: 'Anthropic API',
    key: 'ANTHROPIC_API_KEY',
    async run() {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) return { ok: false, detail: 'API 키가 잘못되었습니다 (401)' }
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}` }
      const hasHaiku = (body.data ?? []).some(m => m.id?.includes('haiku'))
      return { ok: true, detail: hasHaiku ? 'Haiku 모델 접근 가능' : '인증 성공' }
    },
  },
]

console.log('\n  Task 0 — API 키 검증\n  ' + '-'.repeat(58))

let failures = 0
for (const c of checks) {
  const missing = !env[c.key]
  if (missing) {
    failures++
    console.log(`  [ ]  ${c.name.padEnd(24)} .env 에 ${c.key} 가 비어 있습니다`)
    continue
  }
  let result
  try {
    result = await c.run()
  } catch (e) {
    result = { ok: false, detail: `네트워크 오류: ${e.message}` }
  }
  if (!result.ok) failures++
  console.log(`  [${result.ok ? 'v' : 'X'}]  ${c.name.padEnd(24)} ${result.detail}`)
}

console.log('  ' + '-'.repeat(58))
if (failures === 0) {
  console.log('  4개 모두 정상입니다. Task 1로 진행할 수 있습니다.\n')
} else {
  console.log(`  ${failures}개 항목이 남았습니다. 위 메시지를 확인하세요.\n`)
  process.exitCode = 1
}
