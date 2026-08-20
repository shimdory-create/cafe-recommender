import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import './globals.css'
import { TabBar } from './tab-bar'

export const metadata: Metadata = {
  title: '심김가족 카페',
  description: '수도권 대형·베이커리 카페 주말 나들이 추천',
  manifest: '/manifest.webmanifest',
  // 가족 전용이다. 색인되면 안 된다 (스펙 10절)
  robots: { index: false, follow: false, nocache: true },
  appleWebApp: { capable: true, title: '심김가족 카페', statusBarStyle: 'default' },
  // iOS 는 SVG 아이콘을 홈 화면에 쓰지 않는다 — PNG 가 없으면 화면 캡처가
  // 아이콘이 된다. 그래서 icon.svg 와 같은 그림을 180px PNG 로 함께 둔다.
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 아내분이 확대해서 볼 수 있어야 한다. maximumScale 로 막지 않는다.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf8f4' },
    { media: '(prefers-color-scheme: dark)', color: '#17130f' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {/* 데스크톱은 별도 레이아웃을 만들지 않는다 — 480px 센터 정렬 (스펙 10.1) */}
        <div className="mx-auto min-h-dvh max-w-[480px] pb-24">
          <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
            <div className="flex items-center px-5 py-3.5">
              <Link href="/" className="text-[17px] font-bold tracking-tight">
                심김가족 카페
              </Link>
            </div>
          </header>
          <main className="px-5">{children}</main>
        </div>
        <TabBar />
      </body>
    </html>
  )
}
