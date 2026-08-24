import { describe, it, expect } from 'vitest'
import { auditData, type AuditInput } from '../../src/pipeline/audit.js'
import type { Cafe, SiteCafe, SitePayload } from '../../src/schema.js'

const NOW = new Date('2026-08-21T12:00:00Z')

const cafe = (over: Partial<Cafe> & { kakaoPlaceId: string }): Cafe => ({
  name: '카페',
  sigungu: '양평군',
  roadAddress: '경기 양평군 서종면 1',
  lat: 37.5,
  lng: 127.4,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  ambiguousName: false,
  tags: ['대형카페'],
  ...over,
} as Cafe)

const row = (over: Partial<SiteCafe> & { id: string }): SiteCafe => ({
  name: '카페',
  sigungu: '양평군',
  zone: 'east',
  area: '양평군',
  driveMinutes: 60,
  scale: '대형',
  parkingGrade: 'A',
  menuLevel: 2,
  tags: ['대형카페'],
  evidence: '근거',
  parkingEvidence: 'p',
  signatureMenu: null,
  viewTypes: [],
  mealTypes: [],
  outdoorSeating: null,
  teenAppeal: null,
  stayDuration: null,
  naverMapUrl: 'https://map.naver.com/p/search/x',
  kakaoPlaceUrl: null,
  imageUrl: 'https://img/1',
  hotScore: 50,
  finalScore: 25,
  postsPer30: 60,
  posts30: 60,
  posts90: 100,
  acceleration: 1.2,
  trend: 'steady',
  ratingAvg: 0,
  ratingCount: 0,
  familyReviews: [],
  cityOnly: false,
  visitedOn: null,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  isNew: false,
  ...over,
})

function input(over: Partial<AuditInput> = {}): AuditInput {
  const cafes = [cafe({ kakaoPlaceId: '1' })]
  const site: SitePayload = {
    generatedAt: NOW.toISOString(),
    weekOf: '2026-08-17',
    week: [{ rank: 1, id: '1', finalScore: 25 }],
    cafes: [row({ id: '1' })],
    visited: [],
    stats: { discovered: 1, passed: 1, regions: 1, scannedRegions: 69, driveMeasured: 1, cityOnly: 0 },
  }
  return {
    cafes,
    buzz: [{
      kakaoPlaceId: '1', capturedAt: '2026-08-21', receivedCount: 50, relevantCount: 40,
      precision: 0.8, spanDays: 90, postsPer30: 60, posts30d: 60, postsPrev: 40,
      firstPostDate: '2026-01-01', latestPostDate: '2026-08-20', acceleration: 1.2,
      suspectAmbiguous: false,
    }],
    site,
    now: NOW,
    ...over,
  }
}

describe('auditData', () => {
  it('정상 데이터에서는 아무것도 지적하지 않는다', () => {
    expect(auditData(input())).toEqual([])
  })

  it('지역 묶음이 주소와 어긋나면 잡는다', () => {
    // 화면의 지역 칩이 이 값에서 나온다. 서울 카페가 김포 칩에 들어가면
    // 김포를 눌러 나온 목록으로 운전해 간다
    const out = auditData(input({
      site: {
        ...input().site,
        cafes: [row({ id: '1', area: '김포시' })],
      },
    }))
    expect(out.map((f) => f.code)).toContain('area_mismatch')
  })

  it('목록에 같은 카페가 두 번 있으면 잡는다', () => {
    const i = input()
    i.site.cafes = [row({ id: '1' }), row({ id: '2' })] // 같은 이름·지역
    i.cafes = [cafe({ kakaoPlaceId: '1' }), cafe({ kakaoPlaceId: '2' })]
    expect(auditData(i).some((f) => f.code === 'dup_listing' && f.level === 'fail')).toBe(true)
  })

  it('시군구가 주소와 다르면 잡는다 (검색 지역이 저장된 적이 있다)', () => {
    const i = input()
    i.site.cafes = [row({ id: '1', sigungu: '양평군' })]
    i.cafes = [cafe({ kakaoPlaceId: '1', roadAddress: '경기 남양주시 화도읍 1' })]
    const f = auditData(i).find((x) => x.code === 'district_mismatch')
    expect(f?.level).toBe('fail')
    expect(f?.message).toContain('normalize')
  })

  it('서울 카페가 다른 방향에 배정되면 잡는다', () => {
    const i = input()
    i.cafes = [cafe({ kakaoPlaceId: '1', sigungu: '종로구', roadAddress: '서울 종로구 1' })]
    i.site.cafes = [row({ id: '1', sigungu: '종로구', zone: 'near' })]
    expect(auditData(i).some((f) => f.code === 'zone_mismatch')).toBe(true)
  })

  it('게이트 위반이 목록에 있으면 잡는다', () => {
    const i = input()
    i.site.cafes = [row({ id: '1', tags: [] })]
    expect(auditData(i).some((f) => f.code === 'gate_leak')).toBe(true)
  })

  it('추천에 주차 어려운 곳이 있으면 잡는다', () => {
    const i = input()
    i.site.cafes = [row({ id: '1', parkingGrade: 'C', cityOnly: true })]
    expect(auditData(i).some((f) => f.code === 'week_parking')).toBe(true)
  })

  it('한 주 추천에 같은 지역이 3곳이면 경고한다', () => {
    const i = input()
    i.cafes = ['1', '2', '3'].map((id) => cafe({ kakaoPlaceId: id }))
    i.site.cafes = ['1', '2', '3'].map((id) => row({ id, name: `카페${id}` }))
    i.site.week = ['1', '2', '3'].map((id, n) => ({ rank: n + 1, id, finalScore: 30 - n }))
    const f = auditData(i).find((x) => x.code === 'week_region_crowded')
    expect(f?.level).toBe('warn')
  })

  it('이번 주 추천이 목록에 없으면 잡는다', () => {
    const i = input()
    i.site.week = [{ rank: 1, id: '없는id', finalScore: 10 }]
    expect(auditData(i).some((f) => f.code === 'week_orphan')).toBe(true)
  })

  it('근거 인용이 비면 잡는다 — 근거 없는 목록은 신뢰가 없다', () => {
    const i = input()
    i.site.cafes = [row({ id: '1', evidence: '' })]
    expect(auditData(i).some((f) => f.code === 'evidence_missing')).toBe(true)
  })

  it('추천 대상이 20곳 미만이면 화제량 신선도를 따지지 않는다 (초기 상태)', () => {
    const i = input()
    i.buzz = []
    expect(auditData(i).some((f) => f.code === 'buzz_stale')).toBe(false)
  })
})
