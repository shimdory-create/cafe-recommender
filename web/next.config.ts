import type { NextConfig } from 'next'

const config: NextConfig = {
  // 저장소 루트에 파이프라인 package-lock.json 이 따로 있어서 명시해 준다
  turbopack: { root: import.meta.dirname },
  // 정적 export 를 쓰지 않는다 — 가족 접근 코드 미들웨어가 필요하다 (스펙 10절).
  // 페이지는 전부 빌드 타임 생성이므로 서버는 사실상 정적 파일만 준다.
  reactStrictMode: true,
  typedRoutes: true,
}

export default config
