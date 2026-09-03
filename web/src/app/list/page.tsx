import { payload, toListRow } from '@/lib/site'
import { readListParams } from '@/lib/url-state'
import { ListClient } from './list-client'

export const metadata = { title: '카페 전체 리스트 — 심김 빵지순례' }

/**
 * 전체 리스트. 무한 스크롤을 만들지 않는다 — 통과분이 수백 곳이라
 * 전량 렌더 + 칩 필터가 더 빠르고 코드도 없다.
 *
 * 필터를 **서버에서 읽어** 초기 상태로 넘긴다. 그래야 상세에서 뒤로
 * 돌아왔을 때 고른 칩이 처음부터 눌린 채로 그려진다 — 클라이언트에서만
 * 읽으면 한 번 깜빡이며 전체 목록이 스쳐 지나간다.
 */
export default async function ListPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  // 목록에 필요한 필드만 클라이언트로 넘긴다 (site.ts toListRow 주석 참고)
  return <ListClient cafes={payload.cafes.map(toListRow)} initial={initial} />
}
