export type Domain = 'cafe' | 'restaurant'

export function domainOf(pathname: string): Domain {
  return pathname === '/restaurant' || pathname.startsWith('/restaurant/') ? 'restaurant' : 'cafe'
}

/**
 * 지금 보던 화면과 같은 종류로 도메인을 바꾼다.
 *
 * 목록·다녀온 곳·정보는 대응 경로가 있어 그대로 옮긴다. 상세 페이지
 * (`/cafe/[id]`, `/restaurant/[id]`)는 대응하는 상대 항목이 없으므로
 * 그 도메인의 홈으로 보낸다.
 */
export function switchDomainPath(pathname: string, to: Domain): string {
  const from = domainOf(pathname)
  if (from === to) return pathname

  const rest = from === 'restaurant' ? pathname.slice('/restaurant'.length) : pathname
  // rest 는 '', '/list', '/visited', '/info', 혹은 '/<id>' (상세)
  const known = ['', '/list', '/visited', '/info']
  const tail = known.includes(rest) ? rest : ''

  return to === 'restaurant' ? `/restaurant${tail}` : (tail || '/')
}
