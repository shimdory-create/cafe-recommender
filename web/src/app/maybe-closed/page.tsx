import { payload } from '@/lib/site'
import { BackLink } from '../cafe/[id]/back-link'
import { MaybeClosedList } from '../maybe-closed-list'

export const metadata = { title: '폐업 의심 카페 — 심김 빵지순례' }

export default function CafeMaybeClosed() {
  return (
    <div className="py-5">
      <BackLink />
      <h1 className="mt-2 text-[22px] font-bold tracking-tight">폐업 의심 카페</h1>
      <p className="mt-1 text-[13px] text-ink-soft">
        카카오지도 검색에서 21일 넘게 안 보이는 카페예요. 지도에서 직접 확인한 뒤 지워주세요 —
        다녀온 곳은 이 목록에 나오지 않아요.
      </p>
      <MaybeClosedList items={payload.maybeClosed} />
    </div>
  )
}
