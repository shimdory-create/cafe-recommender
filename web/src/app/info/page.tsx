import { payload } from '@/lib/site'

export const metadata = { title: '정보 — 우리 가족 카페' }

/** 정보 탭 — 이 목록이 어떻게 만들어지는지. 신뢰가 여기서 생긴다 */
export default function Info() {
  const at = new Date(payload.generatedAt)
  const stamp = `${at.getFullYear()}. ${at.getMonth() + 1}. ${at.getDate()}.`

  const steps: [string, string][] = [
    ['카페를 찾는다', '수도권 65개 시군구를 카카오 장소 검색으로 훑어요.'],
    ['화제량을 센다', '블로그 후기가 얼마나 빠르게 늘고 있는지 봐요. 인스타에서 뜨면 1~2주 뒤 블로그가 쏟아져요.'],
    ['후기를 읽는다', '규모·주차·메뉴·뷰를 후기 원문에서 뽑아요. 근거 인용이 없으면 버려요.'],
    ['걸러낸다', '동네 카페와 주차 안 되는 곳은 빼요. 차로 가니까요.'],
    ['3곳을 고른다', '화제량 × (거리·주차·메뉴·다녀온 지 얼마나 됐나)로 점수를 내요.'],
  ]

  const stats: [string, string][] = [
    ['찾은 카페', `${payload.stats.discovered.toLocaleString()}곳`],
    ['통과한 카페', `${payload.stats.passed}곳`],
    ['도심 전용 (주차 어려움)', `${payload.stats.cityOnly}곳`],
    ['지역', `${payload.stats.regions}개 시군구`],
    ['갱신', stamp],
  ]

  return (
    <div className="py-5 text-[14px] leading-relaxed">
      <h1 className="text-[22px] font-bold tracking-tight">이 목록은 어떻게 만들어지나</h1>

      <ol className="mt-4 flex flex-col gap-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">
              <span className="mr-1.5 text-bean">{i + 1}</span>
              {title}
            </p>
            <p className="mt-1 text-[13px] text-ink-soft">{body}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-7 text-[17px] font-bold">지금 상태</h2>
      <dl className="mt-2 overflow-hidden rounded-2xl border border-line bg-card">
        {stats.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-line px-4 py-3 last:border-0">
            <dt className="text-[13px] text-ink-soft">{k}</dt>
            <dd className="text-[13px] font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-[12px] leading-relaxed text-ink-soft">
        주차 등급은 후기에 적힌 내용만 따릅니다. &ldquo;1시간 무료&rdquo; 같은 조건부
        무료는 넉넉하다고 보지 않아요. 그래도 주말 오후에는 붐빌 수 있으니
        출발 전에 지도에서 한 번 더 확인하세요.
      </p>
    </div>
  )
}
