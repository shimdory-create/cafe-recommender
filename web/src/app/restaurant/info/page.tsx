import { restaurantPayload, RESTAURANT_REVISIT_DAYS } from '@/lib/restaurant-site'
import { VIEW_ONLY } from '@/lib/view-only'
import { CHANGELOG } from '@/lib/changelog'

export const metadata = { title: '식당 정보 — 심김 빵지순례' }

export default function RestaurantInfo() {
  const at = new Date(restaurantPayload.generatedAt)
  const stamp = `${at.getFullYear()}. ${at.getMonth() + 1}. ${at.getDate()}.`
  const { stats } = restaurantPayload
  const shown = stats.passed + stats.cityOnly

  const steps: [string, React.ReactNode][] = [
    ['식당을 찾는다',
      `수도권 ${stats.scannedRegions}개 시군구를 카카오 장소 검색으로 훑어요.`],
    ['화제량을 센다', (
      <>
        블로그 후기가 얼마나 빠르게 늘고 있는지 봐요. 카페와 같은 방식이에요 —{' '}
        <b className="text-ink">집에서 가까운 곳은 기준을 낮춰서</b> 봐요.
      </>
    )],
    ['후기를 읽는다', '음식종류·룸·예약·주차를 후기 원문에서 뽑아요. 근거 인용이 없으면 버려요.'],
    ['걸러낸다', '프랜차이즈·패스트푸드, 배달·포장 전용, 술집·호프, 주차 안 되는 곳은 빼요.'],
    ['거리를 잰다', '집(인천 부평)에서 카카오 길찾기로 실제 운전 시간을 재요.'],
    ['순위를 매긴다', (
      <>
        화제량 × (거리·주차·룸/예약)로 점수를 내고 높은 순으로 줄을 세워요.{' '}
        부모님 모시고 가거나 웨이팅 없이 가고 싶을 때를 위해{' '}
        <b className="text-ink">룸이 있거나 예약이 되는 곳</b>에 가산점을 줘요.
      </>
    )],
    ['다녀온 곳은 내린다',
      `별점을 남기면 다녀온 곳으로 자동 기록되고, ${Math.round(RESTAURANT_REVISIT_DAYS / 30)}개월간 추천에서 빠져요.`],
  ]

  const stats2: [string, string][] = [
    ['찾은 식당', `${stats.discovered.toLocaleString()}곳`],
    ['전체 탭에 보이는 식당', `${stats.passed.toLocaleString()}곳`],
    ['「도심 포함」 을 켜면', `${shown.toLocaleString()}곳 (+${stats.cityOnly})`],
    ['운전 시간 실측', `${stats.driveMeasured.toLocaleString()} / ${shown.toLocaleString()}곳`],
    ['훑는 지역', `${stats.scannedRegions}개 시군구`],
    ['식당이 있는 지역', `${stats.regions}개 시군구`],
    ['갱신', stamp],
  ]

  const marks: [string, React.ReactNode][] = [
    ['NEW', '우리 목록에 새로 들어온 곳이에요 (30일 이내). 새로 문을 연 곳이라는 뜻은 아니에요.'],
    ['지역 칩', '시 단위로 묶었어요. 가까운 곳부터 놓고 서울은 맨 뒤예요.'],
    ['음식종류 칩', '한식·일식·중식·양식·분식·고기구이로 나눴어요. 여러 종류를 겸하는 식당은 후기에서 가장 자주 언급된 한 가지로 분류돼요.'],
    ['블로그 30일 / 90일', '우리가 직접 센 글 수예요. 상호가 실제로 언급된 글만 셉니다.'],
  ]

  return (
    <div className="py-5 text-[14px] leading-relaxed">
      <h1 className="text-[22px] font-bold tracking-tight">식당 목록은 어떻게 만들어지나</h1>

      {VIEW_ONLY && (
        <p className="mt-3 rounded-2xl border border-line bg-card p-4 text-[13px] leading-relaxed text-ink-soft">
          이 주소는 <b className="text-ink">열람 전용</b>이에요. 목록과 가족 별점은 다
          보이지만, 별점이나 다녀왔어요는 남길 수 없습니다.
        </p>
      )}

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
        {stats2.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
            <dt className="text-[13px] text-ink-soft">{k}</dt>
            <dd className="shrink-0 text-[13px] font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-7 text-[17px] font-bold">화면의 표시</h2>
      <dl className="mt-2 flex flex-col gap-3">
        {marks.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-card p-4">
            <dt className="font-semibold">{k}</dt>
            <dd className="mt-1 text-[13px] text-ink-soft">{v}</dd>
          </div>
        ))}
      </dl>

      {!VIEW_ONLY && (
        <>
          <h2 className="mt-7 text-[17px] font-bold">별점과 후기</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            가족 누구나 남길 수 있어요. 별점을 남기면{' '}
            <b className="text-ink">다녀온 곳에 자동으로 들어갑니다.</b> 카페 별점과는
            별도로 저장돼요 — 같은 상호라도 카페 탭과 식당 탭의 별점은 섞이지 않습니다.
          </p>
        </>
      )}

      <h2 className="mt-7 text-[17px] font-bold">없는 정보</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        <b className="text-ink">영업시간과 리뷰 수는 싣지 않습니다.</b> 카페 화면과 같은
        이유예요 — 무료로 쓸 수 있는 공식 자료가 그 값을 주지 않고, 블로그에서 뽑아낸
        영업시간은 절반쯤 틀려서 없느니만 못해요. 대신 상세 화면에{' '}
        <b className="text-ink">영업시간·휴무일 확인</b> 버튼을 두었어요.
      </p>

      <h2 className="mt-7 text-[17px] font-bold">업데이트 기록</h2>
      <div className="mt-2 flex flex-col gap-2">
        {CHANGELOG.map((entry) => (
          <details key={entry.date} className="group rounded-2xl border border-line bg-card p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
              <span>{entry.title}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-normal text-ink-soft">
                {entry.date}
                <span className="transition-transform group-open:rotate-180">⌄</span>
              </span>
            </summary>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{entry.body}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
