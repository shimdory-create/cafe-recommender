import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  byId, driveLabel, MENU_LABEL, PARKING_LABEL, payload, recentlyVisited,
} from '@/lib/site'
import { Badge } from '../../cafe-card'
import { ReviewPanel } from './review-panel'
import { BackLink } from './back-link'

export function generateStaticParams() {
  return payload.cafes.map((c) => ({ id: c.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const cafe = byId((await params).id)
  return { title: cafe ? `${cafe.name} — 심김 빵지순례` : '심김 빵지순례' }
}

const PARKING_NOTE: Record<string, string> = {
  A: '전용 주차장이 넉넉해요.',
  B: '주차는 되지만 넉넉하지는 않아요. 건물·상가 주차장이거나 조건부 무료일 수 있어요.',
  C: '주차가 어려워요. 인근 유료·공영 주차장을 알아보고 가세요.',
  D: '주차가 안 돼요.',
  '?': '후기에 주차 얘기가 없었어요. 출발 전에 확인하세요.',
}

export default async function CafeDetail({ params }: { params: Promise<{ id: string }> }) {
  const cafe = byId((await params).id)
  if (!cafe) notFound()

  const rows: [string, string][] = [
    ['규모', cafe.scale ?? '미확인'],
    ['주차', `${cafe.parkingGrade} — ${PARKING_LABEL[cafe.parkingGrade]}`],
    ['메뉴', MENU_LABEL[cafe.menuLevel] ?? `Lv${cafe.menuLevel}`],
    ['이동', driveLabel(cafe.driveMinutes)],
  ]
  if (cafe.signatureMenu) rows.push(['대표 메뉴', cafe.signatureMenu])
  if (cafe.mealTypes.length) rows.push(['식사', cafe.mealTypes.join(', ')])
  if (cafe.viewTypes.length) rows.push(['뷰', cafe.viewTypes.join(', ')])
  if (cafe.outdoorSeating !== null) rows.push(['야외석', cafe.outdoorSeating ? '있음' : '없음'])
  if (cafe.stayDuration) rows.push(['체류', cafe.stayDuration])
  if (cafe.teenAppeal !== null) rows.push(['10대 취향', `${cafe.teenAppeal} / 5`])

  return (
    <div className="py-5">
      <BackLink />

      <h1 className="mt-1 text-[24px] font-bold leading-tight tracking-tight">
        {cafe.isNew && (
          <span className="mr-2 align-middle rounded bg-bean px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white">
            NEW
          </span>
        )}
        {cafe.name}
      </h1>
      <p className="mt-1 text-[14px] text-ink-soft">
        {cafe.sigungu} · {driveLabel(cafe.driveMinutes)}
      </p>

      {recentlyVisited(cafe.visitedOn) && (
        <p className="mt-2 inline-block rounded-full bg-line px-2.5 py-1 text-[12px] text-ink-soft">
          {cafe.visitedOn} 에 다녀왔어요
        </p>
      )}

      {cafe.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cafe.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      )}

      {/* 주 버튼. 엄지로 누르는 것이므로 크게 (스펙 10.1) */}
      <a
        href={cafe.naverMapUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-5 flex min-h-[56px] items-center justify-center rounded-2xl bg-bean text-[16px] font-bold text-white active:opacity-90"
      >
        네이버지도로 열기 ↗
      </a>

      {/*
        영업시간을 우리가 들고 있지 않다.

        카카오 로컬 API 는 상호·주소·전화·좌표만 주고, 네이버 지역검색 API 도
        영업시간을 주지 않는다. 구글 Places 는 주지만 카드 등록이 필요해
        "결제 없이 평생" 이 깨진다. 블로그 글에서 LLM 으로 뽑는 방법은 되지만
        절반쯤 틀리고, **틀린 영업시간은 한 시간 운전해서 닫힌 문 앞에 서게
        만든다** — 없는 것보다 나쁘다.

        그래서 지어내지 않고 한 번에 갈 수 있는 길을 크게 둔다.
      */}
      <a
        href={cafe.naverMapUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-line bg-card text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        영업시간·휴무일 확인 ↗
      </a>
      <p className="mt-1.5 text-center text-[12px] text-ink-soft">
        영업시간은 자주 바뀌어서 지도에서 바로 확인하는 게 정확해요
      </p>

      {/* 다녀왔어요 · 별점 · 한 줄 — 가족 누구나 (스펙 10절 v3.3) */}
      <ReviewPanel
        cafeId={cafe.id}
        initialVisited={cafe.visitedOn !== null}
        built={cafe.familyReviews}
      />

      <dl className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-line px-4 py-3 last:border-0">
            <dt className="shrink-0 text-[13px] text-ink-soft">{k}</dt>
            <dd className="text-right text-[13px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-5">
        <h2 className="text-[15px] font-bold">주차</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          {PARKING_NOTE[cafe.parkingGrade]}
        </p>
        {cafe.parkingEvidence && (
          <blockquote className="mt-2 rounded-xl bg-bean-soft/50 px-3.5 py-3 text-[13px] leading-relaxed">
            “{cafe.parkingEvidence}”
          </blockquote>
        )}
      </section>

      {cafe.evidence && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">후기에서</h2>
          <blockquote className="mt-2 rounded-xl bg-bean-soft/50 px-3.5 py-3 text-[13px] leading-relaxed">
            “{cafe.evidence}”
          </blockquote>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-[15px] font-bold">얼마나 화제인가</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          블로그 후기가 최근 30일에 <b className="text-ink">{cafe.posts30}건</b>
          {cafe.posts90 !== cafe.posts30 && (
            <>, 90일에 <b className="text-ink">{cafe.posts90}건</b></>
          )}{' '}올라왔어요.
          {/* 가속도 숫자는 포화되므로 생성기가 판정한 trend 만 쓴다 (발견 E) */}
          {cafe.trend === 'rising' && ' 최근 한 달이 그 전보다 눈에 띄게 늘었어요.'}
          {cafe.trend === 'unknown'
            && ' 최근 글이 몰려 있어서 이전과 비교하기는 어려워요.'}
        </p>
      </section>

      {cafe.kakaoPlaceUrl && (
        <a
          href={cafe.kakaoPlaceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex min-h-[44px] items-center justify-center text-[13px] text-ink-soft underline"
        >
          카카오맵에서 보기 ↗
        </a>
      )}
    </div>
  )
}
