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
import { applyRequeue, requeueTargets } from '../jobs/requeue.js'
import { runLiveness, STALE_DAYS } from '../jobs/liveness.js'
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
import { createRestaurantJsonStore } from '../store/restaurant-json-store.js'
import { buildRestaurantSitePayload } from '../site/restaurant-payload.js'
import { buildSpotSitePayload } from '../site/spot-payload.js'
import { buildNearbyPayloads } from '../site/nearby-payload.js'
import { runRestaurantDiscover } from '../jobs/restaurant-discover.js'
import { runRestaurantDailyBuzz } from '../jobs/restaurant-daily-buzz.js'
import { runRestaurantClassify } from '../jobs/restaurant-classify.js'
import { evaluateRestaurantExclusion } from '../pipeline/restaurant-exclude.js'
import { runRestaurantWeeklySuggest } from '../jobs/restaurant-suggest.js'
import { runRestaurantLiveness } from '../jobs/restaurant-liveness.js'
import { runRestaurantDriveTimes } from '../jobs/restaurant-drive-times.js'
import { createSpotJsonStore } from '../store/spot-json-store.js'
import { runSpotDiscover } from '../jobs/spot-discover.js'
import { runSpotDailyBuzz } from '../jobs/spot-daily-buzz.js'
import { runSpotClassify } from '../jobs/spot-classify.js'
import { isFoodCategory } from '../pipeline/spot-relevance.js'
import { runSpotWeeklySuggest } from '../jobs/spot-suggest.js'
import { runSpotLiveness } from '../jobs/spot-liveness.js'
import { runSpotDriveTimes } from '../jobs/spot-drive-times.js'
import { runNearbyDriveTimes } from '../jobs/nearby-drive-times.js'
import { familyActivityIds } from '../pipeline/family-activity.js'

const argv = process.argv.slice(2)
const cmd = argv[0]
const rest = argv.slice(1)

function die(msg: string): never {
  console.error(msg)
  process.exit(1)
}

/**
 * 위시리스트·리뷰류 JSON을 읽는다. 파일이 아직 없으면(가족이 그 도메인에서
 * 아직 아무것도 안 남겼으면) 빈 배열로 본다 — 에러가 아니다.
 */
async function readIdsOrEmpty(path: string): Promise<{ kakaoPlaceId: string }[]> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return []
  }
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
      if (r.quotaExhausted) {
        console.log('  LLM 일일 쿼터가 소진되어 하베스트를 중단했습니다. 다음 회차에 이어서 처리됩니다.')
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

    case 'liveness': {
      // 폐업 감지 — 통과한 카페를 카카오에서 다시 찾아본다 (스펙 11.8)
      const ctx = createContext()
      const limit = numFlag(rest, 'limit')
      console.log(`실존 확인 시작${limit ? ` (최대 ${limit}곳)` : ''}`)
      const r = await runLiveness(ctx, { limit })
      console.log(
        `  확인 ${r.checked}곳 · 있음 ${r.seen} · 못 찾음 ${r.missing} · 실패 ${r.failed}`,
      )
      if (r.stale.length) {
        console.log(`
  ${STALE_DAYS}일 넘게 안 보이는 카페 ${r.stale.length}곳 — 폐업 의심:`)
        for (const s of r.stale.slice(0, 20)) {
          console.log(`    ${s.sigungu} ${s.name} (${s.days}일)`)
        }
        console.log('  확인 후 숨기려면: npm run hide -- "카페 이름"')
      }
      break
    }

    case 'requeue': {
      // 컷이 바뀌었을 때 이미 배제된 카페를 다시 줄에 세운다 (스펙 11.6)
      const ctx = createContext()
      const dry = flag(rest, 'dry') !== undefined
      const cafes = await ctx.store.readCafes()
      const buzz = await ctx.store.readBuzz()
      const targets = requeueTargets(cafes, buzz, new Date())
      console.log(`지금 규칙이면 통과할 배제분 ${targets.length}곳`)
      for (const c of targets.slice(0, 10)) {
        console.log(`  ${c.name} (${c.sigungu} ${c.driveMinutes ?? c.driveMinutesEst ?? '?'}분) — ${c.excludeReason}`)
      }
      if (targets.length > 10) console.log(`  … 외 ${targets.length - 10}곳`)
      if (dry) {
        console.log('  --dry 라 되돌리지 않았습니다')
        break
      }
      applyRequeue(targets)
      await ctx.store.writeCafes(cafes)
      console.log(`  ${targets.length}곳을 판정 대기로 되돌렸습니다. npm run classify 로 처리합니다`)
      break
    }

    case 'classify': {
      const ctx = createContext()
      const limit = numFlag(rest, 'limit')
      const redoStale = flag(rest, 'redo-stale') !== undefined
      console.log(`판정 시작${limit ? ` (최대 ${limit}곳)` : ''}${redoStale ? ' · 낡은 프롬프트 재추출 포함' : ''}`)
      // 기본은 mixed — 화제량 70% + 거리 30%. 집 근처가 계속 밀리는 것을 막는다
      const raw = flag(rest, 'order')
      const order = raw === 'file' || raw === 'hot' || raw === 'near' ? raw : 'mixed' as const
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

    case 'nearby-drive': {
      const base = createContext()
      const restaurantStore = createRestaurantJsonStore(base.env.DATA_DIR)
      const spotStore = createSpotJsonStore(base.env.DATA_DIR)
      const ctx = {
        store: {
          readCafes: base.store.readCafes,
          readRestaurants: restaurantStore.readRestaurants,
          readSpots: spotStore.readSpots,
          readNearbyDriveCache: base.store.readNearbyDriveCache,
          writeNearbyDriveCache: base.store.writeNearbyDriveCache,
          appendRaw: base.store.appendRaw,
          readHealth: base.store.readHealth,
          writeHealth: base.store.writeHealth,
        },
        directions: base.directions,
      }
      const budget = numFlag(rest, 'budget')
      const preLimit = numFlag(rest, 'pre-limit')
      console.log(`근처 이동시간 캐시 채우기 시작${budget ? ` (예산 ${budget}건)` : ''}`)
      const r = await runNearbyDriveTimes(ctx, { budget, preLimit })
      console.log(
        `  측정 ${r.measured}건 / 경로없음 ${r.unroutable}건 / 실패 ${r.failed}건`
        + `${r.budgetExhausted ? ' · 예산 소진(내일 이어서)' : ''}`
        + `${r.quotaExhausted ? ' · 쿼터 소진' : ''}`,
      )
      break
    }

    case 'site': {
      // API 키를 요구하지 않는다 — 배포(Vercel) 빌드에서 키 없이 돌아야 한다
      const store = createJsonStore(process.env.DATA_DIR ?? 'data')
      const out = flag(rest, 'out') || 'web/src/generated/site.json'
      const now = new Date()
      let outerRestPayload: ReturnType<typeof buildRestaurantSitePayload> | null = null
      let outerSpotPayload: ReturnType<typeof buildSpotSitePayload> | null = null
      const [cafes, buzz, visits, suggestions, reviews, health] = await Promise.all([
        store.readCafes(), store.readBuzz(),
        store.readVisits(), store.readSuggestions(), store.readReviews(),
        store.readHealth(),
      ])
      // health.json은 세 도메인 스토어가 공유하는 한 파일이라 여기서 한 번만
      // 계산해 세 페이로드에 그대로 나눠 싣는다 (notify 케이스와 같은 계산).
      const pipelineStatus = statusLine(detectAnomalies({ cafes, buzz, health, now }))
      const payload = buildSitePayload({
        cafes, buzz, visits, suggestions, reviews, weekOf: mondayOf(now), now, pipelineStatus,
      })
      await mkdir(dirname(out), { recursive: true })
      // 2칸 들여쓰기 + 끝 개행 — git diff 를 깨끗하게 (스펙 9절)
      await writeFile(out, JSON.stringify(payload, null, 2) + '\n', 'utf8')
      console.log(
        `${out}\n  카페 ${payload.cafes.length}곳`
        + ` (일반 ${payload.stats.passed} / 도심전용 ${payload.stats.cityOnly})`
        + ` · ${payload.stats.regions}개 시군구 · 이번 주 추천 ${payload.week.length}곳`,
      )

      // 식당 페이로드도 같은 case 에서 만든다 — 카페 쓰기 로직은 위에서 이미
      // 끝났고 이 아래는 순수 추가다. 실패해도 카페 site.json 은 이미 써졌다.
      // 실패를 여기서 삼키는 이유: 식당 데이터 문제로 카페 배포까지 막히면
      // 안 된다 — 이전에는 예외가 그대로 위로 던져져서 build:web 전체가
      // 실패했다. 커밋된 site-restaurant.json 이 마지막으로 성공한 페이로드로
      // 남아 있으니 next build 는 그것으로 계속 진행한다.
      try {
        const restStore = createRestaurantJsonStore(process.env.DATA_DIR ?? 'data')
        const restOut = flag(rest, 'restaurant-out') || 'web/src/generated/site-restaurant.json'
        const [restaurants, restBuzz, restVisits, restSuggestions, restReviews] = await Promise.all([
          restStore.readRestaurants(), restStore.readRestaurantBuzz(),
          restStore.readRestaurantVisits(), restStore.readRestaurantSuggestions(),
          restStore.readRestaurantReviews(),
        ])
        const restPayload = buildRestaurantSitePayload({
          restaurants, buzz: restBuzz, visits: restVisits, suggestions: restSuggestions,
          reviews: restReviews, weekOf: mondayOf(now), now, pipelineStatus,
        })
        outerRestPayload = restPayload
        await mkdir(dirname(restOut), { recursive: true })
        await writeFile(restOut, JSON.stringify(restPayload, null, 2) + '\n', 'utf8')
        console.log(
          `${restOut}\n  식당 ${restPayload.restaurants.length}곳`
          + ` (일반 ${restPayload.stats.passed} / 도심전용 ${restPayload.stats.cityOnly})`,
        )
      } catch (e) {
        console.error(`[!] 식당 페이로드 생성 실패 — 카페 빌드는 계속 진행한다: ${(e as Error).message}`)
      }

      // 가볼 곳 페이로드도 같은 case 에서 만든다 — 독립된 try/catch로 감싼다.
      // 가볼 곳 데이터 문제가 카페·식당 빌드를 막으면 안 된다(식당과 같은 이유).
      try {
        const spotStore = createSpotJsonStore(process.env.DATA_DIR ?? 'data')
        const spotOut = flag(rest, 'spot-out') || 'web/src/generated/site-spot.json'
        const [spots, spotBuzz, spotVisits, spotSuggestions, spotReviews] = await Promise.all([
          spotStore.readSpots(), spotStore.readSpotBuzz(),
          spotStore.readSpotVisits(), spotStore.readSpotSuggestions(),
          spotStore.readSpotReviews(),
        ])
        const spotPayload = buildSpotSitePayload({
          spots, buzz: spotBuzz, visits: spotVisits, suggestions: spotSuggestions,
          reviews: spotReviews, weekOf: mondayOf(now), now, pipelineStatus,
        })
        outerSpotPayload = spotPayload
        await mkdir(dirname(spotOut), { recursive: true })
        await writeFile(spotOut, JSON.stringify(spotPayload, null, 2) + '\n', 'utf8')
        console.log(
          `${spotOut}\n  가볼 곳 ${spotPayload.spots.length}곳`
          + ` (일반 ${spotPayload.stats.passed} / 도심전용 ${spotPayload.stats.cityOnly})`,
        )
      } catch (e) {
        console.error(`[!] 가볼 곳 페이로드 생성 실패 — 카페·식당 빌드는 계속 진행한다: ${(e as Error).message}`)
      }

      // 근처 추천 3파일 — 카페·식당·가볼 곳 페이로드가 전부 준비된 뒤에만
      // 계산 가능하다. 실패해도 위에서 이미 써진 세 페이로드는 그대로 —
      // 식당·가볼 곳 페이로드 실패 처리와 같은 이유(독립 try/catch).
      try {
        const cafeNearbyOut = flag(rest, 'cafe-nearby-out') || 'web/src/generated/site-cafe-nearby.json'
        const restNearbyOut = flag(rest, 'restaurant-nearby-out') || 'web/src/generated/site-restaurant-nearby.json'
        const spotNearbyOut = flag(rest, 'spot-nearby-out') || 'web/src/generated/site-spot-nearby.json'
        const driveCache = await store.readNearbyDriveCache()
        const nearby = buildNearbyPayloads({
          cafeSite: payload.cafes,
          restaurantSite: outerRestPayload?.restaurants ?? [],
          spotSite: outerSpotPayload?.spots ?? [],
          driveCache,
          preLimit: 10,
          limit: 5,
        })
        await writeFile(cafeNearbyOut, JSON.stringify(nearby.cafe, null, 2) + '\n', 'utf8')
        await writeFile(restNearbyOut, JSON.stringify(nearby.restaurant, null, 2) + '\n', 'utf8')
        await writeFile(spotNearbyOut, JSON.stringify(nearby.spot, null, 2) + '\n', 'utf8')
        console.log(
          `근처 추천 3파일 생성 완료 (카페 ${Object.keys(nearby.cafe).length}곳 `
          + `· 식당 ${Object.keys(nearby.restaurant).length}곳 `
          + `· 가볼 곳 ${Object.keys(nearby.spot).length}곳)`,
        )
      } catch (e) {
        console.error(`[!] 근처 추천 계산 실패 — 다른 페이로드는 이미 써졌다: ${(e as Error).message}`)
      }
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
      const pipelineStatus = statusLine(detectAnomalies({ cafes, buzz, health, now }))
      const payload = buildSitePayload({
        cafes, buzz, visits, suggestions, weekOf: mondayOf(now), now, pipelineStatus,
      })
      // 자동 수집이 도는지 매주 눈으로 확인한다 (사용자 요청).
      // 문구가 200자를 넘으면 buildNotifyText 가 카페 설명부터 줄인다 —
      // 상태 줄과 링크는 마지막까지 지킨다.
      const text = buildNotifyText({
        payload,
        baseUrl: flag(rest, 'url') || process.env.SITE_URL,
        status: pipelineStatus,
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

    case 'restaurant-discover': {
      const base = createContext()
      const ctx = {
        store: createRestaurantJsonStore(base.env.DATA_DIR),
        local: base.local,
        blog: base.blog,
        llm: base.llm,
      }
      // --pilot: 처음엔 가까운 시군구 5곳만 스캔한다 (파일럿 지역, Task 15).
      const PILOT_SIGUNGU = ['부평구', '계양구', '서구', '김포시', '검단구']
      const regions = flag(rest, 'pilot') !== undefined
        ? REGIONS.filter((r) => !r.excluded && PILOT_SIGUNGU.includes(r.sigungu))
        : REGIONS.filter((r) => !r.excluded)
      const skipHarvest = flag(rest, 'skip-harvest') !== undefined
      console.log(`식당 발굴 시작 (${regions.length}개 지역)`)
      const r = await runRestaurantDiscover(ctx, { regions, skipHarvest })
      console.log(`  발굴 ${r.discovered}곳 · 제외 ${r.excluded}곳 · 동명지역 ${r.offRegion}곳`)
      if (r.quotaExhausted) {
        console.log('  LLM 일일 쿼터가 소진되어 하베스트를 중단했습니다. 다음 회차에 이어서 처리됩니다.')
      }
      break
    }

    case 'restaurant-buzz': {
      const base = createContext()
      const ctx = {
        store: createRestaurantJsonStore(base.env.DATA_DIR),
        blog: base.blog,
      }
      const limit = numFlag(rest, 'limit')
      const r = await runRestaurantDailyBuzz(ctx, { limit })
      console.log(`  갱신 ${r.updated}곳 · 실패 ${r.failed}곳 · 이미지 ${r.images}곳`)
      break
    }

    case 'restaurant-classify': {
      const base = createContext()
      const ctx = {
        store: createRestaurantJsonStore(base.env.DATA_DIR),
        blog: base.blog,
        llm: base.llm,
      }
      const limit = numFlag(rest, 'limit')
      const redoStale = flag(rest, 'redo') !== undefined
      const r = await runRestaurantClassify(ctx, { limit, redoStale })
      console.log(`  판정 ${r.classified}곳 · 제외 ${r.excluded}곳 · 실패 ${r.failed}곳`)
      if (r.quotaExhausted) console.log('  쿼터 소진으로 중단')
      break
    }

    case 'restaurant-declassify-cafe': {
      // 카카오 분류가 카페인데 이미 active/pending_extraction으로 저장된
      // 기존 데이터를 정리한다 — evaluateRestaurantExclusion에 '카페' 키워드를
      // 추가한 것은 새로 들어오는 것만 막는다. 멱등이라 여러 번 돌려도 된다.
      const store = createRestaurantJsonStore(process.env.DATA_DIR ?? 'data')
      const dataDir = process.env.DATA_DIR ?? 'data'
      const blacklist = await store.readBlacklist()
      const restaurants = await store.readRestaurants()
      // 분류만 보고 자동 배제하기 전에, 가족이 이미 남긴 기록이 있으면
      // 건너뛰고 사람이 보게 한다 — 카테고리가 맞아도 조용히 지우지 않는다.
      const activeIds = familyActivityIds([
        await readIdsOrEmpty(`${dataDir}/restaurant-wishlist.json`),
        await store.readRestaurantReviews(),
        await store.readRestaurantVisits(),
        await readIdsOrEmpty(`${dataDir}/restaurant-user-blacklist.json`),
      ])
      const changed: string[] = []
      const skippedWithActivity: string[] = []
      for (const r2 of restaurants) {
        if (r2.status !== 'active' && r2.status !== 'pending_extraction') continue
        const reason = evaluateRestaurantExclusion(
          { name: r2.name, categoryName: r2.categoryName ?? '' }, blacklist,
        )
        if (reason !== 'category' || !(r2.categoryName ?? '').includes('카페')) continue
        if (activeIds.has(r2.kakaoPlaceId)) {
          skippedWithActivity.push(`${r2.name} (${r2.categoryName}) — ${r2.kakaoPlaceId}`)
          continue
        }
        changed.push(`${r2.status} -> excluded_auto  ${r2.name} (${r2.categoryName})`)
        r2.status = 'excluded_auto'
        r2.excludeReason = '카페로 분류됨 (식당 아니다)'
      }
      console.log(`\n  카페 분류 정리 ${changed.length}곳 / 전체 ${restaurants.length}곳`)
      changed.slice(0, 30).forEach((l) => console.log(`    ${l}`))
      if (changed.length > 30) console.log(`    ... 외 ${changed.length - 30}곳`)
      if (skippedWithActivity.length > 0) {
        console.log(`\n  [!] 가족 기록이 있어 건너뛴 곳 ${skippedWithActivity.length}곳 — 직접 확인하세요:`)
        skippedWithActivity.forEach((l) => console.log(`    ${l}`))
      }
      if (changed.length === 0) {
        console.log(skippedWithActivity.length > 0 ? '' : '  고칠 것이 없습니다.\n')
      } else if (flag(rest, 'dry') === undefined) {
        await store.writeRestaurants(restaurants)
        console.log('\n  저장했습니다. npm run site 로 페이로드를 다시 만드세요.\n')
      } else {
        console.log('\n  (--dry 이므로 저장하지 않았습니다)\n')
      }
      break
    }

    case 'restaurant-suggest': {
      const base = createContext()
      const ctx = {
        store: createRestaurantJsonStore(base.env.DATA_DIR),
      }
      const r = await runRestaurantWeeklySuggest(ctx)
      console.log(`  후보 ${r.picked.length}곳 선정`)
      break
    }

    case 'restaurant-liveness': {
      const base = createContext()
      const ctx = {
        store: createRestaurantJsonStore(base.env.DATA_DIR),
        local: base.local,
      }
      const limit = numFlag(rest, 'limit')
      const r = await runRestaurantLiveness(ctx, { limit })
      console.log(`  확인 ${r.checked}곳 · 있음 ${r.seen} · 못 찾음 ${r.missing}`)
      if (r.stale.length) {
        console.log(`  폐업 의심 ${r.stale.length}곳:`)
        for (const s of r.stale.slice(0, 20)) console.log(`    ${s.sigungu} ${s.name} (${s.days}일)`)
      }
      break
    }

    case 'restaurant-drive': {
      const base = createContext()
      const ctx = {
        store: createRestaurantJsonStore(base.env.DATA_DIR),
        directions: base.directions,
      }
      const limit = numFlag(rest, 'limit')
      const force = flag(rest, 'force') !== undefined
      const r = await runRestaurantDriveTimes(ctx, { limit, force })
      console.log(`  측정 ${r.measured}곳 / 경로없음 ${r.unroutable}곳`)
      break
    }

    case 'spot-discover': {
      const base = createContext()
      const ctx = {
        store: createSpotJsonStore(base.env.DATA_DIR),
        local: base.local,
        blog: base.blog,
        llm: base.llm,
      }
      // --pilot: 처음엔 가까운 시군구 5곳만 스캔한다 (파일럿 지역, 설계 문서 4절).
      const PILOT_SIGUNGU = ['부평구', '계양구', '서구', '김포시', '검단구']
      const regions = flag(rest, 'pilot') !== undefined
        ? REGIONS.filter((r) => !r.excluded && PILOT_SIGUNGU.includes(r.sigungu))
        : REGIONS.filter((r) => !r.excluded)
      const skipHarvest = flag(rest, 'skip-harvest') !== undefined
      console.log(`가볼 곳 발굴 시작 (${regions.length}개 지역)`)
      const r = await runSpotDiscover(ctx, { regions, skipHarvest })
      console.log(`  발굴 ${r.discovered}곳 · 동명지역 ${r.offRegion}곳 · 음식점 제외 ${r.foodCategory}곳`)
      if (r.quotaExhausted) {
        console.log('  LLM 일일 쿼터가 소진되어 하베스트를 중단했습니다. 다음 회차에 이어서 처리됩니다.')
      }
      break
    }

    case 'spot-buzz': {
      const base = createContext()
      const ctx = {
        store: createSpotJsonStore(base.env.DATA_DIR),
        blog: base.blog,
      }
      const limit = numFlag(rest, 'limit')
      const r = await runSpotDailyBuzz(ctx, { limit })
      console.log(`  갱신 ${r.updated}곳 · 실패 ${r.failed}곳 · 이미지 ${r.images}곳`)
      break
    }

    case 'spot-classify': {
      const base = createContext()
      const ctx = {
        store: createSpotJsonStore(base.env.DATA_DIR),
        blog: base.blog,
        llm: base.llm,
      }
      const limit = numFlag(rest, 'limit')
      const redoStale = flag(rest, 'redo') !== undefined
      const r = await runSpotClassify(ctx, { limit, redoStale })
      console.log(`  판정 ${r.classified}곳 · 제외 ${r.excluded}곳 · 실패 ${r.failed}곳`)
      if (r.quotaExhausted) console.log('  쿼터 소진으로 중단')
      break
    }

    case 'spot-declassify-food': {
      // 카카오 분류가 음식점(카페 포함)인데 이미 active/pending_extraction으로
      // 저장된 기존 데이터를 정리한다 — discover/classify에 넣은 필터는
      // 새로 들어오는 것만 막는다. 멱등이라 여러 번 돌려도 된다.
      const store = createSpotJsonStore(process.env.DATA_DIR ?? 'data')
      const dataDir = process.env.DATA_DIR ?? 'data'
      const spots = await store.readSpots()
      // 분류만 보고 자동 배제하기 전에, 가족이 이미 남긴 기록이 있으면
      // 건너뛰고 사람이 보게 한다 — 카테고리가 맞아도 조용히 지우지 않는다.
      const activeIds = familyActivityIds([
        await readIdsOrEmpty(`${dataDir}/spot-wishlist.json`),
        await store.readSpotReviews(),
        await store.readSpotVisits(),
        await readIdsOrEmpty(`${dataDir}/spot-user-blacklist.json`),
      ])
      const changed: string[] = []
      const skippedWithActivity: string[] = []
      for (const s of spots) {
        if (s.status !== 'active' && s.status !== 'pending_extraction') continue
        if (!isFoodCategory(s.categoryName)) continue
        if (activeIds.has(s.kakaoPlaceId)) {
          skippedWithActivity.push(`${s.name} (${s.categoryName}) — ${s.kakaoPlaceId}`)
          continue
        }
        changed.push(`${s.status} -> excluded_auto  ${s.name} (${s.categoryName})`)
        s.status = 'excluded_auto'
        s.excludeReason = '음식점으로 분류됨 (가볼 곳 아님)'
      }
      console.log(`\n  음식점 분류 정리 ${changed.length}곳 / 전체 ${spots.length}곳`)
      changed.slice(0, 30).forEach((l) => console.log(`    ${l}`))
      if (changed.length > 30) console.log(`    ... 외 ${changed.length - 30}곳`)
      if (skippedWithActivity.length > 0) {
        console.log(`\n  [!] 가족 기록이 있어 건너뛴 곳 ${skippedWithActivity.length}곳 — 직접 확인하세요:`)
        skippedWithActivity.forEach((l) => console.log(`    ${l}`))
      }
      if (changed.length === 0) {
        console.log(skippedWithActivity.length > 0 ? '' : '  고칠 것이 없습니다.\n')
      } else if (flag(rest, 'dry') === undefined) {
        await store.writeSpots(spots)
        console.log('\n  저장했습니다. npm run site 로 페이로드를 다시 만드세요.\n')
      } else {
        console.log('\n  (--dry 이므로 저장하지 않았습니다)\n')
      }
      break
    }

    case 'spot-suggest': {
      const base = createContext()
      const ctx = {
        store: createSpotJsonStore(base.env.DATA_DIR),
      }
      const r = await runSpotWeeklySuggest(ctx)
      console.log(`  후보 ${r.picked.length}곳 선정`)
      break
    }

    case 'spot-liveness': {
      const base = createContext()
      const ctx = {
        store: createSpotJsonStore(base.env.DATA_DIR),
        local: base.local,
      }
      const limit = numFlag(rest, 'limit')
      const r = await runSpotLiveness(ctx, { limit })
      console.log(`  확인 ${r.checked}곳 · 있음 ${r.seen} · 못 찾음 ${r.missing}`)
      if (r.stale.length) {
        console.log(`  폐업 의심 ${r.stale.length}곳:`)
        for (const s of r.stale.slice(0, 20)) console.log(`    ${s.sigungu} ${s.name} (${s.days}일)`)
      }
      break
    }

    case 'spot-drive': {
      const base = createContext()
      const ctx = {
        store: createSpotJsonStore(base.env.DATA_DIR),
        directions: base.directions,
      }
      const limit = numFlag(rest, 'limit')
      const force = flag(rest, 'force') !== undefined
      const r = await runSpotDriveTimes(ctx, { limit, force })
      console.log(`  측정 ${r.measured}곳 / 경로없음 ${r.unroutable}곳`)
      break
    }

    default:
      die(
        '사용법: tsx src/cli/run.ts'
          + ' <discover|buzz|classify|label|drive|suggest|site|notify|visited|inspect|health|watch|audit|normalize|hide'
          + '|restaurant-discover|restaurant-buzz|restaurant-classify|restaurant-suggest'
          + '|restaurant-liveness|restaurant-drive|restaurant-declassify-cafe'
          + '|spot-discover|spot-buzz|spot-classify|spot-suggest|spot-liveness|spot-drive'
          + '|spot-declassify-food>',
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
  'restaurant-discover', 'restaurant-buzz', 'restaurant-classify', 'restaurant-drive', 'restaurant-suggest',
  'restaurant-liveness', 'restaurant-declassify-cafe',
  'spot-discover', 'spot-buzz', 'spot-classify', 'spot-drive', 'spot-suggest', 'spot-liveness',
  'spot-declassify-food',
  'nearby-drive',
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
