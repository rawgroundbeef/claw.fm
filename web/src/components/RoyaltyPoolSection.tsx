import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { API_URL } from '../lib/constants'

interface PoolData {
  pool: {
    current: number
    totalDistributed: number
    nextDistribution: number
  }
  stats: {
    totalArtists: number
  }
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

/**
 * Phase 1: Inline Banner
 * Always shown when no distributions have occurred yet
 */
function RoyaltyBanner() {
  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        padding: '20px 0',
      }}
    >
      <div
        className="royalty-banner-content"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>💰</span>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--text-primary)',
              }}
            >
              <strong>Artists earn royalties</strong> from every play.
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--text-secondary)',
                marginTop: '2px',
              }}
            >
              Distributed daily based on engagement.
            </div>
          </div>
        </div>
        <Link
          to="/royalties"
          className="royalty-banner-link"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--accent)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          Learn more
          <span
            className="arrow"
            style={{
              display: 'inline-block',
              transition: 'transform 0.2s ease',
            }}
          >
            →
          </span>
        </Link>
      </div>

      <style>{`
        .royalty-banner-link:hover .arrow {
          transform: translateX(3px);
        }
        @media (max-width: 640px) {
          .royalty-banner-content {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * Phase 2: Slim Card
 * Shown when totalDistributed > 0
 */
function RoyaltySlimCard({ totalDistributed }: { totalDistributed: number }) {
  return (
    <div
      className="royalty-slim-card"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left accent gradient bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '3px',
          background: 'linear-gradient(180deg, var(--accent) 0%, var(--gold) 100%)',
        }}
      />

      <div
        className="royalty-slim-card-content"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        {/* Left: Text content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}
          >
            Artists earn royalties from every play
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginTop: '4px',
            }}
          >
            Distributed daily based on engagement. 75% direct · 20% pool.
          </div>
        </div>

        {/* Center: Stat */}
        <div
          className="royalty-stat"
          style={{
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--gold)',
            }}
          >
            {formatUsd(totalDistributed)}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              marginTop: '2px',
            }}
          >
            Distributed
          </div>
        </div>

        {/* Right: CTA button */}
        <Link
          to="/royalties"
          className="royalty-cta-button"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'white',
            background: 'var(--accent)',
            padding: '10px 16px',
            borderRadius: '8px',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px var(--accent-glow)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          View pool
          <span>→</span>
        </Link>
      </div>

      <style>{`
        .royalty-cta-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px var(--accent-glow);
        }
        @media (max-width: 640px) {
          .royalty-slim-card-content {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 16px !important;
          }
          .royalty-stat {
            text-align: left !important;
          }
          .royalty-cta-button {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>
    </div>
  )
}

export function RoyaltyPoolSection() {
  const [data, setData] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/api/royalties/pool`)
      .then(res => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '20px 0' }}>
        <div
          className="flex items-center justify-center"
          style={{ height: '60px' }}
        >
          <div
            className="animate-spin"
            style={{
              width: '20px',
              height: '20px',
              border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
            }}
          />
        </div>
      </div>
    )
  }

  if (!data) return null

  // Phase 2: Show slim card if there have been distributions
  if (data.pool.totalDistributed > 0) {
    return <RoyaltySlimCard totalDistributed={data.pool.totalDistributed} />
  }

  // Phase 1: Show banner if no distributions yet
  return <RoyaltyBanner />
}
