import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/sidebar-nav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shiprocket PPC Dashboard',
  description: 'Performance Marketing Command Center',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <main style={{ marginLeft: 220, flex: 1, minHeight: '100vh' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
