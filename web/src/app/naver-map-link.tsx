/**
 * 네이버지도 링크. 특별한 처리를 하지 않는 순수 `<a>` 다.
 *
 * **안드로이드의 "인증된 앱링크(App Links)" 자동 열기는 사용자가 진짜
 * `<a>` 를 클릭할 때만 작동한다.** intent 스킴이나 `location.href` 로
 * 자바스크립트가 대신 이동시키면 안드로이드가 그 신뢰 신호를 못 받아
 * "그냥 페이지 이동"으로 취급하고, 네이버 자체 안내 화면(app 열기 버튼이
 * 있는 `appLink.naver`)으로 떨어진다 (실제 보고: intent 시도 두 번 다
 * 이렇게 되어 원래 잘 되던 폰까지 고장 났다).
 *
 * 그래서 여기서는 아무것도 가로채지 않는다. 폰에서 앱이 바로 열리는 것도,
 * 태블릿에서 안 열리는 것도 **이 페이지 코드가 아니라 각 기기의 안드로이드
 * 설정**(설정 > 앱 > 네이버지도 > 기본으로 설정 > 지원되는 링크 열기)이
 * 정한다. 여기서 더 손대면 폰 쪽이 다시 깨진다.
 */
export function NaverMapLink(
  { href, className, children }: { href: string; className?: string; children: React.ReactNode },
) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  )
}
