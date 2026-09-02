import { notFound } from 'next/navigation'
import {
  spotById, SPOT_TAG_LABEL, driveLabel, PARKING_LABEL, INDOOR_OUTDOOR_LABEL,
  spotPayload, spotRecentlyVisited,
} from '@/lib/spot-site'
import { Badge } from '../../badge'
import { NaverMapLink } from '../../naver-map-link'
import { ReviewPanel } from './review-panel'
import { BackLink } from '../../cafe/[id]/back-link'
import { WishHeart } from './wish-heart'
import { BlacklistHeart } from './blacklist-heart'

export function generateStaticParams() {
  return spotPayload.spots.map((s) => ({ id: s.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const spot = spotById((await params).id)
  return { title: spot ? `${spot.name} — 심김 빵지순례` : '심김 빵지순례' }
}

const PARKING_NOTE: Record<string, string> = {
  A: '전용 주차장이 넉넉해요.',
  B: '주차는 되지만 넉넉하지는 않아요. 건물·상가 주차장이거나 조건부 무료일 수 있어요.',
  C: '주차가 어려워요. 인근 유료·공영 주차장을 알아보고 가세요.',
  D: '주차가 안 돼요.',
  '?': '후기에 주차 얘기가 없었어요. 출발 전에 확인하세요.',
}

export default async function SpotDetail({ params }: { params: Promise<{ id: string }> }) {
  const spot = spotById((await params).id)
  if (!spot) notFound()

  const rows: [string, string][] = [
    ['태그', spot.tags.length > 0 ? spot.tags.map((t) => SPOT_TAG_LABEL[t] ?? t).join(', ') : '미확인'],
    ['주차', `${spot.parkingGrade} — ${PARKING_LABEL[spot.parkingGrade]}`],
    ['이동', driveLabel(spot.driveMinutes)],
  ]
  if (spot.stayDuration) rows.push(['체류시간', spot.stayDuration])
  if (spot.indoorOutdoor) {
    rows.push(['실내외', INDOOR_OUTDOOR_LABEL[spot.indoorOutdoor] ?? spot.indoorOutdoor])
  }
  if (spot.season) rows.push(['계절', spot.season])
  if (spot.teenAppeal !== null) rows.push(['10대 취향', `${spot.teenAppeal} / 5`])

  return (
    <div className="py-5">
      <BackLink />

      <div className="mt-1 flex items-start justify-between gap-2">
        <h1 className="text-[24px] font-bold leading-tight tracking-tight">
          {spot.isNew && (
            <span className="mr-2 align-middle rounded bg-bean px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white">
              NEW
            </span>
          )}
          {spot.name}
        </h1>
        <span className="flex shrink-0 items-center gap-1">
          <WishHeart spotId={spot.id} />
          <BlacklistHeart spotId={spot.id} />
        </span>
      </div>
      <p className="mt-1 text-[14px] text-ink-soft">
        {spot.sigungu} · {driveLabel(spot.driveMinutes)}
      </p>

      {spotRecentlyVisited(spot.visitedOn) && (
        <p className="mt-2 inline-block rounded-full bg-line px-2.5 py-1 text-[12px] text-ink-soft">
          {spot.visitedOn} 에 다녀왔어요
        </p>
      )}

      {spot.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {spot.tags.map((t) => (
            <Badge key={t}>{SPOT_TAG_LABEL[t] ?? t}</Badge>
          ))}
        </div>
      )}

      <NaverMapLink
        href={spot.naverMapUrl}
        className="mt-5 flex min-h-[56px] items-center justify-center rounded-2xl bg-bean text-[16px] font-bold text-white active:opacity-90"
      >
        네이버지도로 열기 ↗
      </NaverMapLink>

      <NaverMapLink
        href={spot.naverMapUrl}
        className="mt-2 flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-line bg-card text-[14px] font-semibold text-bean active:bg-bean-soft"
      >
        영업시간·휴무일 확인 ↗
      </NaverMapLink>
      <p className="mt-1.5 text-center text-[12px] text-ink-soft">
        영업시간은 자주 바뀌어서 지도에서 바로 확인하는 게 정확해요
      </p>

      <ReviewPanel
        spotId={spot.id}
        initialVisited={spot.visitedOn !== null}
        built={spot.familyReviews}
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
          {PARKING_NOTE[spot.parkingGrade]}
        </p>
        {spot.parkingEvidence && (
          <blockquote className="mt-2 rounded-xl bg-bean-soft/50 px-3.5 py-3 text-[13px] leading-relaxed">
            “{spot.parkingEvidence}”
          </blockquote>
        )}
      </section>

      {spot.evidence && (
        <section className="mt-5">
          <h2 className="text-[15px] font-bold">후기에서</h2>
          <blockquote className="mt-2 rounded-xl bg-bean-soft/50 px-3.5 py-3 text-[13px] leading-relaxed">
            “{spot.evidence}”
          </blockquote>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-[15px] font-bold">얼마나 화제인가</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          블로그 후기가 최근 30일에 <b className="text-ink">{spot.posts30}건</b>
          {spot.posts90 !== spot.posts30 && (
            <>, 90일에 <b className="text-ink">{spot.posts90}건</b></>
          )}{' '}올라왔어요.
          {spot.trend === 'rising' && ' 최근 한 달이 그 전보다 눈에 띄게 늘었어요.'}
          {spot.trend === 'unknown' && ' 최근 글이 몰려 있어서 이전과 비교하기는 어려워요.'}
        </p>
      </section>

      {spot.kakaoPlaceUrl && (
        <a
          href={spot.kakaoPlaceUrl}
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
