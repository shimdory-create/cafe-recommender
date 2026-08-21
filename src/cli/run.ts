/**
 * 파이프라인 CLI.
 *
 *   npm run discover   -- [--region 양평군] [--skip-harvest]
 *   npm run buzz       -- [--limit 200]
 *   npm run classify   -- [--limit 200] [--redo-stale] [--order file]
 *   npm run label      -- [--report] [--redo]
 *   npm run drive      -- [--limit 500] [--force]
 *   npm run site       -- [--out web/src/generated/site.json]
 *   npm run notify     -- [--url https://...] (문구만 출력. 발송하지 않는다)
 *   npm run suggest    -- [--city]
 *   npm run visited    -- <카페 이름> [--date YYYY-MM-DD] [--note "한 줄 메모"]
 *   npm run inspect    -- <카페 이름>
 *   npm run health
 *   npm run watch                   (사용량·운영 이상. 키 없이 돈다)
 *   npm run audit                   (데이터 정합성. 키 없이 돈다)
 *   npm run normalize -- [--dry]    (시군구를 주소 기준으로 정정)
 *   npm run prune-raw -- [--days 7]
 *   npm run hide       -- <카페 이름> | --list | --restore <카페 이름>
 */
import { createContext, flag, numFlag } from './context.js'
import { createJsonStore, rawDirOf } from '../store/json-store.js'
import { pruneRaw } from '../store/prune-raw.js'
import { withDataLock, LockBusyError } from '../store/lock.js'
import { resolveCafe, printCandidates } from './resolve.js'
import { scanTargets, REGIONS } from '../config/regions.js'
import { runDiscover, naverMapUrl } from '../jobs/weekly-discover.js'
import { resolveSigungu } from '../pipeline/district.js'
import { runDailyBuzz } from '../jobs/daily-buzz.js'
import { runClassify } from '../jobs/classify.js'
import { runWeeklySuggest } from '../jobs/weekly-suggest.js'
import { runDriveTimes, driveMinutesOf } from '../jobs/drive-times.js'
import { runLabel, runLabelReport } from './label.js'
import { buildSitePayload } from '../site/payload.js'
import { SitePayloadSchema } from '../schema.js'
import { detectAnomalies, formatWatch, statusLine } from '../jobs/usage-watch.js'
import { auditData, formatAudit, zoneDrift } from '../pipeline/audit.js'
import { buildNotifyText, KAKAO_TEXT_LIMIT } from '../site/notify.js'
import { mondayOf } from '../jobs/weekly-suggest.js'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const argv = process.argv.slice(2)
const cmd = argv[0]
const rest = argv.slice(1)

function die(msg: string): never {
  console.error(msg)
  process.exit(1)
}

async function main() {
  switch (cmd) {
    case 'discover': {
      const ctx = createContext()
      const only = flag(rest, 'region')
      const regions = only
        ? REGIONS.filter((r) => r.sigungu === only && !r.excluded)
        : scanTargets()
      if (regions.length === 0) die(`지역을 찾지 못했습니다: ${only}`)
      console.log(`발굴 시작 — ${regions.length}개 지역`)
      const r = await runDiscover(ctx, {
        regions,
        skipHarvest: flag(rest, 'skip-harvest') !== undefined,
      })
      console.log(
        `  신규 ${r.discovered}곳 / 자동배제 ${r.excluded}곳`
        + ` / 타지역 ${r.offRegion}곳 / 전체 ${r.total}곳`,
      )
      if (r.errors.length) {
        console.log(`  실패 ${r.errors.length}건:`)
        r.errors.slice(0, 10).forEach((e) => console.log(`    ${e}`))
      }
      break
    }

    case 'buzz': {
      const ctx = createContext()
      const limit = numFlag(rest, 'limit')
      // 판정 대기는 회전식으로 잰다. 기본값은 daily-buzz.ts 의 PENDING_PER_DAY.
      const pendingPerDay = numFlag(rest, 'pending')
      console.log(`화제량 수집 시작${limit ? ` (최대 ${limit}곳)` : ''}`)
      const r = await runDailyBuzz(ctx, { limit, pendingPerDay })
      console.log(
        `  추천 대상 ${r.active}곳 + 회전분 ${r.rotated}곳`
        + ` -> 갱신 ${r.updated}곳 / 실패 ${r.failed}곳`
        + ` / 정리 ${r.dropped}건 / 대표 이미지 ${r.images}곳`,
      )
      break
    }

    case 'classify': {
      const ctx = createContext()
      const limit = numFlag(rest, 'limit')
      const redoStale = flag(rest, 'redo-stale') !== undefined
      console.log(`판정 시작${limit ? ` (최대 ${limit}곳)` : ''}${redoStale ? ' · 낡은 프롬프트 재추출 포함' : ''}`)
      const order = flag(rest, 'order') === 'file' ? 'file' as const : 'hot' as const
      const r = await runClassify(ctx, { limit, redoStale, order })
      console.log(
        `  통과 ${r.classified}곳 / 배제 ${r.excluded}곳`
        + ` / 보류 ${r.skipped}곳 / 실패 ${r.failed}곳`,
      )
      if (r.skipped > 0) console.log('  보류는 화제량 수집이 먼저 필요합니다 (npm run buzz)')
      if (r.quotaExhausted) {
        console.log('  LLM 일일 쿼터가 소진되어 중단했습니다. 내일 이어서 처리됩니다.')
      }
      break
    }

    case 'suggest': {
      const ctx = createContext()
      const r = await runWeeklySuggest(ctx, { cityMode: flag(rest, 'city') !== undefined })
      if (r.picked.length === 0) {
        console.log('후보가 없습니다. discover -> buzz -> classify 를 먼저 실행하세요.')
        break
      }
      const cafes = await ctx.store.readCafes()
      console.log('\n  [심김 빵지순례 · 이번 주]\n')
      for (const s of r.picked) {
        const c = cafes.find((x) => x.kakaoPlaceId === s.kakaoPlaceId)
        const reason = s.reason as { hot?: number; tags?: string[] }
        console.log(
          `  ${s.rank}. ${c?.name ?? s.kakaoPlaceId}`
          + ` (${c?.sigungu} ${c ? driveMinutesOf(c) : '?'}분)`,
        )
        console.log(`     점수 ${s.finalScore} (핫 ${reason.hot}) · ${reason.tags?.join(' · ')}`)
        console.log(`     ${c?.naverMapUrl}`)
      }
      console.log('')
      break
    }

    case 'visited': {
      const ctx = createContext()
      const date = flag(rest, 'date')
      const note = flag(rest, 'note')
      const query = rest
        .filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--date' && rest[i - 1] !== '--note')
        .join(' ')
      if (!query) {
        die('사용법: npm run visited -- <카페 이름> [--date YYYY-MM-DD] [--note "한 줄"]')
      }
      const visitedOn = date && date !== '' ? date : new Date().toISOString().slice(0, 10)

      const cafes = await ctx.store.readCafes()
      const found = resolveCafe(cafes, query)
      if (found.kind === 'none') die(`"${query}" 을(를) 찾지 못했습니다.`)
      if (found.kind === 'many') { printCandidates(found.candidates); process.exit(1) }

      const visits = await ctx.store.readVisits()
      const dup = visits.some(
        (v) => v.kakaoPlaceId === found.cafe.kakaoPlaceId && v.visitedOn === visitedOn,
      )
      if (dup) {
        console.log(`이미 기록되어 있습니다: ${found.cafe.name} (${visitedOn})`)
        break
      }
      visits.push({
        kakaoPlaceId: found.cafe.kakaoPlaceId,
        visitedOn,
        ...(note ? { note } : {}),
      })
      await ctx.store.writeVisits(visits)
      console.log(`기록했습니다: ${found.cafe.sigungu} ${found.cafe.name} — ${visitedOn}`)
      console.log('추천에서 6개월간 내려갑니다.')
      break
    }

    case 'inspect': {
      const ctx = createContext()
      const cafes = await ctx.store.readCafes()
      const found = resolveCafe(cafes, rest.join(' '))
      if (found.kind === 'none') die('카페를 찾지 못했습니다.')
      if (found.kind === 'many') { printCandidates(found.candidates); process.exit(1) }
      const c = found.cafe

      const buzz = (await ctx.store.readBuzz())
        .filter((b) => b.kakaoPlaceId === c.kakaoPlaceId)
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]

      console.log(`\n  ${c.sigungu} ${c.name}`)
      console.log(`  상태 ${c.status}${c.excludeReason ? ` (${c.excludeReason})` : ''}`)
      console.log(`  거리 ${c.straightKm}km / 약 ${c.driveMinutesEst}분`)
      console.log(`  태그 ${c.tags.length ? c.tags.join(' · ') : '(없음 — 동네 카페)'}`)
      if (c.ambiguousName) console.log('  ! 일반명사 상호 — 오염 가능성')

      if (buzz) {
        console.log(`\n  화제량 (${buzz.capturedAt})`)
        console.log(
          `    정밀도 ${(buzz.precision * 100).toFixed(0)}%`
          + ` (${buzz.relevantCount}/${buzz.receivedCount})`,
        )
        console.log(`    월 발행률 ${buzz.postsPer30}건  기간 ${buzz.spanDays}일`)
        console.log(
          `    가속도 ${buzz.acceleration}  최근30일 ${buzz.posts30d} / 이전 ${buzz.postsPrev}`,
        )
        if (buzz.suspectAmbiguous) console.log('    ! 발행률 과다 — 일반명사 오염 의심')
      } else {
        console.log('\n  화제량 데이터 없음 (npm run buzz 필요)')
      }

      const a = c.attributes
      if (a) {
        console.log(`\n  속성 (${a.modelVersion})`)
        console.log(
          `    규모 ${a.scale} ~${a.seatsEstimate}석 ${a.floors}층`
          + `  메뉴 Lv${a.menuLevel}  주차 ${a.parkingGrade}`,
        )
        console.log(
          `    뷰 ${a.viewStrength}점 ${a.viewTypes.join(',')}`
          + `  10대 ${a.teenAppeal}점  신뢰도 ${a.confidence}`,
        )
        console.log(`\n    근거: ${a.evidence}`)
        if (a.parkingEvidence) console.log(`    주차 근거: ${a.parkingEvidence}`)
      } else {
        console.log('\n  속성 데이터 없음 (npm run classify 필요)')
      }
      console.log(`\n  네이버 ${c.naverMapUrl}`)
      console.log(`  카카오 ${c.kakaoPlaceUrl}\n`)
      break
    }

    case 'watch': {
      // 사용량 이상 감시. **API 키를 요구하지 않는다** — 감시가 키에 의존하면
      // 키가 문제일 때 감시부터 죽는다.
      const store = createJsonStore(process.env.DATA_DIR ?? 'data')
      const now = new Date()
      const [cafes, buzz, health] = await Promise.all([
        store.readCafes(), store.readBuzz(), store.readHealth(),
      ])
      const input = { cafes, buzz, health, now }
      const anomalies = detectAnomalies(input)
      console.log(formatWatch(anomalies, input))
      // alert 가 하나라도 있으면 실패로 끝낸다 — GitHub Actions 가 실패를
      // 계정 메일로 알려준다. PC 가 꺼져 있어도 닿는 유일한 경로다.
      if (anomalies.some((a) => a.level === 'alert')) process.exitCode = 1
      break
    }

    case 'audit': {
      // 정합성 감사. watch(운영 이상)와 달리 **데이터가 틀렸나**를 본다.
      // API 키를 요구하지 않는다 — 로컬 파일만 읽는다.
      const store = createJsonStore(process.env.DATA_DIR ?? 'data')
      const now = new Date()
      const [cafes, buzz] = await Promise.all([store.readCafes(), store.readBuzz()])
      const raw = await readFile(flag(rest, 'site') || 'web/src/generated/site.json', 'utf8')
      const site = SitePayloadSchema.parse(JSON.parse(raw))
      const findings = auditData({ cafes, buzz, site, now })
      console.log('\n' + formatAudit(findings, { cafes, buzz, site, now }))
      const drift = zoneDrift(cafes, site)
      if (drift.length > 0) {
        console.log(`  [!] zone_drift: 페이로드의 방향이 지금 규칙과 다른 카페 ${drift.length}곳`)
        drift.slice(0, 5).forEach((d) => console.log(`      ${d}`))
        console.log('      npm run site 로 다시 만드세요')
      }
      console.log('')
      if (findings.some((f) => f.level === 'fail') || drift.length > 0) process.exitCode = 1
      break
    }

    case 'normalize': {
      // 기존 데이터의 `sigungu` 를 주소 기준으로 맞춘다. 멱등이라 여러 번 돌려도 된다.
      //
      // 지금까지 검색한 지역이 저장돼 있었다 — 카드 표기·지도 링크·지역 묶음이
      // 어긋났다 (실측 20/299). 새로 발굴되는 카페는 toCafe 가 처리하므로
      // 이 명령은 과거 데이터를 위한 것이다.
      const store = createJsonStore(process.env.DATA_DIR ?? 'data')
      const cafes = await store.readCafes()
      const changed: string[] = []
      for (const c of cafes) {
        const next = resolveSigungu({
          roadAddress: c.roadAddress,
          address: c.address,
          scanned: c.sigungu,
        })
        if (next === c.sigungu) continue
        changed.push(`${c.sigungu} -> ${next}  ${c.name}`)
        c.sigungu = next
        c.naverMapUrl = naverMapUrl(next, c.name)
      }
      console.log(`\n  시군구 정정 ${changed.length}곳 / 전체 ${cafes.length}곳`)
      changed.slice(0, 20).forEach((l) => console.log(`    ${l}`))
      if (changed.length > 20) console.log(`    ... 외 ${changed.length - 20}곳`)
      if (changed.length === 0) {
        console.log('  고칠 것이 없습니다.\n')
      } else if (flag(rest, 'dry') === undefined) {
        await store.writeCafes(cafes)
        console.log('\n  저장했습니다. npm run site 로 페이로드를 다시 만드세요.\n')
      } else {
        console.log('\n  (--dry 이므로 저장하지 않았습니다)\n')
      }
      break
    }

    case 'health': {
      const ctx = createContext()
      const rows = await ctx.store.readHealth()
      const cafes = await ctx.store.readCafes()
      const buzz = await ctx.store.readBuzz()
      const byStatus = new Map<string, number>()
      for (const c of cafes) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1)

      console.log('\n  데이터 현황')
      console.log(`    카페 ${cafes.length}곳`)
      for (const [k, v] of [...byStatus].sort()) console.log(`      ${k.padEnd(20)} ${v}`)
      console.log(`    화제량 스냅샷 ${buzz.length}건`)

      console.log('\n  소스 상태')
      if (rows.length === 0) console.log('    (기록 없음)')
      for (const r of rows) {
        const bad = r.consecutiveFailures > 0
        console.log(`    [${bad ? 'X' : 'v'}] ${r.source.padEnd(14)} 최근성공 ${r.lastSuccessAt ?? '없음'}`)
        if (bad) console.log(`        연속실패 ${r.consecutiveFailures}회: ${r.lastError}`)
      }
      console.log('')
      break
    }

    case 'label': {
      const ctx = createContext()
      if (flag(rest, 'report') !== undefined) {
        await runLabelReport({ store: ctx.store })
        break
      }
      await runLabel(
        { store: ctx.store },
        { perStratum: numFlag(rest, 'per') ?? 10, redo: flag(rest, 'redo') !== undefined },
      )
      break
    }

    case 'drive': {
      const ctx = createContext()
      const limit = numFlag(rest, 'limit')
      const force = flag(rest, 'force') !== undefined
      console.log(`실주행 시간 측정 시작${limit ? ` (최대 ${limit}곳)` : ''}${force ? ' · 전량 재측정' : ''}`)
      const r = await runDriveTimes(ctx, { limit, force })
      console.log(`  측정 ${r.measured}곳 / 경로없음 ${r.unroutable}곳 / 실패 ${r.failed}곳`)
      break
    }

    case 'site': {
      // API 키를 요구하지 않는다 — 배포(Vercel) 빌드에서 키 없이 돌아야 한다
      const store = createJsonStore(process.env.DATA_DIR ?? 'data')
      const out = flag(rest, 'out') || 'web/src/generated/site.json'
      const now = new Date()
      const [cafes, buzz, visits, suggestions, reviews] = await Promise.all([
        store.readCafes(), store.readBuzz(),
        store.readVisits(), store.readSuggestions(), store.readReviews(),
      ])
      const payload = buildSitePayload({
        cafes, buzz, visits, suggestions, reviews, weekOf: mondayOf(now), now,
      })
      await mkdir(dirname(out), { recursive: true })
      // 2칸 들여쓰기 + 끝 개행 — git diff 를 깨끗하게 (스펙 9절)
      await writeFile(out, JSON.stringify(payload, null, 2) + '\n', 'utf8')
      console.log(
        `${out}\n  카페 ${payload.cafes.length}곳`
        + ` (일반 ${payload.stats.passed} / 도심전용 ${payload.stats.cityOnly})`
        + ` · ${payload.stats.regions}개 시군구 · 이번 주 추천 ${payload.week.length}곳`,
      )
      break
    }

    case 'notify': {
      // 문구만 만들어 보여준다. 실제 발송은 사람이 확인한 뒤 한다.
      const store = createJsonStore(process.env.DATA_DIR ?? 'data')
      const now = new Date()
      const [cafes, buzz, visits, suggestions, health, notifyLog] = await Promise.all([
        store.readCafes(), store.readBuzz(),
        store.readVisits(), store.readSuggestions(), store.readHealth(),
        store.readNotifyLog(),
      ])
      const payload = buildSitePayload({
        cafes, buzz, visits, suggestions, weekOf: mondayOf(now), now,
      })
      // 자동 수집이 도는지 매주 눈으로 확인한다 (사용자 요청).
      // 문구가 200자를 넘으면 buildNotifyText 가 카페 설명부터 줄인다 —
      // 상태 줄과 링크는 마지막까지 지킨다.
      const text = buildNotifyText({
        payload,
        baseUrl: flag(rest, 'url') || process.env.SITE_URL,
        status: statusLine(detectAnomalies({ cafes, buzz, health, notifyLog, now })),
      })
      console.log('\n' + '-'.repeat(34))
      console.log(text)
      console.log('-'.repeat(34))
      console.log(`${text.length} / ${KAKAO_TEXT_LIMIT}자\n`)

      // 발송은 카카오톡 커넥터(이 PC)가 하므로 클라우드는 그것이 나갔는지
      // 알 수 없다. 보낸 뒤 한 줄을 남겨 커밋하면 감시가 누락을 잡는다.
      if (flag(rest, 'sent') !== undefined) {
        const status = text.split('\n').at(-1) ?? ''
        const rows = [...notifyLog, { sentAt: now.toISOString(), chars: text.length, status }]
        // 12주만 보관한다 — 이력이 아니라 "최근에 나갔나" 만 알면 된다
        await store.writeNotifyLog(rows.slice(-12))
        console.log('발송 기록을 남겼습니다 (data/notify-log.json)\n')
      }
      break
    }

    case 'prune-raw': {
      // 원본 스냅샷은 하루 약 50MB 쌓인다. 동기화 폴더 안이면 클라우드까지 먹는다.
      const dataDir = process.env.DATA_DIR ?? 'data'
      const days = numFlag(rest, 'days') ?? 7
      const r = await pruneRaw(rawDirOf(dataDir), { days })
      const mb = (r.freedBytes / 1024 / 1024).toFixed(0)
      console.log(
        r.removedDays.length === 0
          ? `지울 것이 없습니다 (${days}일 보관)`
          : `${r.removedDays.length}일치 삭제 (${mb}MB): ${r.removedDays.join(', ')}`,
      )
      break
    }

    case 'hide': {
      const ctx = createContext()
      const cafes = await ctx.store.readCafes()

      if (flag(rest, 'list') !== undefined) {
        const hidden = cafes.filter((c) => c.status === 'hidden')
        console.log(`\n  숨긴 카페 ${hidden.length}곳`)
        hidden.forEach((c) => console.log(`    ${c.sigungu} ${c.name}`))
        console.log('')
        break
      }

      const restore = flag(rest, 'restore') !== undefined
      const query = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--restore').join(' ')
      const target = restore ? (flag(rest, 'restore') || query) : query
      if (!target) die('사용법: npm run hide -- <카페 이름> | --list | --restore <카페 이름>')

      const found = resolveCafe(cafes, target)
      if (found.kind === 'none') die(`"${target}" 을(를) 찾지 못했습니다.`)
      if (found.kind === 'many') { printCandidates(found.candidates); process.exit(1) }

      found.cafe.status = restore ? 'active' : 'hidden'
      if (restore) found.cafe.excludeReason = null
      await ctx.store.writeCafes(cafes)
      console.log(
        restore
          ? `복구했습니다: ${found.cafe.sigungu} ${found.cafe.name}`
          : `숨겼습니다: ${found.cafe.sigungu} ${found.cafe.name}`,
      )
      break
    }

    default:
      die(
        '사용법: tsx src/cli/run.ts'
          + ' <discover|buzz|classify|label|drive|suggest|site|notify|visited|inspect|health|watch|audit|normalize|hide>',
      )
  }
}

/**
 * data/ 를 고치는 명령은 락을 잡는다.
 *
 * 잡들이 각자 cafes.json 전체를 읽고 고쳐서 다시 쓰므로, 두 개가 겹치면
 * 나중에 쓴 쪽이 앞선 쪽 작업을 통째로 날린다. 실제로 판정(30분)과
 * 실주행 측정(2분)을 동시에 돌려 실측 298곳을 잃을 뻔했다.
 */
const MUTATING = new Set([
  'discover', 'buzz', 'classify', 'drive', 'suggest', 'visited', 'hide', 'label',
])

try {
  if (cmd && MUTATING.has(cmd)) {
    await withDataLock(process.env.DATA_DIR ?? 'data', cmd, main)
  } else {
    await main()
  }
} catch (e) {
  if (e instanceof LockBusyError) {
    die(`${e.message}
끝날 때까지 기다리거나, 죽은 작업이면 data/.lock 을 지우세요.`)
  }
  throw e
}
