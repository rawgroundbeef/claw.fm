import { useEffect, useState } from 'react'
import { API_URL } from '../lib/constants'

interface EarningsData {
  success: boolean
  earnings?: {
    lamports: string
    sol: number
    usd: number
    solPriceUsd: number
    formatted: string
  }
  error?: string
  message?: string
}

function formatUsd(n: number): string {
  // Format as integer dollars with commas for thousands
  return `$${Math.round(n).toLocaleString()}`
}

const TOKEN_ADDRESS = '3W6H1ZUPArP4qhfVp8gGvZtay7ucE8swqNPeAGhiBAGS'

export function TokenSection() {
  const [earnings, setEarnings] = useState<EarningsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const fetchEarnings = async () => {
      try {
        const res = await fetch(`${API_URL}/api/bags-token/earnings`)
        if (res.ok) {
          const data = await res.json() as EarningsData
          setEarnings(data)
        } else {
          // If API key not configured or other error, still show the section
          const errorData = await res.json().catch(() => ({}))
          console.error('Failed to fetch earnings:', res.status, errorData)
          setEarnings({ success: false, error: 'UNAVAILABLE' })
        }
      } catch (error) {
        console.error('Failed to fetch token earnings:', error)
        setEarnings({ success: false, error: 'FETCH_ERROR' })
      } finally {
        setLoading(false)
      }
    }

    fetchEarnings()
    // Refresh every 5 minutes
    const interval = setInterval(fetchEarnings, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(TOKEN_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
      <div
        className="token-section-card"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px 20px',
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
          background: 'linear-gradient(180deg, #9945FF 0%, #14F195 100%)',
        }}
      />

      <div
        className="token-section-content"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '16px',
          alignItems: 'center',
        }}
      >
        {/* Column 1: Community token + token address */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}
          >
            Community token on Solana
          </div>
          {/* Token address with copy button */}
          <button
            onClick={handleCopyAddress}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              width: 'fit-content',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover-strong)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
            }}
          >
            <span style={{ opacity: 0.7 }}>
              {TOKEN_ADDRESS.slice(0, 8)}...{TOKEN_ADDRESS.slice(-8)}
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.6, flexShrink: 0 }}
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied && (
              <span style={{ color: 'var(--accent)', fontSize: '10px', marginLeft: '4px' }}>
                Copied!
              </span>
            )}
          </button>
        </div>

        {/* Column 2: Trading fees + fees amount */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}
          >
            Trading fees support claw.fm development
          </div>
          {!loading && earnings?.earnings && (
            <a
              href="https://bags.fm/3W6H1ZUPArP4qhfVp8gGvZtay7ucE8swqNPeAGhiBAGS"
              target="_blank"
              rel="noopener noreferrer"
              className="token-earnings-stat"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#14F195',
                }}
              >
                {earnings.earnings.solPriceUsd > 0 && !isNaN(earnings.earnings.usd)
                  ? formatUsd(earnings.earnings.usd)
                  : `${earnings.earnings.sol.toFixed(4)} SOL`}
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                style={{
                  opacity: 0.6,
                  flexShrink: 0,
                }}
              >
                <path
                  d="M2 2h8v8M10 2L2 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          )}
        </div>

        {/* Column 3: CTA button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <a
            href="https://bags.fm/3W6H1ZUPArP4qhfVp8gGvZtay7ucE8swqNPeAGhiBAGS"
            target="_blank"
            rel="noopener noreferrer"
            className="token-cta-button"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              padding: '16px 20px',
              borderRadius: '10px',
              textDecoration: 'none',
              transition: 'background 0.2s ease, transform 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minWidth: '100px',
            }}
          >
            <img
              src="https://bags.fm/assets/images/bags-icon.png"
              alt="bags.fm"
              style={{
                width: '32px',
                height: '32px',
                flexShrink: 0,
              }}
            />
            <span>{loading ? 'Loading...' : 'View on bags.fm'}</span>
          </a>
        </div>
      </div>

      <style>{`
        .token-cta-button:hover {
          background: var(--bg-hover-strong);
          transform: translateY(-1px);
        }
        .token-earnings-stat a:hover {
          opacity: 0.8;
        }
        .token-earnings-stat a:hover svg {
          opacity: 1;
          transform: translate(2px, -2px);
        }
        @media (max-width: 960px) {
          .token-section-content {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .token-earnings-stat {
            justify-content: center !important;
          }
          .token-cta-button {
            width: 100% !important;
            min-width: auto !important;
          }
        }
      `}</style>
      </div>
    </div>
  )
}
