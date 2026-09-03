import { pickCourseItem } from '@/lib/course-cycle'
import type { NearbyCard as NearbyCardData } from '@/lib/nearby-types'
import { NearbyCard } from './nearby-card'

export function CourseSection(
  { items, hrefPrefix, icon, label, index, onNext }: {
    items: NearbyCardData[]
    hrefPrefix: string
    icon: string
    /** 버튼 문구에 쓰는 이름 — "식당", "가볼 곳", "카페" */
    label: string
    index: number
    onNext: () => void
  },
) {
  const item = pickCourseItem(items, index)
  if (!item) return null
  return (
    <div className="flex flex-col gap-2">
      <NearbyCard item={item} href={`${hrefPrefix}${item.id}`} icon={icon} />
      {items.length > 1 && (
        <button
          type="button"
          onClick={onNext}
          className="flex min-h-[36px] items-center text-[12px] font-semibold text-bean"
        >
          다음 {label} 보기 →
        </button>
      )}
    </div>
  )
}
