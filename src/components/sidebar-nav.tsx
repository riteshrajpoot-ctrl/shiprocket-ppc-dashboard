'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  {
    group: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: '▣' },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { label: 'Meta Ads', href: '/growth-overview', icon: '⬡', badge: 'Live', badgeColor: '#065F46', badgeBg: '#D1FAE5' },
      { label: 'Branch', href: '/branch', icon: '⬢', badge: 'Beta', badgeColor: '#92400E', badgeBg: '#FEF3C7' },
      { label: 'Google Ads', href: '/google-ads', icon: '⬡', badge: 'Soon', badgeColor: '#6B7280', badgeBg: '#F3F4F6' },
    ],
  },
  {
    group: 'Tools',
    items: [
      { label: 'Budget optimizer', href: '/budget-optimizer', icon: '◈' },
      { label: 'AI Sidekick', href: '/ai-sidekick', icon: '◇' },
      { label: 'Creative Intelligence', href: '/intelligence', icon: '◈', badge: 'New', badgeColor: '#6B21A8', badgeBg: '#F5F3FF' },
      { label: 'Search term miner', href: '/search-terms', icon: '◉', badge: 'Soon', badgeColor: '#6B7280', badgeBg: '#F3F4F6' },
    ],
  },
]

const COLLAPSED_KEY = 'sidebar_collapsed'

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Persist collapse state
  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY)
    if (saved === 'true') setCollapsed(true)
  }, [])

  const toggle = () => {
    setCollapsed(prev => {
      localStorage.setItem(COLLAPSED_KEY, String(!prev))
      // Notify layout of width change
      window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: !prev } }))
      return !prev
    })
  }

  const w = collapsed ? 56 : 220

  return (
    <aside style={{
      width: w,
      minHeight: '100vh',
      background: '#fff',
      borderRight: '1px solid #E5E7EB',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
      fontFamily: 'Inter, -apple-system, sans-serif',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 10,
      transition: 'width 0.2s ease',
      overflow: 'hidden',
    }}>

      {/* Logo + collapse toggle */}
      <div style={{ padding: '0 12px 16px', borderBottom: '1px solid #F3F4F6', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#18181B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>SR</span>
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111', lineHeight: 1 }}>PPC Command</div>
              <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>Shiprocket</div>
            </div>
          )}
        </div>
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            width: 22, height: 22, borderRadius: 4, border: '1px solid #E5E7EB',
            background: '#F9FAFB', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            color: '#9CA3AF', fontSize: 11, padding: 0,
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F3F4F6')}
          onMouseLeave={e => (e.currentTarget.style.background = '#F9FAFB')}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, padding: '0 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV_ITEMS.map(group => (
          <div key={group.group} style={{ marginBottom: 20 }}>
            {!collapsed && (
              <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em', padding: '0 8px', marginBottom: 4 }}>
                {group.group}
              </div>
            )}
            {collapsed && <div style={{ height: 8 }} />}
            {group.items.map(item => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: collapsed ? 0 : 8,
                    padding: collapsed ? '8px 0' : '7px 8px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    borderRadius: 6,
                    marginBottom: 1,
                    background: active ? '#F3F4F6' : 'transparent',
                    textDecoration: 'none',
                    transition: 'background .12s',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#F9FAFB' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 15, color: active ? '#111' : '#6B7280', width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#111' : '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                      {(item as any).badge && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
                          background: (item as any).badgeBg || '#D1FAE5',
                          color: (item as any).badgeColor || '#065F46',
                          flexShrink: 0,
                        }}>
                          {(item as any).badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom status */}
      {!collapsed ? (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #F3F4F6', fontSize: 11, color: '#9CA3AF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
            <span>Meta · Live data</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
            <span>Branch · API connecting</span>
          </div>
        </div>
      ) : (
        <div style={{ padding: '12px 0', borderTop: '1px solid #F3F4F6', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div title="Meta · Live" style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
          <div title="Branch · API connecting" style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
        </div>
      )}
    </aside>
  )
}
