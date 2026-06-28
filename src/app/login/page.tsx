'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') || '/dashboard'

  const handleLogin = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push(from)
      } else {
        setError('Incorrect password. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 380,
        boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#18181B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>SR</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>PPC Command</div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>Shiprocket · Internal tool</div>
          </div>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>Welcome back</h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 24px' }}>Enter your team password to access the dashboard</p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Enter team password"
            autoFocus
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: error ? '1.5px solid #EF4444' : '1.5px solid #E5E7EB',
              fontSize: 14,
              color: '#111827',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { if (!error) e.target.style.borderColor = '#6366F1' }}
            onBlur={e => { if (!error) e.target.style.borderColor = '#E5E7EB' }}
          />
          {error && <p style={{ fontSize: 12, color: '#EF4444', margin: '6px 0 0' }}>⚠️ {error}</p>}
        </div>

        <button
          onClick={handleLogin}
          disabled={loading || !password}
          style={{
            width: '100%',
            padding: '11px 0',
            borderRadius: 8,
            border: 'none',
            background: loading || !password ? '#E5E7EB' : 'linear-gradient(135deg, #4F46E5, #7C3AED)',
            color: loading || !password ? '#9CA3AF' : '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: loading || !password ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {loading ? 'Signing in...' : 'Access dashboard →'}
        </button>

        <p style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 20 }}>
          This is an internal tool for Shiprocket's performance marketing team
        </p>
      </div>
    </div>
  )
}
