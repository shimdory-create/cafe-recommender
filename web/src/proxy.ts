import { NextResponse, type NextRequest } from 'next/server'

/**
 * 가족 접근 코드 (스펙 10절).
 *
 * 쓰기 엔드포인트가 0개라 공격 표면이 사실상 없다. 이 게이트의 목적은
 * 보안이 아니라 **가족만 보는 페이지로 두는 것**이다. 그래서 코드 1개면
 * 충분하고 프로필도 없다.
 *
 * `ACCESS_CODE` 가 없으면 게이트를 끈다 — 로컬 개발에서 매번 코드를
 * 넣게 만들 이유가 없다.
 *
 * Next 16 에서 `middleware.ts` 가 `proxy.ts` 로 바뀌었다.
 */
const COOKIE = 'family'

export default function proxy(req: NextRequest) {
  const code = process.env.ACCESS_CODE
  if (!code) return NextResponse.next()

  const { pathname, searchParams } = req.nextUrl
  if (pathname.startsWith('/gate')) return NextResponse.next()

  // 카톡 링크에 ?code=... 를 붙여 한 번만 통과시키면 그 뒤로는 쿠키가 남는다
  const given = searchParams.get('code')
  if (given === code) {
    const url = req.nextUrl.clone()
    url.searchParams.delete('code')
    const res = NextResponse.redirect(url)
    res.cookies.set(COOKIE, code, {
      httpOnly: true, sameSite: 'lax', secure: true, path: '/',
      maxAge: 60 * 60 * 24 * 365 * 5,
    })
    return res
  }

  if (req.cookies.get(COOKIE)?.value === code) return NextResponse.next()

  // API 는 HTML 로 리다이렉트하지 않는다 — fetch 하는 쪽이 JSON 을 기대하므로
  // 로그인 페이지 HTML 을 받으면 파싱 오류로 원인이 흐려진다.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '접근 코드가 필요합니다' }, { status: 401 })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/gate'
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt).*)'],
}
