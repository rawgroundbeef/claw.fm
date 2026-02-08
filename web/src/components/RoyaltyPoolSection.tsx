import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { API_URL } from '../lib/constants'

interface PoolStats {
  pool: {
    current: number
    totalDistributed: number
    nextDistribution: number
  }
  stats: {
    totalArtists: number
  }
  topEarners: Array<{
    wallet: string
    username: string
    displayName: string
    earned: number
  }>
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatTimeUntil(ts: number): string {
  const now = Date.now() / 1000
  const diff = ts - now
  if (diff <= 0) return 'Now'
  const hours = Math.floor(diff / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function RoyaltyPoolSection() {
  const [stats, setStats] = useState<PoolStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/api/royalties/pool`)
      .then(res => res.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ marginBottom: '32px' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">💰 Royalty Pool</h2>
        </div>
        <div className="animate-pulse" style={{ height: '120px', background: 'var(--bg-hover)', borderRadius: '12px' }} />
      </div>
    )
  }

  if (!stats) return null

  return (
    <div style={{ marginBottom: '32px' }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">💰 Royalty Pool</h2>
        <Link 
          to="/royalties" 
          style={{ 
            fontSize: '13px', 
            color: 'var(--accent)',
            textDecoration: 'none'
          }}
        >
          View details →
        </Link>
      </div>

      <div style={{ 
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        borderRadius: '12px',
        padding: '20px',
        color: 'white'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '4px' }}>Current Pool</div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>{formatUsd(stats.pool.current)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '4px' }}>Next Distribution</div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{formatTimeUntil(stats.pool.nextDistribution)}</div>
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          gap: '24px', 
          paddingTop: '16px', 
          borderTop: '1px solid rgba(255,255,255,0.2)',
          fontSize: '14px'
        }}>
          <div>
            <span style={{ opacity: 0.8 }}>Total Distributed:</span>{' '}
            <span style={{ fontWeight: 600 }}>{formatUsd(stats.pool.totalDistributed)}</span>
          </div>
          <div>
            <span style={{ opacity: 0.8 }}>Artists Earning:</span>{' '}
            <span style={{ fontWeight: 600 }}>{stats.stats.totalArtists}</span>
          </div>
        </div>

        {/* Split explanation */}
        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          background: 'rgba(0,0,0,0.2)', 
          borderRadius: '8px',
          fontSize: '13px'
        }}>
          Every tip & purchase: <strong>75%</strong> artist · <strong>20%</strong> pool · <strong>5%</strong> platform
        </div>
      </div>
    </div>
  )
}
