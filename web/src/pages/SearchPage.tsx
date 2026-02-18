import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router'
import { useAudio } from '../contexts/AudioContext'
import { API_URL } from '../lib/constants'

interface SearchResult {
  type: 'track' | 'artist'
  id: string
  title?: string
  slug?: string
  username?: string
  displayName?: string
  wallet?: string
  coverUrl?: string | null
  avatarUrl?: string | null
  genre?: string
  plays?: number
  followerCount?: number
  trackCount?: number
}

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const { theme } = useAudio()
  
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'tracks' | 'artists'>('all')

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const fetchResults = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}&limit=50`)
        if (!res.ok) throw new Error('Search failed')
        const data = await res.json()
        setResults(data.results || [])
      } catch (e) {
        setError('Failed to search. Please try again.')
        console.error('Search error:', e)
      } finally {
        setIsLoading(false)
      }
    }

    fetchResults()
  }, [query])

  const filteredResults = results.filter((r) => {
    if (activeTab === 'all') return true
    return r.type === activeTab.slice(0, -1) // 'tracks' -> 'track', 'artists' -> 'artist'
  })

  const trackCount = results.filter((r) => r.type === 'track').length
  const artistCount = results.filter((r) => r.type === 'artist').length

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 700,
          marginBottom: '8px',
          color: 'var(--text-primary)',
        }}
      >
        Search Results
      </h1>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--text-secondary)',
          marginBottom: '24px',
        }}
      >
        {query ? `Results for "${query}"` : 'Enter a search term'}
      </p>

      {/* Tabs */}
      {query && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '12px',
          }}
        >
          {[
            { key: 'all', label: 'All', count: results.length },
            { key: 'tracks', label: 'Tracks', count: trackCount },
            { key: 'artists', label: 'Artists', count: artistCount },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                background: activeTab === tab.key ? 'var(--accent)' : 'transparent',
                color: activeTab === tab.key ? 'white' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {tab.label}
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: activeTab === tab.key ? 'rgba(255,255,255,0.2)' : 'var(--bg-card)',
                  fontSize: '11px',
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Searching...</p>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Results */}
      {!isLoading && !error && filteredResults.length === 0 && query && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <h3
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            No results found
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Try searching for a different track title, artist name, or genre
          </p>
        </div>
      )}

      {/* Results grid */}
      {!isLoading && filteredResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredResults.map((result) => (
            <Link
              key={`${result.type}-${result.id}`}
              to={
                result.type === 'track'
                  ? `/${result.username}/${result.slug}`
                  : `/${result.username}`
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px',
                background: 'var(--bg-card)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-card-hover)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-card)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {/* Image */}
              {result.type === 'track' ? (
                result.coverUrl ? (
                  <img
                    src={result.coverUrl}
                    alt=""
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '8px',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '8px',
                      background: 'var(--bg-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '28px',
                    }}
                  >
                    🎵
                  </div>
                )
              ) : result.avatarUrl ? (
                <img
                  src={result.avatarUrl}
                  alt=""
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'var(--bg-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '28px',
                  }}
                >
                  👤
                </div>
              )}

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {result.type === 'track' ? result.title : result.displayName || result.username}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {result.type === 'track' ? (
                    <>
                      <span>🎵 Track</span>
                      <span>•</span>
                      <span>{result.genre}</span>
                      {result.plays !== undefined && (
                        <>
                          <span>•</span>
                          <span>{result.plays.toLocaleString()} plays</span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span>👤 Artist</span>
                      <span>•</span>
                      <span>@{result.username}</span>
                      {result.followerCount !== undefined && (
                        <>
                          <span>•</span>
                          <span>{result.followerCount.toLocaleString()} followers</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Arrow */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: 'var(--text-muted)' }}
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
