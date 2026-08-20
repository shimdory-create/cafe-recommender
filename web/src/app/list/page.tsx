import { payload } from '@/lib/site'
import { ListClient } from './list-client'

export const metadata = { title: '전체 리스트 — 우리 가족 카페' }

/**
 * 전체 리스트. 무한 스크롤을 만들지 않는다 — 통과분이 수백 곳이라
 * 전량 렌더 + 칩 필터가 더 빠르고 코드도 없다.
 */
export default function ListPage() {
  return <ListClient cafes={payload.cafes} />
}
