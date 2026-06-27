'use client'

import { useState, useEffect } from 'react'

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Sync with sidebar initial state
    const saved = localStorage.getItem('sidebar_collapsed')
    if (saved === 'true') setCollapsed(true)

    // Listen for toggle events from sidebar
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setCollapsed(detail.collapsed)
    }
    window.addEventListener('sidebar-toggle', handler)
    return () => window.removeEventListener('sidebar-toggle', handler)
  }, [])

  return (
    <main style={{
      marginLeft: collapsed ? 56 : 220,
      flex: 1,
      minHeight: '100vh',
      transition: 'margin-left 0.2s ease',
    }}>
      {children}
    </main>
  )
}
