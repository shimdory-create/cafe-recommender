import { payload } from '@/lib/site'

export const metadata = { title: '정보 — 심김 빵지순례' }

/** 정보 탭 — 이 목록이 어떻게 만들어지는지. 신뢰가 여기서 생긴다 */
export default function Info() {
  const at = new Date(payload.generatedAt)
  const stamp = `${at.getFullYear()}. ${at.getMonth() + 1}. ${at.getDate()}.`

  const steps: [string, string][] = [
    ['카페를 찾는다', '수도권 65개 시군구를 카카오 장소 검색으로 훑어요.'],
    ['화제량을 센다', '블로그 후기가 얼마나 빠르게 늘고 있는지 봐요. 인스타에서 뜨면 1~2주 뒤 블로그가 쏟아져요.'],
    ['후기를 읽는다', '규모·주차·메뉴·뷰를 후기 원문에서 뽑아요. 근거 인용이 없으면 버려요.'],
    ['걸러낸다', '동네 카페와 주차 안 되는 곳은 빼요. 차로 가니까요.'],
    ['순위를 매긴다', '화제량 × (거리·주차·메뉴)로 점수를 내고 높은 순으로 줄을 세워요. 10곳씩 보여주고, 마음에 드는 곳이 없으면 다음 10곳으로 넘어갈 수 있어요.'],
    ['다녀온 곳은 내린다', '별점을 남기면 다녀온 곳으로 자동 기록되고, 6개월간 추천에서 빠져요. 다녀온 곳 탭에서 빼면 다시 올라옵니다.'],
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

      <h2 className="mt-7 text-[17px] font-bold">없는 정보</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        <b className="text-ink">영업시간과 리뷰 수는 싣지 않습니다.</b> 무료로 쓸 수 있는
        공식 API 가 그 값을 주지 않아서예요. 블로그 글에서 뽑아낼 수는 있지만 절반쯤
        틀리고, 틀린 영업시간은 한 시간 운전해서 닫힌 문 앞에 서게 만듭니다. 대신 카페
        화면에 <b className="text-ink">영업시간·휴무일 확인</b> 버튼을 두었어요. 리뷰 수
        자리에는 우리가 직접 센 <b className="text-ink">블로그 글 수</b>가 들어갑니다 —
        상호가 실제로 언급된 글만 센 값입니다.
      </p>

      <p className="mt-5 text-[12px] leading-relaxed text-ink-soft">
        주차 등급은 후기에 적힌 내용만 따릅니다. &ldquo;1시간 무료&rdquo; 같은 조건부
        무료는 넉넉하다고 보지 않아요. 그래도 주말 오후에는 붐빌 수 있으니
        출발 전에 지도에서 한 번 더 확인하세요.
      </p>
    </div>
  )
}
