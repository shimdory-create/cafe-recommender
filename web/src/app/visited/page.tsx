import { payload } from '@/lib/site'
import { readListParams } from '@/lib/url-state'
import { VisitedList, type KnownCafe } from './visited-list'

export const metadata = { title: '다녀온 곳 — 심김 빵지순례' }

/**
 * 다녀온 곳 — 우리 가족의 기록.
 *
 * 빌드 타임 기록(`payload.visited`)에는 게이트에서 빠진 카페도 들어 있다.
 * 한 번 다녀온 곳이 목록에서 사라졌다고 기록까지 사라지면 안 된다.
 *
 * 여기에 방금 누른 체크를 실시간으로 합친다 — 합치지 않으면 다녀왔어요를
 * 눌러도 이 탭은 다음 배치까지 비어 있다.
 */
export default async function VisitedPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  // 실시간 기록에 이름·태그를 붙이기 위한 최소 정보만 넘긴다
  const known: KnownCafe[] = payload.cafes.map((c) => ({
    id: c.id,
    name: c.name,
    sigungu: c.sigungu,
    area: c.area,
    scale: c.scale,
    tags: c.tags,
    naverMapUrl: c.naverMapUrl,
    imageUrl: c.imageUrl,
  }))

  return (
    <div className="py-5">
      <h1 className="text-[22px] font-bold tracking-tight">다녀온 곳</h1>
      <VisitedList built={payload.visited} known={known} initial={initial} />

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        다녀온 곳은 6개월간 추천에서 내려갑니다.
        <br />
        또 가고 싶으면 전체 리스트에서 찾을 수 있어요.
      </p>
    </div>
  )
}
