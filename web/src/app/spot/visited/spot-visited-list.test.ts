import { describe, it, expect } from 'vitest'
import {
  filterSpotVisited, mergeSpotVisits, spotVisitedAreas, spotVisitedTags,
  type KnownSpot,
} from './spot-visited-list'
import type { SiteSpotVisited } from '@/lib/spot-site'

const built = (over: Partial<SiteSpotVisited> & { id: string }): SiteSpotVisited => ({
  name: `장소${over.id}`,
  sigungu: '양평군',
  area: '서울',
  visitedOn: '2026-05-01',
  note: '',
  tags: ['자연'],
  naverMapUrl: 'https://map.naver.com/p/search/x',
  imageUrl: null,
  ratingAvg: 0,
  ratingCount: 0,
  ...over,
})

const known = (ids: string[]): Map<string, KnownSpot> =>
  new Map(ids.map((id) => [id, {
    id,
    name: `장소${id}`,
    sigungu: '김포시',
    area: '인천',
    tags: ['자연', '공원'],
    naverMapUrl: 'https://map.naver.com/p/search/y',
    imageUrl: null,
  }]))

describe('mergeSpotVisits', () => {
  it('방금 누른 체크를 합친다', () => {
    // 합치지 않으면 다녀왔어요를 눌러도 이 탭은 다음 배치까지 비어 있다
    const rows = mergeSpotVisits(
      [], [{ kakaoPlaceId: '1', visitedOn: '2026-08-21' }], known(['1']),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.visitedOn).toBe('2026-08-21')
    expect(rows[0]!.sigungu).toBe('김포시')
  })

  it('실시간 기록에 없는 것은 취소된 것으로 본다', () => {
    // 빌드 타임 목록과 실시간 기록은 **같은 저장소**에서 나온다. 따라서
    // 실시간에 없다는 것은 취소되었다는 뜻이다. 합집합으로 두면 취소를 눌러도
    // 다음 배포까지 카드가 남는다 (실측 버그).
    const rows = mergeSpotVisits(
      [built({ id: 'old' })],
      [{ kakaoPlaceId: 'new', visitedOn: '2026-08-21' }],
      known(['new']),
    )
    expect(rows.map((r) => r.id)).toEqual(['new'])
  })

  it('같은 장소면 더 최근 방문만 남긴다', () => {
    const rows = mergeSpotVisits(
      [built({ id: '1', visitedOn: '2026-05-01' })],
      [{ kakaoPlaceId: '1', visitedOn: '2026-08-21' }],
      known(['1']),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.visitedOn).toBe('2026-08-21')
  })

  it('최근 방문만 취소되면 그 이전 방문 날짜로 돌아간다', () => {
    // 취소는 가장 최근 1건만 지운다. 작년에 한 번 갔던 기록은 남아야 한다.
    const rows = mergeSpotVisits(
      [built({ id: '1', visitedOn: '2026-08-16' })],
      [{ kakaoPlaceId: '1', visitedOn: '2026-01-01' }],
      known(['1']),
    )
    expect(rows[0]!.visitedOn).toBe('2026-01-01')
  })

  it('같은 방문 날짜가 다시 들어와도 덮어쓰지 않는다', () => {
    // prev.visitedOn >= v.visitedOn 이면 건너뛴다 — live 배열에 같은 id 가
    // 중복으로 와도(또는 더 오래된 기록이 뒤에 와도) 먼저 채운 최신 값을 지키는지 확인한다.
    const rows = mergeSpotVisits(
      [],
      [
        { kakaoPlaceId: '1', visitedOn: '2026-08-21' },
        { kakaoPlaceId: '1', visitedOn: '2026-08-21' },
        { kakaoPlaceId: '1', visitedOn: '2026-01-01' },
      ],
      known(['1']),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.visitedOn).toBe('2026-08-21')
  })

  it('게이트에서 빠진 장소도 기록은 남는다 (known 에 없어도 built 로 폴백)', () => {
    // 가볼 곳 게이트는 엄격해서(1061곳 중 11곳만 통과) known 에서 빠지는 것이
    // 흔한 경우다. known.get(id) ?? byId.get(id) 폴백이 built 기록의
    // 이름/시군구/지역/태그로도 정상 병합되는지 확인한다.
    const rows = mergeSpotVisits(
      [built({
        id: 'gone', name: '없어진장소', sigungu: '가평군', area: '경기',
        tags: ['계곡'], naverMapUrl: 'https://map.naver.com/p/search/gone',
        imageUrl: 'https://img.example/gone.jpg',
      })],
      [{ kakaoPlaceId: 'gone', visitedOn: '2026-05-01' }],
      known([]),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('없어진장소')
    expect(rows[0]!.sigungu).toBe('가평군')
    expect(rows[0]!.area).toBe('경기')
    expect(rows[0]!.tags).toEqual(['계곡'])
    expect(rows[0]!.naverMapUrl).toBe('https://map.naver.com/p/search/gone')
    expect(rows[0]!.imageUrl).toBe('https://img.example/gone.jpg')
  })

  it('게이트에서 빠진 장소는 별점도 built 기록에서 가져온다', () => {
    const rows = mergeSpotVisits(
      [built({ id: 'gone', ratingAvg: 4.5, ratingCount: 3 })],
      [{ kakaoPlaceId: 'gone', visitedOn: '2026-05-01' }],
      known([]),
    )
    expect(rows[0]!.ratingAvg).toBe(4.5)
    expect(rows[0]!.ratingCount).toBe(3)
  })

  it('읽기가 실패하면 빌드 타임 기록을 지우지 않는다', () => {
    // 토큰이 없거나 GitHub 읽기가 실패하면 빈 배열이 온다. 그것을 믿으면
    // 가족에게는 기록이 통째로 지워진 것으로 보인다.
    const rows = mergeSpotVisits(
      [built({ id: 'a' }), built({ id: 'b' })], [], known([]), false,
    )
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('hasLive=false 면 live 를 무시하고 built 를 방문일 내림차순으로 돌려준다', () => {
    const rows = mergeSpotVisits(
      [
        built({ id: 'a', visitedOn: '2026-03-01' }),
        built({ id: 'b', visitedOn: '2026-08-01' }),
      ],
      [{ kakaoPlaceId: 'c', visitedOn: '2026-09-01' }],
      known(['c']),
      false,
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('이름을 모르는 장소는 띄우지 않는다 (빈 카드를 만들지 않는다)', () => {
    const rows = mergeSpotVisits(
      [], [{ kakaoPlaceId: '없는곳', visitedOn: '2026-08-21' }], known([]),
    )
    expect(rows).toEqual([])
  })

  it('최근 방문이 위로 온다', () => {
    const rows = mergeSpotVisits(
      [
        built({ id: 'a', visitedOn: '2026-03-01' }),
        built({ id: 'b', visitedOn: '2026-08-01' }),
        built({ id: 'c', visitedOn: '2026-06-01' }),
      ],
      [
        { kakaoPlaceId: 'a', visitedOn: '2026-03-01' },
        { kakaoPlaceId: 'b', visitedOn: '2026-08-01' },
        { kakaoPlaceId: 'c', visitedOn: '2026-06-01' },
      ],
      known([]),
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('메모를 실시간 기록에서도 가져온다', () => {
    const rows = mergeSpotVisits(
      [],
      [{ kakaoPlaceId: '1', visitedOn: '2026-08-21', note: '경치가 좋았다' }],
      known(['1']),
    )
    expect(rows[0]!.note).toBe('경치가 좋았다')
  })

  it('빈 입력에서도 던지지 않는다', () => {
    expect(mergeSpotVisits([], [], new Map())).toEqual([])
  })
})

describe('다녀온 곳 필터', () => {
  const rows: SiteSpotVisited[] = [
    built({ id: '1', name: '두물머리', area: '양평군', tags: ['공원'] }),
    built({ id: '2', name: '남산타워', area: '서울', tags: ['전망'] }),
    built({ id: '3', name: '아침고요수목원', area: '양평군', tags: ['자연', '공원'] }),
  ]

  it('지역으로 거른다', () => {
    expect(filterSpotVisited(rows, { q: '', area: '양평군', tags: [] }).map((r) => r.id))
      .toEqual(['1', '3'])
  })

  it('한 글자 상호도 검색된다', () => {
    expect(filterSpotVisited(rows, { q: '남', area: null, tags: [] }).map((r) => r.id))
      .toEqual(['2'])
  })

  it('태그는 AND 로 걸린다', () => {
    expect(filterSpotVisited(rows, { q: '', area: null, tags: ['자연', '공원'] })
      .map((r) => r.id)).toEqual(['3'])
  })

  it('있는 지역만 칩이 된다 — 빈 칩 서른 개는 장식이다', () => {
    expect(spotVisitedAreas(rows).map((a) => `${a.label}${a.count}`)).toEqual(['양평2', '서울1'])
  })

  it('기록에 붙어 있는 태그만 칩이 된다', () => {
    expect(spotVisitedTags(rows).map((t) => t.tag)).toEqual(['공원', '자연', '전망'])
  })
})
