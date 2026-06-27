import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/sidebar-nav'
import MainWrapper from '@/components/main-wrapper'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shiprocket PPC Dashboard',
  description: 'Performance Marketing Command Center',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <MainWrapper>{children}</MainWrapper>
        </div>
      </body>
    </html>
  )
}
