export type Domain = 'cafe' | 'restaurant' | 'spot'

export function domainOf(pathname: string): Domain {
  if (pathname === '/restaurant' || pathname.startsWith('/restaurant/')) return 'restaurant'
  if (pathname === '/spot' || pathname.startsWith('/spot/')) return 'spot'
  return 'cafe'
}

/**
 * 지금 보던 화면과 같은 종류로 도메인을 바꾼다.
 *
 * 목록·다녀온 곳·정보는 대응 경로가 있어 그대로 옮긴다. 상세 페이지는
 * 대응하는 상대 항목이 없으므로 그 도메인의 홈으로 보낸다.
 */
export function switchDomainPath(pathname: string, to: Domain): string {
  const from = domainOf(pathname)
  if (from === to) return pathname

  const prefix = from === 'cafe' ? '' : `/${from}`
  const rest = prefix ? pathname.slice(prefix.length) : pathname
  // rest 는 '', '/list', '/visited', '/info', 혹은 '/<id>' (상세)
  const known = ['', '/list', '/visited', '/info']
  const tail = known.includes(rest) ? rest : ''

  return to === 'cafe' ? (tail || '/') : `/${to}${tail}`
}
