import Link from 'next/link'
import { payload } from '@/lib/site'

export const metadata = { title: '다녀온 곳 — 우리 가족 카페' }

function dateLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

/** 같은 해·달끼리 묶어 보여준다. "언제 갔었지" 를 훑기 좋게 */
function monthLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

/**
 * 다녀온 곳 — 우리 가족의 기록.
 *
 * 게이트에서 빠진 카페도 남는다. 한 번 다녀온 곳이 목록에서 사라졌다고
 * 기록까지 사라지면 안 된다.
 */
export default function VisitedPage() {
  const rows = payload.visited
  let lastMonth = ''

  return (
    <div className="py-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">다녀온 곳</h1>
        <span className="text-[13px] text-ink-soft">{rows.length}곳</span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-card p-5">
          <p className="text-[14px] leading-relaxed text-ink-soft">
            아직 기록이 없어요. 다녀온 카페를 체크하면 여기 모입니다.
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
            기록은 아빠가 남깁니다 —{' '}
            <code className="rounded bg-bean-soft px-1.5 py-0.5 text-bean">
              npm run visited &quot;카페 이름&quot;
            </code>
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {rows.map((v) => {
            const month = monthLabel(v.visitedOn)
            const showMonth = month !== lastMonth
            lastMonth = month
            return (
              <div key={v.id}>
                {showMonth && (
                  <p className="mb-2 mt-2 text-[13px] font-semibold text-ink-soft">{month}</p>
                )}
                <article className="overflow-hidden rounded-2xl border border-line bg-card">
                  <Link
                    href={`/cafe/${v.id}`}
                    aria-label={`${v.name} 자세히 보기`}
                    className="block px-4 pt-4 pb-3 active:bg-bean-soft/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-[17px] font-bold leading-snug">{v.name}</h2>
                      <span className="mt-0.5 shrink-0 text-[12px] text-ink-soft">
                        {dateLabel(v.visitedOn)}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-soft">
                      {v.sigungu}
                      {v.scale ? ` · ${v.scale}` : ''}
                    </p>
                    {v.tags.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {v.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-bean-soft px-2.5 py-1 text-[12px] font-medium text-bean"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {v.note && (
                      <p className="mt-3 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed">
                        {v.note}
                      </p>
                    )}
                  </Link>
                  <a
                    href={v.naverMapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-[44px] items-center justify-center border-t border-line text-[13px] font-semibold text-bean active:bg-bean-soft"
                  >
                    네이버지도로 다시 보기 ↗
                  </a>
                </article>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-soft">
        다녀온 곳은 6개월간 추천에서 내려갑니다.
        <br />
        같은 곳을 또 가고 싶으면 전체 리스트에서 찾을 수 있어요.
      </p>
    </div>
  )
}
