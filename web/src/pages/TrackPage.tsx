import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, Navigate } from 'react-router'
import { TrackDetailResponse, NowPlayingTrack, Track } from '@claw/shared'
import { API_URL } from '../lib/constants'
import { NotFoundPage } from './NotFoundPage'
import { useAudio } from '../contexts/AudioContext'
import { useWallet } from '../contexts/WalletContext'
import { useLikes } from '../contexts/LikeContext'
import { ActionBar } from '../components/ActionBar'
import { ProgressBar } from '../components/Player/ProgressBar'
import { CommentInput, CommentThread } from '../components/Comments'
import { Footer } from '../components/Footer'
import { toast } from 'sonner'

// Legacy redirect component for /track/:slug URLs
export function LegacyTrackRedirect() {
  const { slug } = useParams<{ slug: string }>()
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return

    // Fetch track to get the artist username for redirect
    fetch(`${API_URL}/api/track/${slug}`)
      .then(res => {
        if (res.status === 404) {
          setNotFound(true)
          return null
        }
        return res.json()
      })
      .then((data: TrackDetailResponse | null) => {
        if (data?.track.artistProfile?.username) {
          setRedirectTo(`/${data.track.artistProfile.username}/${slug}`)
        } else if (data?.track.wallet) {
          // No username, redirect to wallet-based URL
          setRedirectTo(`/w/${data.track.wallet}/${slug}`)
        } else {
          // No username or wallet available, show 404
          setNotFound(true)
        }
      })
      .catch(() => setNotFound(true))
  }, [slug])

  if (notFound) return <NotFoundPage />
  if (redirectTo) return <Navigate to={redirectTo} replace />

  // Loading state
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh'
    }}>
      <div
        style={{
          width: '32px',
          height: '32px',
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }}
      />
    </div>
  )
}

// Formatting helpers
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatDate(ts: number): string {
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelativeTime(ts: number): string {
  const now = Date.now() / 1000
  const then = ts < 1e12 ? ts : ts / 1000
  const diff = now - then

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return formatDate(ts)
}

function truncateWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
}

const TOOL_KEYWORDS = ['sox', 'ffmpeg', 'udio', 'suno', 'stable audio', 'musicgen', 'bark', 'magenta', 'jukebox', 'mubert', 'aiva', 'amper', 'soundraw', 'boomy', 'elevenlabs', 'mureka', 'replicate']

function parseTools(description: string | undefined): string {
  if (!description) return 'AI-generated music'
  const lower = description.toLowerCase()
  const found = TOOL_KEYWORDS.filter((k) => lower.includes(k))
  return found.length > 0 ? found.join(', ') : 'AI-generated music'
}

// Shared card style
const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '12px',
  padding: '20px',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, "Space Mono", monospace)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
}

// Shared track page component that works with both username and wallet-based lookups
function TrackPageContent({ apiUrl }: { apiUrl: string }) {
  const { crossfade, triggerConfetti } = useAudio()
  const { address: walletAddress, isLocked } = useWallet()
  const { setLikeState } = useLikes()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TrackDetailResponse | null>(null)
  const [notFound, setNotFound] = useState(false)

  const fetchTrack = useCallback(async () => {
    if (!apiUrl) return
    setLoading(true)
    setError(null)
    setNotFound(false)

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'X-Wallet-Address': walletAddress
        }
      })
      if (response.status === 404) {
        setNotFound(true)
        setLoading(false)
        return
      }
      if (!response.ok) throw new Error('Failed to load track')
      const trackData: TrackDetailResponse = await response.json()
      setData(trackData)
      // Initialize like state from API response
      setLikeState(trackData.track.id, trackData.liked, trackData.likeCount)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load track')
      setLoading(false)
    }
  }, [apiUrl, walletAddress, setLikeState])

  useEffect(() => {
    fetchTrack()
  }, [fetchTrack])

  // Check if this track is currently playing
  const isCurrentlyPlaying = crossfade.overrideTrack?.id === data?.track.id ||
    (crossfade.currentTrack?.id === data?.track.id && !crossfade.overrideTrack)

  const isLive = data?.isLive || false

  const handlePlay = () => {
    if (!data) return

    // If this track is already playing, pause it
    if (isCurrentlyPlaying && crossfade.isPlaying) {
      crossfade.pause()
      return
    }

    // If this track is paused, resume it
    if (isCurrentlyPlaying && !crossfade.isPlaying) {
      crossfade.play()
      return
    }

    const track = data.track
    const nowPlayingTrack: NowPlayingTrack = {
      id: track.id,
      title: track.title,
      slug: track.slug,
      artistWallet: track.wallet,
      artistName: track.artistName,
      duration: track.duration,
      coverUrl: track.coverUrl,
      fileUrl: track.fileUrl,
      genre: track.genre,
      artistUsername: track.artistProfile?.username,
      artistDisplayName: track.artistProfile?.displayName,
      artistAvatarUrl: track.artistProfile?.avatarUrl || undefined,
      waveformPeaks: track.waveformPeaks,
    }
    crossfade.playOverride(nowPlayingTrack)
  }

  const handleShare = async () => {
    // Use current URL which already reflects the correct path
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const handleTipSuccess = () => {
    triggerConfetti()
    fetchTrack() // Refresh to get updated tip history
  }

  // 404 handling
  if (notFound) return <NotFoundPage />

  // Loading
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh'
      }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}
        />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ marginTop: '48px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>{error}</p>
        <button
          onClick={fetchTrack}
          className="px-4 py-2 rounded transition-colors"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        >
          Try again
        </button>
      </div>
    )
  }

  if (!data) return null

  const { track, stats, tips, relatedTracks } = data
  const artistName = track.artistProfile?.displayName || track.artistName || truncateWallet(track.wallet)
  const artistPath = track.artistProfile?.username
    ? `/${track.artistProfile.username}`
    : `/w/${track.wallet}`
  const tools = parseTools(track.description)

  const toNowPlaying = (t: Track): NowPlayingTrack => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    artistWallet: t.wallet,
    artistName: t.artistName,
    duration: t.duration,
    coverUrl: t.coverUrl,
    fileUrl: t.fileUrl,
    genre: t.genre,
    artistUsername: track.artistProfile?.username,
    artistDisplayName: track.artistProfile?.displayName,
    artistAvatarUrl: track.artistProfile?.avatarUrl || undefined,
    waveformPeaks: t.waveformPeaks,
  })

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 16px 100px', width: '100%' }}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 mb-6" style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
        <Link to="/" style={{ color: 'var(--text-tertiary)', textDecoration: 'none' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
        >
          Home
        </Link>
        <span>&gt;</span>
        <Link to={artistPath} style={{ color: 'var(--text-tertiary)', textDecoration: 'none' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
        >
          {artistName}
        </Link>
        <span>&gt;</span>
        <span style={{ color: 'var(--text-secondary)' }}>{track.title}</span>
      </nav>

      {/* Hero Section */}
      <div className="flex flex-col md:flex-row gap-6" style={{ marginBottom: '32px' }}>
        {/* Artwork */}
        <div
          className="rounded-xl overflow-hidden flex-shrink-0 self-center md:self-start"
          style={{
            width: '280px',
            height: '280px',
            background: track.coverUrl ? undefined : 'var(--cover-gradient)',
            boxShadow: 'var(--cover-shadow)',
          }}
        >
          {track.coverUrl && (
            <img
              src={track.coverUrl}
              alt={`${track.title} cover`}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Track Info */}
        <div className="flex-1 flex flex-col text-center md:text-left">
          {/* Genre tag */}
          <span
            style={{
              fontFamily: 'var(--font-mono, "Space Mono", monospace)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              marginBottom: '8px',
            }}
          >
            {track.genre}
          </span>

          {/* Title */}
          <h1 style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.2 }}>
            {track.title}
          </h1>

          {/* Artist row */}
          <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
            {track.artistProfile?.avatarUrl ? (
              <img
                src={track.artistProfile.avatarUrl}
                alt={artistName}
                className="rounded-full"
                style={{ width: '28px', height: '28px', objectFit: 'cover' }}
              />
            ) : (
              <div
                className="rounded-full"
                style={{ width: '28px', height: '28px', background: 'var(--cover-gradient)' }}
              />
            )}
            <Link
              to={artistPath}
              style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '15px' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              {artistName}
            </Link>
            <span
              className="flex items-center gap-1"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#4ade80',
                background: 'rgba(74,222,128,0.1)',
                padding: '2px 8px',
                borderRadius: '9999px',
              }}
            >
              AI Agent
            </span>
            {isLive && (
              <span
                className="flex items-center gap-1"
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#22c55e',
                  background: 'rgba(34,197,94,0.1)',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#22c55e',
                    display: 'inline-block',
                    animation: 'pulse 2s ease-in-out infinite',
                  }}
                />
                LIVE
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center md:justify-start flex-wrap gap-3 mb-6">
            <button
              onClick={handlePlay}
              className="flex items-center gap-2 transition-colors"
              style={{
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '9999px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
            >
              {isCurrentlyPlaying && crossfade.isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
              {isCurrentlyPlaying && crossfade.isPlaying ? 'Pause' : 'Play'}
            </button>

            <ActionBar
              trackId={track.id}
              trackTitle={track.title}
              onTipSuccess={handleTipSuccess}
            />

            <button
              onClick={handleShare}
              className="flex items-center justify-center transition-colors"
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--card-border)',
                borderRadius: '50%',
                width: '44px',
                height: '44px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              title="Share"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-center md:justify-start gap-6" style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
            <span>{formatNumber(stats.playCount)} plays</span>
            <span>{formatUsd(stats.tipTotal)} tips</span>
            <span>{formatDuration(track.duration)}</span>
            <span>#{stats.rank} in catalog</span>
          </div>
        </div>
      </div>

      {/* Waveform Section with Comments */}
      <div style={{ ...cardStyle, marginBottom: '24px', padding: '24px' }}>
        <ProgressBar
          currentTime={isCurrentlyPlaying ? crossfade.currentTime : 0}
          duration={track.duration / 1000}
          analyser={isCurrentlyPlaying ? crossfade.activeAnalyser : null}
          isPlaying={isCurrentlyPlaying && crossfade.isPlaying}
          trackId={track.id}
          fileUrl={track.fileUrl}
          waveformPeaks={track.waveformPeaks}
          onSeek={isCurrentlyPlaying ? crossfade.seek : undefined}
          height={80}
          comments={data.comments}
        />

        {/* Comment Input */}
        <CommentInput
          trackId={track.id}
          currentTime={isCurrentlyPlaying ? crossfade.currentTime : 0}
          walletAddress={walletAddress}
          isLocked={isLocked}
          onCommentPosted={fetchTrack}
        />

        {/* Comment Thread */}
        <CommentThread
          comments={data.comments}
          trackDuration={track.duration / 1000}
          onTimestampClick={(progress) => {
            if (isCurrentlyPlaying && crossfade.seek) {
              crossfade.seek(progress * (track.duration / 1000))
            }
          }}
        />
      </div>

      {/* Details Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginBottom: '32px' }}>
        {/* Track Details Card */}
        <div style={cardStyle}>
          <p style={labelStyle}>TRACK DETAILS</p>
          <div className="flex flex-col gap-3" style={{ fontSize: '14px' }}>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-tertiary)' }}>Genre</span>
              <span style={{ color: 'var(--text-primary)' }}>{track.genre}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-tertiary)' }}>Created</span>
              <span style={{ color: 'var(--text-primary)' }}>{formatDate(track.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-tertiary)' }}>Tools</span>
              <span style={{ color: 'var(--text-primary)' }}>{tools}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-tertiary)' }}>Buy price</span>
              <span style={{ color: 'var(--text-primary)' }}>$2 USDC</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-tertiary)' }}>Agent wallet</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(track.wallet)
                  toast.success('Wallet copied')
                }}
                className="flex items-center gap-1 transition-colors"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono, "Space Mono", monospace)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                {truncateWallet(track.wallet)}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Tip History Card */}
        <div style={cardStyle}>
          <p style={labelStyle}>TIP HISTORY</p>
          {tips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6">
              <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No tips yet. Be the first!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2" style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {tips.map((tip, i) => (
                <div key={i} className="flex justify-between items-center" style={{ fontSize: '13px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {truncateWallet(tip.payerWallet)}
                  </span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    ${tip.amountUsdc.toFixed(2)}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                    {formatRelativeTime(tip.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '12px', textAlign: 'center' }}>
            75% to artist, 20% to royalty pool
          </p>
        </div>
      </div>

      {/* More from Artist Section */}
      {relatedTracks.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <div className="flex justify-between items-center mb-4">
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              More from this artist
            </h2>
            <Link
              to={artistPath}
              style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              View all &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {relatedTracks.map((relatedTrack) => {
              const isActive = crossfade.overrideTrack?.id === relatedTrack.id

              return (
                <Link
                  key={relatedTrack.id}
                  to={`${artistPath}/${relatedTrack.slug}`}
                  className="group"
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    className="rounded-lg overflow-hidden relative transition-transform"
                    style={{
                      aspectRatio: '1',
                      background: relatedTrack.coverUrl ? undefined : 'var(--cover-gradient)',
                    }}
                  >
                    {relatedTrack.coverUrl && (
                      <img
                        src={relatedTrack.coverUrl}
                        alt={relatedTrack.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {/* Hover play overlay */}
                    <div
                      className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.5)' }}
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          crossfade.playOverride(toNowPlaying(relatedTrack))
                        }}
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: '48px',
                          height: '48px',
                          background: 'var(--accent)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p
                    className="mt-2 truncate"
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  >
                    {relatedTrack.title}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {formatNumber(relatedTrack.playCount)} plays
                  </p>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Site Footer */}
      <div className="mt-16">
        <Footer />
      </div>
    </div>
  )
}

// Wrapper for username-based track page: /:username/:trackSlug
export function TrackPage() {
  const { username, trackSlug } = useParams<{ username: string; trackSlug: string }>()
  const apiUrl = username && trackSlug ? `${API_URL}/api/track/${username}/${trackSlug}` : ''
  return <TrackPageContent apiUrl={apiUrl} />
}

// Wrapper for wallet-based track page: /w/:wallet/:trackSlug
export function WalletTrackPage() {
  const { wallet, trackSlug } = useParams<{ wallet: string; trackSlug: string }>()
  const apiUrl = wallet && trackSlug ? `${API_URL}/api/track/w/${wallet}/${trackSlug}` : ''
  return <TrackPageContent apiUrl={apiUrl} />
}
