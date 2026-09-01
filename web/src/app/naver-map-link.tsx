'use client'

const NAVER_MAP_PACKAGE = 'com.nhn.android.nmap'

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

/**
 * `https://map.naver.com/...` 를 안드로이드 intent URI 로 바꾼다.
 *
 * 태블릿에 네이버지도 앱이 깔려 있는데도 새 탭으로 열렸다 (실제 보고) —
 * 일반 `<a>` 는 OS 의 "인증된 앱링크" 설정에 기대는데, 그 설정이 기기마다
 * (특히 폰이 아닌 기기에서) 꺼져 있을 수 있다. intent 스킴은 그 설정과
 * 무관하게 패키지를 직접 지정해 앱을 연다. 앱이 없으면 `browser_fallback_url`
 * 로 지금과 같은 웹 주소로 간다.
 */
function toIntentUrl(href: string): string {
  const noScheme = href.replace(/^https?:\/\//, '')
  return `intent://${noScheme}#Intent;scheme=https;package=${NAVER_MAP_PACKAGE};`
    + `S.browser_fallback_url=${encodeURIComponent(href)};end`
}

export function NaverMapLink(
  { href, className, children }: { href: string; className?: string; children: React.ReactNode },
) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={(e) => {
        if (!isAndroid()) return
        e.preventDefault()
        window.location.href = toIntentUrl(href)
      }}
    >
      {children}
    </a>
  )
}
