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
 *   npm run visited    -- <카페 이름> [--date YYYY-MM-DD]
 *   npm run inspect    -- <카페 이름>
 *   npm run health
 *   npm run hide       -- <카페 이름> | --list | --restore <카페 이름>
 */
import { createContext, flag, numFlag } from './context.js'
import { createJsonStore } from '../store/json-store.js'
import { resolveCafe, printCandidates } from './resolve.js'
import { scanTargets, REGIONS } from '../config/regions.js'
import { runDiscover } from '../jobs/weekly-discover.js'
import { runDailyBuzz } from '../jobs/daily-buzz.js'
import { runClassify } from '../jobs/classify.js'
import { runWeeklySuggest } from '../jobs/weekly-suggest.js'
import { runDriveTimes } from '../jobs/drive-times.js'
import { runLabel, runLabelReport } from './label.js'
import { buildSitePayload } from '../site/payload.js'
import { buildNotifyText, KAKAO_TEXT_LIMIT } from '../site/notify.js'
import { mondayOf } from '../jobs/weekly-suggest.js'
import { mkdir, writeFile } from 'node:fs/promises'
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
      console.log(`화제량 수집 시작${limit ? ` (최대 ${limit}곳)` : ''}`)
      const r = await runDailyBuzz(ctx, { limit })
      console.log(`  갱신 ${r.updated}곳 / 실패 ${r.failed}곳 / 정리 ${r.dropped}건`)
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
      console.log('\n  [이번 주 추천 카페]\n')
      for (const s of r.picked) {
        const c = cafes.find((x) => x.kakaoPlaceId === s.kakaoPlaceId)
        const reason = s.reason as { hot?: number; tags?: string[] }
        console.log(
          `  ${s.rank}. ${c?.name ?? s.kakaoPlaceId} (${c?.sigungu} ${c?.driveMinutesEst}분)`,
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
      const query = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--date').join(' ')
      if (!query) die('사용법: npm run visited -- <카페 이름> [--date YYYY-MM-DD]')
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
      visits.push({ kakaoPlaceId: found.cafe.kakaoPlaceId, visitedOn })
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
      const [cafes, buzz, visits, suggestions] = await Promise.all([
        store.readCafes(), store.readBuzz(),
        store.readVisits(), store.readSuggestions(),
      ])
      const payload = buildSitePayload({
        cafes, buzz, visits, suggestions, weekOf: mondayOf(now), now,
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
      const [cafes, buzz, visits, suggestions] = await Promise.all([
        store.readCafes(), store.readBuzz(),
        store.readVisits(), store.readSuggestions(),
      ])
      const payload = buildSitePayload({
        cafes, buzz, visits, suggestions, weekOf: mondayOf(now), now,
      })
      const text = buildNotifyText({
        payload,
        baseUrl: flag(rest, 'url') || process.env.SITE_URL,
        accessCode: process.env.ACCESS_CODE,
      })
      console.log('\n' + '-'.repeat(34))
      console.log(text)
      console.log('-'.repeat(34))
      console.log(`${text.length} / ${KAKAO_TEXT_LIMIT}자\n`)
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
          + ' <discover|buzz|classify|label|drive|suggest|site|notify|visited|inspect|health|hide>',
      )
  }
}

await main()
