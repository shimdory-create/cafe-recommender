import type { NextConfig } from 'next'

/**
 * 열람 전용 배포를 **프로젝트 이름으로도** 판단한다.
 *
 * 같은 저장소를 Vercel 프로젝트 두 개로 띄운다 (스펙 10.15). 둘을 가르는
 * 방법이 환경변수 하나뿐이면, 그 변수를 대시보드에서 손으로 넣어야 하고
 * 빠뜨리면 **열람용에 쓰기 버튼이 그대로 뜬다.** 그래서 이름 규칙을 두 번째
 * 경로로 둔다 — `cafe-view` 로 시작하는 프로젝트는 열람 전용이다.
 *
 * `NEXT_PUBLIC_VIEW_ONLY=1` 을 넣으면 이름과 무관하게 열람 전용이 된다
 * (로컬 확인용이자 수동 우선권).
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` 은 Vercel 이 빌드에 넣어주는 값으로
 * `cafe-view-shim6.vercel.app` 처럼 프로젝트 이름으로 시작한다.
 */
const VIEW_ONLY_PREFIX = 'cafe-view'
const viewOnly = process.env.NEXT_PUBLIC_VIEW_ONLY === '1'
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '').startsWith(VIEW_ONLY_PREFIX)

const config: NextConfig = {
  // 저장소 루트에 파이프라인 package-lock.json 이 따로 있어서 명시해 준다
  turbopack: { root: import.meta.dirname },
  // 빌드 시점에 값이 박힌다. 서버와 클라이언트가 같은 값을 보므로 화면이
  // 한 번 깜빡이며 버튼이 사라지는 일이 없다
  env: { NEXT_PUBLIC_VIEW_ONLY: viewOnly ? '1' : '0' },
  // 정적 export 를 쓰지 않는다 — 목록 탭이 주소의 필터를 서버에서 읽는다.
  reactStrictMode: true,
  // typedRoutes 는 빌드 중에 타입을 생성하므로 독립 typecheck 를 막는다.
  // 링크가 몇 개 안 되는 앱에서 얻는 것보다 잃는 것이 크다.
}

export default config
