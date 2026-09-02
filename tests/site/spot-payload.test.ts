import { describe, it, expect } from 'vitest'
import { buildSpotSitePayload, spotTrendOf, dedupeSpotListings } from '../../src/site/spot-payload.js'
import {
  SpotSitePayloadSchema, type SpotAttributes, type Spot, type SiteSpot,
} from '../../src/spot-schema.js'
import type { BuzzSnapshot, Visit, Review } from '../../src/schema.js'

const NOW = new Date('2026-09-02T00:00:00Z')

const attrs = (over: Partial<SpotAttributes> = {}): SpotAttributes => ({
  tags: ['자연/공원'], evidence: '넓고 좋다', parkingGrade: 'A', parkingEvidence: '주차장 넓음',
  stayDuration: '1~2시간', indoorOutdoor: 'outdoor', season: null,
  teenAppeal: 3, confidence: 0.9, extractedAt: NOW.toISOString(), modelVersion: 'v1',
  ...over,
})

const spot = (id: string, over: Partial<Spot> = {}): Spot => ({
  kakaoPlaceId: id, name: `공원${id}`, sigungu: '부평구', lat: 37.5, lng: 126.7,
  naverMapUrl: 'https://map.naver.com/p/search/x', kakaoPlaceUrl: 'http://place.map.kakao.com/1',
  firstSeenAt: '2026-08-01T00:00:00.000Z', status: 'active', ambiguousName: false,
  attributes: attrs(), tags: ['자연/공원'],
  ...over,
})

const buzz = (id: string, over: Partial<BuzzSnapshot> = {}): BuzzSnapshot => ({
  kakaoPlaceId: id, capturedAt: '2026-09-01',
  receivedCount: 50, relevantCount: 40, precision: 0.8,
  spanDays: 20, postsPer30: 60, posts30d: 30, postsPrev: 15,
  firstPostDate: '2026-08-01', latestPostDate: '2026-09-01',
  acceleration: 1.6, suspectAmbiguous: false,
  ...over,
})

const build = (
  spots: Spot[], buzzRows: BuzzSnapshot[],
  over: Partial<Parameters<typeof buildSpotSitePayload>[0]> = {},
) => buildSpotSitePayload({
  spots, buzz: buzzRows, visits: [], suggestions: [], reviews: [],
  weekOf: '2026-09-01', now: NOW, ...over,
})

describe('buildSpotSitePayload', () => {
  it('스키마를 만족하는 페이로드를 만든다', () => {
    const p = build([spot('1')], [buzz('1')])
    expect(() => SpotSitePayloadSchema.parse(p)).not.toThrow()
    expect(p.spots).toHaveLength(1)
  })

  it('판정 전·숨김·태그 0개는 싣지 않는다', () => {
    const p = build(
      [
        spot('1'),
        spot('2', { status: 'pending_extraction', attributes: null }),
        spot('3', { status: 'hidden' }),
        spot('4', { attributes: attrs({ tags: [] }), tags: [] }),
      ],
      ['1', '2', '3', '4'].map((id) => buzz(id)),
    )
    expect(p.spots.map((s) => s.id)).toEqual(['1'])
  })

  it('같은 이름+시군구는 하나로 합친다 (도로명 주소 있는 쪽을 남긴다)', () => {
    const dupe = spot('2', { name: '공원1', roadAddress: '인천 부평구 1' })
    const p = build([spot('1'), dupe], [buzz('1'), buzz('2')])
    expect(p.spots).toHaveLength(1)
    expect(p.spots[0]!.id).toBe('2')
  })
})

describe('spotTrendOf', () => {
  it('90일 창을 못 채우면 unknown', () => {
    expect(spotTrendOf({ posts30d: 10, postsPrev: 5, spanDays: 40 })).toBe('unknown')
  })
})

describe('dedupeSpotListings', () => {
  it('빈 목록은 빈 목록', () => {
    expect(dedupeSpotListings([], new Map())).toEqual([])
  })
})
