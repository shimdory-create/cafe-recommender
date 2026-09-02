export interface NearbyCard {
  id: string
  name: string
  imageUrl: string | null
  tags: string[]
  sigungu: string
  ratingAvg: number
  ratingCount: number
  distanceKm: number
  /** 앵커(지금 보는 곳)에서 이 카드로의 차량 길찾기 링크 */
  directionsUrl: string
}
