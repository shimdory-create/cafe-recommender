import Link from 'next/link'
import type { NearbyCard as NearbyCardData } from '@/lib/nearby-types'
import { Thumb } from './thumb'
import { Badge } from './badge'

function NearbyCard({ item, href }: { item: NearbyCardData; href: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 flex-col gap-2 rounded-2xl border border-line bg-card p-3 active:bg-bean-soft/40"
      style={{ width: '160px' }}
    >
      <Thumb src={item.imageUrl} alt={item.name} size={56} />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-bold">{item.name}</p>
        <p className="mt-0.5 text-[12px] text-ink-soft">
          {item.sigungu} · 직선거리 {item.distanceKm}km
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
  )
}

export function NearbySection(
  { title, items, hrefPrefix }: { title: string; items: NearbyCardData[]; hrefPrefix: string },
) {
  if (items.length === 0) return null
  return (
    <section className="mt-5">
      <h2 className="text-[15px] font-bold">{title}</h2>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <NearbyCard key={item.id} item={item} href={`${hrefPrefix}${item.id}`} />
        ))}
      </div>
    </section>
  )
}
