import { payload, REVISIT_DAYS } from '@/lib/site'
import { VIEW_ONLY } from '@/lib/view-only'
import { CHANGELOG } from '@/lib/changelog'
import { UPDATE_SCHEDULE } from '@/lib/update-schedule'

export const metadata = { title: '카페 정보 — 심김 빵지순례' }

/**
 * 정보 탭 — 이 목록이 어떻게 만들어지는지. 신뢰가 여기서 생긴다.
 *
 * 숫자는 **전부 페이로드에서 읽는다.** 손으로 적어 두면 따라가지 못한다 —
 * `수도권 65개 시군구` 라고 적혀 있는 동안 실제로는 69개였다 (2026 인천
 * 행정구역 개편으로 구가 늘어난 것을 문구가 못 따라갔다).
 */
export default function Info() {
  const at = new Date(payload.generatedAt)
  const stamp = `${at.getFullYear() % 100}. ${at.getMonth() + 1}. ${at.getDate()}.`
  const { stats } = payload
  const shown = stats.passed + stats.cityOnly

  const steps: [string, React.ReactNode][] = [
    ['카페를 찾는다',
      `수도권 ${stats.scannedRegions}개 시군구를 카카오 장소 검색으로 훑어요.`],
    ['화제량을 센다', (
      <>
        블로그 후기가 얼마나 빠르게 늘고 있는지 봐요. 인스타에서 뜨면 1~2주 뒤
        블로그가 쏟아져요. <b className="text-ink">집에서 가까운 곳은 기준을 낮춰서</b>{' '}
        봐요 — 블로그 글은 멀리 나들이 간 곳에 많이 쓰이거든요.
      </>
    )],
    ['후기를 읽는다', '규모·주차·메뉴·뷰를 후기 원문에서 뽑아요. 근거 인용이 없으면 버려요.'],
    ['걸러낸다', '동네 카페와 주차 안 되는 곳은 빼요. 차로 가니까요.'],
    ['거리를 잰다', (
      <>
        집(인천 부평)에서 <b className="text-ink">카카오 길찾기로 실제 운전 시간</b>을
        재요. 직선거리로 어림하면 강화는 19분, 검단은 16분씩 실제보다 가깝게 나와요.
      </>
    )],
    ['순위를 매긴다',
      '화제량 × (거리·주차·메뉴)로 점수를 내고 높은 순으로 줄을 세워요. 한 지역에서 두 곳까지만 뽑아요.'],
    ['다녀온 곳은 내린다',
      `별점을 남기면 다녀온 곳으로 자동 기록되고, ${Math.round(REVISIT_DAYS / 30)}개월간 추천에서 빠져요. 다녀온 곳 탭에서 빼면 다시 올라옵니다.`],
  ]

  /**
   * `보여주는 카페` 를 통과분 + 도심전용 합계로 적었더니 전체 탭 머리의 숫자와
   * 어긋났다 (정보 1,035곳 / 전체 664곳). 전체 탭은 기본이 **도심 제외**다.
   * 화면에 보이는 그대로를 먼저 쓰고, 도심을 켰을 때 수를 따로 적는다.
   */
  const stats2: [string, string][] = [
    ['찾은 카페', `${stats.discovered.toLocaleString()}곳`],
    ['전체 탭에 보이는 카페', `${stats.passed.toLocaleString()}곳`],
    ['「도심 포함」 을 켜면', `${shown.toLocaleString()}곳 (+${stats.cityOnly})`],
    ['운전 시간 실측', `${stats.driveMeasured.toLocaleString()} / ${shown.toLocaleString()}곳`],
    ['훑는 지역', `${stats.scannedRegions}개 시군구`],
    ['카페가 있는 지역', `${stats.regions}개 시군구`],
    ['갱신', stamp],
  ]

  const marks: [string, React.ReactNode][] = [
    ['NEW', (
      <>
        <b className="text-ink">우리 목록에 새로 들어온</b> 곳이에요 (30일 이내).
        새로 문을 연 곳이라는 뜻은 아니에요 — 개업일을 알려주는 무료 자료가 없어요.
      </>
    )],
    ['지역 칩', '시 단위로 묶었어요. 가까운 곳부터 놓고 서울은 맨 뒤예요. 서울·인천은 눌러야 구별로 나뉩니다.'],
    ['돋보기', '업소명으로 찾아요. 한 글자만 넣어도 됩니다.'],
    ['블로그량 1개월', '최근 한 달 동안 상호가 실제로 언급된 블로그 글 수예요. 우리가 직접 세어요.'],
  ]

  return (
    <div className="py-5 text-[14px] leading-relaxed">
      <h1 className="text-[22px] font-bold tracking-tight">카페 목록은 어떻게 만들어지나</h1>

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

      <h2 className="mt-7 text-[17px] font-bold">언제 업데이트되나요</h2>
      <dl className="mt-2 overflow-hidden rounded-2xl border border-line bg-card">
        {UPDATE_SCHEDULE.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 border-b border-line px-4 py-3 last:border-0">
            <dt className="text-[13px] font-semibold">{k}</dt>
            <dd className="text-[13px] text-ink-soft">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
        시각이 도메인마다 30분~1시간씩 어긋나 있는 건 의도예요 — 한꺼번에 몰리면
        스케줄이 밀리는 걸 피하려고 일부러 나눠뒀어요. 그래서 같은 순간에 봐도
        카페는 방금 갱신됐는데 가볼 곳은 아직 순서 전일 수 있어요 — 정상입니다.
      </p>

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
            <b className="text-ink">다녀온 곳에 자동으로 들어갑니다.</b> 남긴 뒤에도
            수정하거나 지울 수 있어요 — 다만 누가 남겼는지 확인하지 않으니, 지우기 전에
            누구 것인지 한 번 보고 눌러주세요. 별점을 지워도 다녀온 기록은 남습니다.
          </p>
        </>
      )}

      <h2 className="mt-7 text-[17px] font-bold">없는 정보</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        <b className="text-ink">영업시간과 리뷰 수는 싣지 않습니다.</b> 무료로 쓸 수 있는
        공식 자료가 그 값을 주지 않아서예요. 블로그 글에서 뽑아낼 수는 있지만 절반쯤
        틀리고, 틀린 영업시간은 한 시간 운전해서 닫힌 문 앞에 서게 만듭니다.
        <b className="text-ink">네이버지도로 열기</b> 버튼을 누르면 그 자리에서 바로
        확인할 수 있어요.
      </p>

      <p className="mt-5 text-[12px] leading-relaxed text-ink-soft">
        주차 등급은 후기에 적힌 내용만 따릅니다. &ldquo;1시간 무료&rdquo; 같은 조건부
        무료는 넉넉하다고 보지 않아요. 그래도 주말 오후에는 붐빌 수 있으니
        출발 전에 지도에서 한 번 더 확인하세요.
      </p>

      <details className="group/updates mt-7">
        <summary className="flex cursor-pointer list-none items-center gap-2">
          <span className="text-[17px] font-bold">업데이트 기록</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[13px] leading-none text-ink-soft transition-transform group-open/updates:rotate-45">
            +
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {CHANGELOG.map((entry) => (
            <details key={entry.date} className="group/entry rounded-2xl border border-line bg-card p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
                <span>{entry.title}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-normal text-ink-soft">
                  {entry.date}
                  <span className="transition-transform group-open/entry:rotate-180">⌄</span>
                </span>
              </summary>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{entry.body}</p>
            </details>
          ))}
        </div>
      </details>
    </div>
  )
}
