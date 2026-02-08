import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router'
import { API_URL } from '../lib/constants'
import { useWallet } from '../contexts/WalletContext'
import { toast } from 'sonner'

interface RoyaltyStats {
  claimable: number
  lifetime: number
  lastClaim: number | null
  pool: {
    balance: number
    lastDistribution: number | null
    nextDistribution: number
  }
  recentAllocations: Array<{
    amount: number
    points: number
    breakdown: {
      plays: number
      likes: number
      comments: number
      tipsReceived: number
    }
    periodEnd: number
  }>
}

interface PoolStats {
  pool: {
    current: number
    totalDistributed: number
    lastDistribution: number | null
    nextDistribution: number
  }
  stats: {
    totalArtists: number
  }
  recentDistributions: Array<{
    amount: number
    totalPoints: number
    artistCount: number
    date: number
  }>
  topEarners: Array<{
    wallet: string
    username: string
    displayName: string
    earned: number
  }>
  economics: {
    artistDirect: string
    royaltyPool: string
    platform: string
    distribution: string
    weights: {
      play: number
      like: number
      comment: number
      tip_received: number
    }
  }
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatDate(ts: number): string {
  if (!ts) return 'Never'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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

export function RoyaltiesPage() {
  const { wallet } = useWallet()
  const [myStats, setMyStats] = useState<RoyaltyStats | null>(null)
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      // Always fetch pool stats (public)
      const poolRes = await fetch(`${API_URL}/api/royalties/pool`)
      if (poolRes.ok) {
        setPoolStats(await poolRes.json())
      }

      // Fetch personal stats if wallet connected
      if (wallet) {
        const myRes = await fetch(`${API_URL}/api/royalties`, {
          headers: { 'X-Wallet-Address': wallet }
        })
        if (myRes.ok) {
          setMyStats(await myRes.json())
        }
      }
    } catch (err) {
      console.error('Failed to fetch royalty stats:', err)
    } finally {
      setLoading(false)
    }
  }, [wallet])

  useEffect(() => {
    fetchStats()
    // Refresh every minute
    const interval = setInterval(fetchStats, 60000)
    return () => clearInterval(interval)
  }, [fetchStats])

  const handleClaim = async () => {
    if (!wallet || !myStats || myStats.claimable < 1) return

    setClaiming(true)
    try {
      const res = await fetch(`${API_URL}/api/royalties/claim`, {
        method: 'POST',
        headers: { 'X-Wallet-Address': wallet }
      })
      const data = await res.json()
      
      if (res.ok) {
        toast.success(`Claimed ${formatUsd(data.amount)}!`)
        fetchStats()
      } else {
        toast.error(data.message || 'Claim failed')
      }
    } catch (err) {
      toast.error('Claim failed')
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 16px 100px' }}>
        <div className="animate-pulse" style={{ height: '200px', background: 'var(--bg-hover)', borderRadius: '12px' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 16px 100px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
          💰 Royalty Pool
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Earn from every tip and purchase on claw.fm. Distributed daily based on your engagement.
        </p>
      </div>

      {/* Economics Overview */}
      <div style={{ 
        background: 'var(--bg-card)', 
        borderRadius: '12px', 
        padding: '24px',
        marginBottom: '24px',
        border: '1px solid var(--border)'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>How It Works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-hover)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>75%</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Direct to Artist</div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-hover)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f59e0b' }}>20%</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Royalty Pool</div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-hover)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-tertiary)' }}>5%</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Platform</div>
          </div>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Every tip and purchase is split: 75% goes directly to the artist, 20% goes into the royalty pool, 
          and 5% supports the platform. The pool is distributed daily at midnight UTC based on engagement.
        </p>
      </div>

      {/* Pool Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ 
          background: 'var(--bg-card)', 
          borderRadius: '12px', 
          padding: '20px',
          border: '1px solid var(--border)'
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Current Pool</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>
            {formatUsd(poolStats?.pool.current || 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            Next distribution in {formatTimeUntil(poolStats?.pool.nextDistribution || 0)}
          </div>
        </div>
        <div style={{ 
          background: 'var(--bg-card)', 
          borderRadius: '12px', 
          padding: '20px',
          border: '1px solid var(--border)'
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Distributed</div>
          <div style={{ fontSize: '28px', fontWeight: 700 }}>
            {formatUsd(poolStats?.pool.totalDistributed || 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            to {poolStats?.stats.totalArtists || 0} artists
          </div>
        </div>
      </div>

      {/* Your Stats (if wallet connected) */}
      {wallet && (
        <div style={{ 
          background: 'linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)', 
          borderRadius: '12px', 
          padding: '24px',
          marginBottom: '24px',
          color: 'white'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', opacity: 0.9 }}>Your Royalties</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '36px', fontWeight: 700 }}>
                {formatUsd(myStats?.claimable || 0)}
              </div>
              <div style={{ fontSize: '14px', opacity: 0.8 }}>
                Available to claim · Lifetime: {formatUsd(myStats?.lifetime || 0)}
              </div>
            </div>
            <button
              onClick={handleClaim}
              disabled={claiming || !myStats || myStats.claimable < 1}
              style={{
                background: 'white',
                color: 'var(--accent)',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: myStats && myStats.claimable >= 1 ? 'pointer' : 'not-allowed',
                opacity: myStats && myStats.claimable >= 1 ? 1 : 0.5
              }}
            >
              {claiming ? 'Claiming...' : 'Claim'}
            </button>
          </div>
          {myStats && myStats.claimable < 1 && myStats.claimable > 0 && (
            <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>
              Minimum claim is $1.00
            </div>
          )}
        </div>
      )}

      {!wallet && (
        <div style={{ 
          background: 'var(--bg-card)', 
          borderRadius: '12px', 
          padding: '24px',
          marginBottom: '24px',
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            Connect your wallet to see your royalties
          </p>
        </div>
      )}

      {/* Engagement Points */}
      <div style={{ 
        background: 'var(--bg-card)', 
        borderRadius: '12px', 
        padding: '24px',
        marginBottom: '24px',
        border: '1px solid var(--border)'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Engagement Points</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Pool distribution is based on your engagement score. Earn points from:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {poolStats?.economics.weights && Object.entries(poolStats.economics.weights).map(([key, value]) => (
            <div key={key} style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-hover)', borderRadius: '8px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {key.replace('_', ' ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Earners */}
      {poolStats?.topEarners && poolStats.topEarners.length > 0 && (
        <div style={{ 
          background: 'var(--bg-card)', 
          borderRadius: '12px', 
          padding: '24px',
          border: '1px solid var(--border)'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Top Earners This Week</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {poolStats.topEarners.map((earner, i) => (
              <Link
                key={earner.wallet}
                to={earner.username ? `/artist/${earner.username}` : `/artist/by-wallet/${earner.wallet}`}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '12px',
                  background: 'var(--bg-hover)',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'inherit'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: i < 3 ? '#f59e0b' : 'var(--text-tertiary)',
                    width: '24px'
                  }}>
                    #{i + 1}
                  </span>
                  <span style={{ fontWeight: 500 }}>{earner.displayName || earner.username || earner.wallet.slice(0, 10)}</span>
                </div>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{formatUsd(earner.earned)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
