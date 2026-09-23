import { spotPayload } from '@/lib/spot-site'
import { BackLink } from '../../cafe/[id]/back-link'
import { SpotMaybeClosedList } from '../../spot-maybe-closed-list'

export const metadata = { title: '폐업 의심 가볼 곳 — 심김 빵지순례' }

export default function SpotMaybeClosed() {
  return (
    <div className="py-5">
      <BackLink />
      <h1 className="mt-2 text-[22px] font-bold tracking-tight">폐업 의심 가볼 곳</h1>
      <p className="mt-1 text-[13px] text-ink-soft">
        카카오지도 검색에서 21일 넘게 안 보이는 곳이에요. 지도에서 직접 확인한 뒤 지워주세요 —
        다녀온 곳은 이 목록에 나오지 않아요.
      </p>
      <SpotMaybeClosedList items={spotPayload.maybeClosed} />
    </div>
  )
}
