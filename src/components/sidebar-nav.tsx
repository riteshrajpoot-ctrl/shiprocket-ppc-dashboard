'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
      { label: 'Meta Ads', href: '/dashboard', icon: '⬡', badge: 'Live' },
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

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 220,
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
    }}>
      {/* Logo */}
      <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #F3F4F6', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#18181B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>SR</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', lineHeight: 1 }}>PPC Command</div>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>Shiprocket</div>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, padding: '0 8px', overflowY: 'auto' }}>
        {NAV_ITEMS.map(group => (
          <div key={group.group} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em', padding: '0 8px', marginBottom: 4 }}>
              {group.group}
            </div>
            {group.items.map(item => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 8px',
                    borderRadius: 6,
                    marginBottom: 1,
                    background: active ? '#F3F4F6' : 'transparent',
                    textDecoration: 'none',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#F9FAFB' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 14, color: active ? '#111' : '#6B7280', width: 16, textAlign: 'center' }}>{item.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#111' : '#374151', flex: 1 }}>{item.label}</span>
                  {item.badge && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: (item as any).badgeBg || '#D1FAE5',
                      color: (item as any).badgeColor || '#065F46',
                    }}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom status */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #F3F4F6', fontSize: 11, color: '#9CA3AF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
          <span>Meta · Live data</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
          <span>Branch · API connecting</span>
        </div>
      </div>
    </aside>
  )
}
