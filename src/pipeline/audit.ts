import type { BuzzSnapshot, Cafe, SitePayload } from '../schema.js'
import { zoneOf } from '../config/zones.js'

/**
 * 정합성 감사 — "돌아가는 것처럼 보이지만 틀린" 것을 찾는다.
 *
 * 검증을 세 번 돌리면서 찾은 것들이 여기 규칙으로 남아 있다. 임시 스크립트로
 * 두면 다음에 또 손으로 만들어야 하므로 명령으로 만들었다 (`npm run audit`).
 *
 * `watch` 와 역할이 다르다:
 *   watch  — **운영** 이상 (수집이 멈췄나, 쿼터가 끊겼나). 매일 자동으로 돈다
 *   audit  — **데이터 정합성** (표시가 틀렸나, 규칙이 깨졌나). 사람이 돌린다
 *
 * API 키를 요구하지 않는다. 로컬 파일만 읽는다.
 */

export interface Finding {
  level: 'fail' | 'warn'
  code: string
  message: string
}

export interface AuditInput {
  cafes: Cafe[]
  buzz: BuzzSnapshot[]
  site: SitePayload
  now: Date
}

const SIDO = ['서울', '인천', '경기'] as const

function sidoOf(c: Cafe): string {
  return (c.roadAddress ?? c.address ?? '').slice(0, 2)
}

export function auditData(input: AuditInput): Finding[] {
  const { cafes, buzz, site, now } = input
  const out: Finding[] = []
  const fail = (code: string, message: string) => out.push({ level: 'fail', code, message })
  const warn = (code: string, message: string) => out.push({ level: 'warn', code, message })

  // --- 중복 ---
  const idCount = new Map<string, number>()
  for (const c of cafes) idCount.set(c.kakaoPlaceId, (idCount.get(c.kakaoPlaceId) ?? 0) + 1)
  const dupId = [...idCount].filter(([, n]) => n > 1)
  if (dupId.length) fail('dup_id', `카페 id 중복 ${dupId.length}건: ${dupId.slice(0, 3).map(([k]) => k)}`)

  const nameCount = new Map<string, string[]>()
  for (const r of site.cafes) {
    const k = `${r.name}|${r.sigungu}`
    nameCount.set(k, [...(nameCount.get(k) ?? []), r.id])
  }
  const dupName = [...nameCount].filter(([, v]) => v.length > 1)
  if (dupName.length) {
    fail('dup_listing', `목록에 같은 카페가 두 번: ${dupName.slice(0, 3).map(([k]) => k.split('|')[0])}`)
  }

  // --- 게이트 (표시되는 것은 태그 1개 이상, 주차 D 아님) ---
  const badGate = site.cafes.filter((r) => r.tags.length === 0 || r.parkingGrade === 'D')
  if (badGate.length) {
    fail('gate_leak', `게이트 위반이 목록에 ${badGate.length}곳: ${badGate.slice(0, 3).map((r) => r.name)}`)
  }

  // --- 시군구가 주소와 맞는가 (검색 지역이 저장된 적이 있다) ---
  const byId = new Map(cafes.map((c) => [c.kakaoPlaceId, c]))
  const wrongDistrict = site.cafes.filter((r) => {
    const src = byId.get(r.id)
    if (!src) return false
    const addr = src.roadAddress ?? src.address
    if (!addr) return false
    const m = /^(?:서울|인천|경기)\s+(\S+?[시군구])(?:\s|$)/.exec(addr.trim())
    return m ? m[1] !== r.sigungu : false
  })
  if (wrongDistrict.length) {
    fail('district_mismatch',
      `시군구가 주소와 다른 카페 ${wrongDistrict.length}곳 — npm run normalize`)
  }

  // --- 방향이 시도와 맞는가 (서울 카페가 '가까운 곳' 에 섞이면 안 된다) ---
  const wrongZone = site.cafes.filter((r) => {
    const src = byId.get(r.id)
    if (!src) return false
    const sido = sidoOf(src)
    if (sido === '서울') return r.zone !== 'seoul'
    if (sido === '인천') return !['near', 'west'].includes(r.zone)
    return r.zone === 'seoul' // 경기 카페가 서울로 가면 안 된다
  })
  if (wrongZone.length) {
    fail('zone_mismatch',
      `방향 배정이 시도와 다른 카페 ${wrongZone.length}곳: ${wrongZone.slice(0, 3).map((r) => r.name)}`)
  }

  // --- 지역이 수도권인가 ---
  const outside = cafes.filter(
    (c) => c.status === 'active' && sidoOf(c) !== '' && !SIDO.includes(sidoOf(c) as never),
  )
  if (outside.length) fail('out_of_region', `수도권 밖 active ${outside.length}곳`)

  // --- 이번 주 목록 ---
  const ids = new Set(site.cafes.map((r) => r.id))
  const missing = site.week.filter((w) => !ids.has(w.id))
  if (missing.length) fail('week_orphan', `이번 주 추천 중 목록에 없는 것 ${missing.length}곳`)

  const weekRows = site.week.map((w) => site.cafes.find((r) => r.id === w.id)).filter(Boolean)
  const perRegion = new Map<string, number>()
  for (const r of weekRows) perRegion.set(r!.sigungu, (perRegion.get(r!.sigungu) ?? 0) + 1)
  const crowded = [...perRegion].filter(([, n]) => n > 2)
  if (crowded.length) {
    warn('week_region_crowded',
      `한 주 추천에 같은 지역이 3곳 이상: ${crowded.map(([k, n]) => `${k} ${n}`)}`)
  }
  const badParking = weekRows.filter((r) => r!.parkingGrade === 'C' || r!.parkingGrade === 'D')
  if (badParking.length) {
    fail('week_parking', `추천에 주차 어려운 곳 ${badParking.map((r) => r!.name)}`)
  }

  // --- 화면에 필요한 값 ---
  const n = site.cafes.length || 1
  const noImage = site.cafes.filter((r) => !r.imageUrl).length
  if (noImage > n * 0.1) warn('image_missing', `대표 이미지 없는 카페 ${noImage}/${n}곳`)
  const noDrive = site.cafes.filter((r) => r.driveMinutes === null).length
  if (noDrive > 0) warn('drive_missing', `실주행 시간 미측정 ${noDrive}곳 — npm run drive`)
  const noEvidence = site.cafes.filter((r) => !r.evidence).length
  if (noEvidence > 0) fail('evidence_missing', `판단 근거가 빈 카페 ${noEvidence}곳`)

  // --- 추천 대상 화제량 신선도 ---
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const fresh = new Set(
    buzz.filter((b) => b.capturedAt === day(now)
      || b.capturedAt === day(new Date(now.getTime() - 86_400_000)))
      .map((b) => b.kakaoPlaceId),
  )
  const activeIds = cafes.filter((c) => c.status === 'active').map((c) => c.kakaoPlaceId)
  const stale = activeIds.filter((id) => !fresh.has(id)).length
  if (activeIds.length >= 20 && stale > activeIds.length * 0.2) {
    fail('buzz_stale', `추천 대상 ${activeIds.length}곳 중 ${stale}곳의 화제량이 낡았다`)
  }

  return out
}

/** 사람이 읽는 요약 */
export function formatAudit(findings: Finding[], input: AuditInput): string {
  const site = input.site
  const lines = [
    `정합성 감사 ${input.now.toISOString().slice(0, 10)}`,
    `  카페 ${input.cafes.length}곳 · 표시 ${site.cafes.length}곳`
    + ` (일반 ${site.stats.passed} / 도심 ${site.stats.cityOnly}) · 이번 주 ${site.week.length}곳`,
  ]
  if (findings.length === 0) {
    lines.push('  이상 없음')
    return lines.join('\n')
  }
  for (const f of findings) lines.push(`  [${f.level === 'fail' ? '!' : '~'}] ${f.code}: ${f.message}`)
  return lines.join('\n')
}

/** 배정이 바뀌었을 때를 대비한 확인용 — 페이로드의 zone 이 지금 규칙과 같은가 */
export function zoneDrift(cafes: Cafe[], site: SitePayload): string[] {
  const byId = new Map(cafes.map((c) => [c.kakaoPlaceId, c]))
  const out: string[] = []
  for (const r of site.cafes) {
    const src = byId.get(r.id)
    if (!src) continue
    const expect = zoneOf(src)
    if (expect !== r.zone) out.push(`${r.name}: 페이로드 ${r.zone} vs 규칙 ${expect}`)
  }
  return out
}
