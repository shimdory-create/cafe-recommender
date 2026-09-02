import { spotPayload, SPOT_REVISIT_DAYS } from '@/lib/spot-site'
import { readListParams } from '@/lib/url-state'
import { SpotVisitedList, type KnownSpot } from './spot-visited-list'

export const metadata = { title: '다녀온 곳 (가볼 곳) — 심김 빵지순례' }

export default async function SpotVisitedPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  const known: KnownSpot[] = spotPayload.spots.map((s) => ({
    id: s.id, name: s.name, sigungu: s.sigungu, area: s.area, tags: s.tags,
    naverMapUrl: s.naverMapUrl, imageUrl: s.imageUrl,
  }))

  return (
    <div className="py-5">
      <h1 className="text-[22px] font-bold tracking-tight">다녀온 곳</h1>
      <SpotVisitedList built={spotPayload.visited} known={known} initial={initial} />

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        다녀온 곳은 {Math.round(SPOT_REVISIT_DAYS / 30)}개월간 추천에서 내려갑니다.
        <br />
        또 가고 싶으면 전체 리스트에서 찾을 수 있어요.
      </p>
    </div>
  )
}
