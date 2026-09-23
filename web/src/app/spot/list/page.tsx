import { spotPayload, toSpotListRow } from '@/lib/spot-site'
import { readListParams } from '@/lib/url-state'
import { SpotListClient } from './spot-list-client'

export const metadata = { title: '가볼 곳 전체 리스트 — 심김 빵지순례' }

export default async function SpotListPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const initial = readListParams(await searchParams)
  return (
    <SpotListClient
      spots={spotPayload.spots.map(toSpotListRow)}
      initial={initial}
      maybeClosed={spotPayload.maybeClosed}
    />
  )
}
