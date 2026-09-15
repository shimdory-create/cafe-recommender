import Link from 'next/link'
import type { NearbyCard as NearbyCardData } from '@/lib/nearby-types'
import { Thumb } from './thumb'
import { Badge } from './badge'
import { NaverMapLink } from './naver-map-link'

export function NearbyCard({ item, href, icon }: { item: NearbyCardData; href: string; icon: string }) {
  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-card"
      style={{ width: '160px' }}
    >
      <Link href={href} className="flex flex-col gap-2 p-3 active:bg-bean-soft/40">
        <Thumb src={item.imageUrl} alt={item.name} size={56} icon={icon} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold">{item.name}</p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            {item.sigungu} · {item.driveMinutes != null ? `차로 ${item.driveMinutes}분` : `직선거리 ${item.distanceKm}km`}
          </p>
          {item.ratingCount > 0 && (
            <p className="mt-0.5 text-[12px] font-bold text-bean">★ {item.ratingAvg.toFixed(1)}</p>
          )}
          {item.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.tags.slice(0, 2).map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          )}
        </div>
      </Link>
      {/* NaverMapLink 는 순수 <a> 다(naver-map-link.tsx 주석 참고 — JS 리다이렉트를
          쓰면 안드로이드 앱링크가 안 열린 적이 있다). card의 Link 안에 중첩하면
          <a> 안에 <a> 가 되어 무효한 HTML 이 되므로, 상세 카드(cafe-card.tsx 등)와
          같은 방식으로 형제 요소로 뺀다. */}
      <NaverMapLink
        href={item.directionsUrl}
        className="flex min-h-[36px] items-center justify-center border-t border-line text-[12px] font-semibold text-bean active:bg-bean-soft"
      >
        차로 길찾기 ↗
      </NaverMapLink>
    </div>
  )
}

export function NearbySection(
  { title, items, hrefPrefix, icon }: { title: string; items: NearbyCardData[]; hrefPrefix: string; icon: string },
) {
  if (items.length === 0) return null
  return (
    <section className="mt-5">
      <h2 className="text-[15px] font-bold">{title}</h2>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <NearbyCard key={item.id} item={item} href={`${hrefPrefix}${item.id}`} icon={icon} />
        ))}
      </div>
    </section>
  )
}
