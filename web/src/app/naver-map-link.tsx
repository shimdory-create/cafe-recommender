'use client'

const NAVER_MAP_PACKAGE = 'com.nhn.android.nmap'

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

/**
 * https://map.naver.com/... 를 안드로이드 intent URI 로 바꾼다.
 * 앱이 있으면 바로 열리고, 없으면 fallback(원래 웹 주소)으로 간다.
 */
function toIntentUrl(href: string): string {
  const noScheme = href.replace(/^https?:\/\//, '')
  return `intent://${noScheme}#Intent;scheme=https;package=${NAVER_MAP_PACKAGE};`
    + `S.browser_fallback_url=${encodeURIComponent(href)};end`
}

/**
 * `target="_blank"` 를 정적으로 붙여 두면 안드로이드 크롬이 **탭을 누르는
 * 순간(터치다운)** 새 탭을 먼저 열어버릴 수 있다 — `preventDefault()` 가
 * click 에서 실행되기도 전이라 못 막는다. 그렇게 열린 새 탭은 네이버지도의
 * 원래 웹페이지(자체 "앱에서 보기" 버튼 포함)를 그대로 불러와서, 안드로이드
 * 에서만 동작하던 intent 이동이 원래 탭(백그라운드로 밀린 곳)에서 조용히
 * 실행되는 동안 사용자는 새 탭에서 한 번 더 눌러야 했다 (실제 보고).
 *
 * 그래서 `target` 을 정적으로 두지 않고, 이동을 전부 클릭 핸들러 안에서
 * 직접 결정한다 — 안드로이드는 같은 탭에서 intent 로, 나머지는
 * `window.open` 으로 새 탭을 연다. 브라우저가 target=_blank 를 보고
 * 미리 여는 경로 자체가 없어진다.
 */
export function NaverMapLink(
  { href, className, children }: { href: string; className?: string; children: React.ReactNode },
) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        if (isAndroid()) {
          window.location.href = toIntentUrl(href)
        } else {
          window.open(href, '_blank', 'noopener,noreferrer')
        }
      }}
    >
      {children}
    </a>
  )
}
