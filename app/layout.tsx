import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import './globals.css'

import { ToastProvider } from '@/components/ui/toast'
import { AppBackground } from '@/components/app-background'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Shift Management Hub — Central',
  description: 'Pusat Informasi dan Monitoring Jadwal Shift',
  generator: 'v0.app',
  icons: {
    icon: '/api/icon',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  colorScheme: 'light',
  themeColor: '#2a3350',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="id"
      className={`light ${inter.variable}`}
    >
      <body className="font-sans antialiased">
        <AppBackground />
        <ToastProvider>
          {children}
        </ToastProvider>

        {process.env.NODE_ENV === 'production' && (
          <Analytics />
        )}
      </body>
    </html>
  )
}