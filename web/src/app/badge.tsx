/** 카페·식당 공용 순수 스타일 컴포넌트. cafe-card.tsx 에 원래 있었는데,
 * 그 파일이 @/lib/site 를 import 해서 식당 카드까지 카페 payload 를
 * 끌고 들어갔다. */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-bean-soft px-2.5 py-1 text-[12px] font-medium text-bean">
      {children}
    </span>
  )
}
