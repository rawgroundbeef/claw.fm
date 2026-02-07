import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useAudio } from '../contexts/AudioContext'
import { EmptyState } from '../components/EmptyState'
import { ActionBar } from '../components/ActionBar'
import { Identicon } from '../components/Identicon'
import { API_URL } from '../lib/constants'

interface Stats {
  playsToday: number
  totalArtists: number
  totalTracks: number
  tipsTodayUsd: number
}

interface RisingTrack {
  id: number
  slug: string
  title: string
  artist: {
    handle: string
    displayName: string
    avatarUrl: string | null
  }
  coverUrl: string | null
  genre: string
  duration: number
  plays: number
  rank: number
}

interface RecentTrack {
  id: number
  slug: string
  title: string
  artist: {
    handle: string
    displayName: string
    avatarUrl: string | null
  }
  coverUrl: string | null
  genre: string
  duration: number
  submittedAt: string
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatTimeAgo(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isNew(isoDate: string): boolean {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  return diffMs < 15 * 60 * 1000 // 15 minutes
}

// Section title styling
const sectionTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '2.5px',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
}

const sectionLinkStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-tertiary)',
  textDecoration: 'none',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.5px',
}

export function RadioPage() {
  const { nowPlaying, crossfade, triggerConfetti } = useAudio()
  const [coverError, setCoverError] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [risingTracks, setRisingTracks] = useState<RisingTrack[]>([])
  const [recentTracks, setRecentTracks] = useState<RecentTrack[]>([])
  
  // Reset cover error when track changes
  useEffect(() => {
    setCoverError(false)
  }, [crossfade.currentTrack?.id])

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/stats`)
        if (res.ok) setStats(await res.json())
      } catch (e) {
        console.error('Failed to fetch stats:', e)
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 60000) // Refresh every minute
    return () => clearInterval(interval)
  }, [])

  // Fetch rising tracks
  useEffect(() => {
    const fetchRising = async () => {
      try {
        const res = await fetch(`${API_URL}/api/tracks/rising?limit=5`)
        if (res.ok) {
          const data = await res.json()
          setRisingTracks(data.tracks || [])
        }
      } catch (e) {
        console.error('Failed to fetch rising:', e)
      }
    }
    fetchRising()
    const interval = setInterval(fetchRising, 60000)
    return () => clearInterval(interval)
  }, [])

  // Fetch recent tracks
  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const res = await fetch(`${API_URL}/api/tracks/recent?limit=7`)
        if (res.ok) {
          const data = await res.json()
          setRecentTracks(data.tracks || [])
        }
      } catch (e) {
        console.error('Failed to fetch recent:', e)
      }
    }
    fetchRecent()
    const interval = setInterval(fetchRecent, 30000) // Refresh every 30s for recent
    return () => clearInterval(interval)
  }, [])

  // Determine state machine
  const isWaiting = nowPlaying.state === 'waiting'
  const isPrePlay = nowPlaying.state === 'playing' && !crossfade.isPlaying

  // Display artist name
  const displayArtist = crossfade.currentTrack
    ? crossfade.currentTrack.artistDisplayName ||
      crossfade.currentTrack.artistName ||
      `${crossfade.currentTrack.artistWallet.slice(0, 6)}...${crossfade.currentTrack.artistWallet.slice(-4)}`
    : ''

  // Artist link
  const artistPath = crossfade.currentTrack
    ? (crossfade.currentTrack.artistUsername
        ? `/artist/${crossfade.currentTrack.artistUsername}`
        : `/artist/by-wallet/${crossfade.currentTrack.artistWallet}`)
    : '/'

  // Play a track by clicking on it
  const handlePlayTrack = (track: RisingTrack | RecentTrack) => {
    // Convert to NowPlayingTrack format and play
    crossfade.playOverride({
      id: track.id,
      title: track.title,
      slug: track.slug,
      artistWallet: '', // We don't have this in the response, but it's not needed for playback
      artistName: track.artist.displayName,
      duration: track.duration,
      coverUrl: track.coverUrl || undefined,
      fileUrl: '', // Will be resolved by the player
      genre: track.genre,
      artistUsername: track.artist.handle,
      artistDisplayName: track.artist.displayName,
      artistAvatarUrl: track.artist.avatarUrl || undefined,
    })
  }

  return (
    <div className="flex flex-col" style={{ paddingBottom: '120px' }}>
      {/* NOW PLAYING HERO */}
      <section
        className="relative flex flex-col items-center"
        style={{ padding: '48px 24px 40px', overflow: 'hidden' }}
      >
        {/* Background glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center top, var(--accent-dim) 0%, transparent 60%)',
          }}
        />

        {isWaiting ? (
          <EmptyState />
        ) : (
          <>
            {/* Live indicator */}
            <div className="flex items-center gap-2 relative z-10" style={{ marginBottom: '24px' }}>
              <span
                className="inline-block rounded-full"
                style={{
                  width: '8px',
                  height: '8px',
                  background: 'var(--accent)',
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
              <span
                className="uppercase font-medium"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  letterSpacing: '2px',
                  color: 'var(--text-secondary)',
                }}
              >
                LIVE
              </span>
            </div>

            {/* Album art */}
            <div
              className="relative rounded-lg overflow-hidden flex items-end justify-center z-10"
              style={{
                width: 'min(260px, 70vw)',
                height: 'min(260px, 70vw)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 80px var(--accent-dim)',
                marginBottom: '20px',
              }}
            >
              {crossfade.currentTrack?.coverUrl && !coverError ? (
                <img
                  src={crossfade.currentTrack.coverUrl}
                  alt={`${crossfade.currentTrack.title} cover`}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={() => setCoverError(true)}
                />
              ) : crossfade.currentTrack ? (
                <Identicon 
                  seed={`${crossfade.currentTrack.id}-${crossfade.currentTrack.title}`} 
                  size={260} 
                  className="absolute inset-0 w-full h-full"
                />
              ) : null}
              {crossfade.isPlaying && (
                <div className="relative flex items-end justify-center gap-1 pb-6 z-10">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <span
                      key={i}
                      className="rounded-full"
                      style={{
                        width: '3px',
                        height: '24px',
                        background: 'var(--accent)',
                        opacity: 0.9,
                        animation: `wave 1s ease-in-out infinite`,
                        animationDelay: `${i * 0.1}s`,
                        transformOrigin: 'bottom',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Track info */}
            <div className="text-center relative z-10">
              <h2
                className="font-semibold"
                style={{ fontSize: '22px', color: 'var(--text-primary)', marginBottom: '4px' }}
              >
                {crossfade.currentTrack?.title || 'Loading...'}
              </h2>
              <Link
                to={artistPath}
                className="transition-colors"
                style={{ fontSize: '14px', color: 'var(--text-secondary)', textDecoration: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {displayArtist}
              </Link>
            </div>

            {/* Action buttons */}
            {crossfade.isPlaying && crossfade.currentTrack && nowPlaying.track && (
              <div className="relative z-10" style={{ marginTop: '24px' }}>
                <ActionBar
                  trackId={nowPlaying.track.id}
                  trackTitle={nowPlaying.track.title}
                  onTipSuccess={triggerConfetti}
                />
              </div>
            )}

            {/* Pre-play button */}
            {isPrePlay && (
              <button
                onClick={crossfade.play}
                disabled={crossfade.isLoading || crossfade.isBuffering}
                className="flex items-center justify-center transition-all relative z-10"
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  boxShadow: '0 8px 32px var(--accent-glow)',
                  marginTop: '24px',
                  opacity: crossfade.isLoading || crossfade.isBuffering ? 0.5 : 1,
                  cursor: crossfade.isLoading || crossfade.isBuffering ? 'not-allowed' : 'pointer',
                  border: 'none',
                }}
              >
                {crossfade.isBuffering ? (
                  <div
                    className="border-4 border-white rounded-full animate-spin"
                    style={{ width: '32px', height: '32px', borderTopColor: 'transparent' }}
                  />
                ) : (
                  <svg className="ml-1" width="40" height="40" fill="white" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            )}
          </>
        )}
      </section>

      {/* STATS BAR */}
      {stats && (
        <div
          className="flex justify-center"
          style={{
            gap: '40px',
            padding: '32px 24px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {[
            { value: stats.playsToday.toLocaleString(), label: 'Plays Today' },
            { value: stats.totalArtists.toString(), label: 'Artists' },
            { value: stats.totalTracks.toString(), label: 'Tracks' },
            { value: `$${stats.tipsTodayUsd.toFixed(2)}`, label: 'Tips Today' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '22px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  marginTop: '4px',
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONTENT */}
      <div style={{ padding: '0 24px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        {/* RISING SECTION */}
        {risingTracks.length > 0 && (
          <section style={{ marginTop: '48px' }}>
            <div className="flex justify-between items-baseline" style={{ marginBottom: '20px' }}>
              <span style={sectionTitleStyle}>🔥 Rising</span>
              <a href="#" style={sectionLinkStyle}>View all →</a>
            </div>
            <div
              className="grid"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              {risingTracks.map((track) => (
                <div
                  key={track.id}
                  onClick={() => handlePlayTrack(track)}
                  className="cursor-pointer transition-all"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '14px',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 107, 74, 0.3)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {/* Cover art */}
                  <div
                    className="relative overflow-hidden"
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: '6px',
                      marginBottom: '12px',
                      background: track.coverUrl ? undefined : 'var(--cover-gradient)',
                    }}
                  >
                    {track.coverUrl && (
                      <img
                        src={track.coverUrl}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {/* Rank badge */}
                    <span
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: 'rgba(0,0,0,0.7)',
                        color: 'var(--accent)',
                        padding: '2px 7px',
                        borderRadius: '4px',
                      }}
                    >
                      #{track.rank}
                    </span>
                  </div>
                  {/* Track info */}
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      marginBottom: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {track.title}
                  </div>
                  <Link
                    to={`/artist/${track.artist.handle}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block transition-colors"
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginBottom: '8px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  >
                    {track.artist.displayName}
                  </Link>
                  <div
                    className="flex items-center"
                    style={{
                      gap: '8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <span>▶ {track.plays}</span>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '3px',
                        background: 'rgba(255,255,255,0.06)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {track.genre}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* JUST DROPPED SECTION */}
        {recentTracks.length > 0 && (
          <section style={{ marginTop: '48px' }}>
            <div className="flex justify-between items-baseline" style={{ marginBottom: '20px' }}>
              <span style={sectionTitleStyle}>Just Dropped</span>
              <a href="#" style={sectionLinkStyle}>View all →</a>
            </div>
            <div className="flex flex-col" style={{ gap: '2px' }}>
              {recentTracks.map((track) => (
                <div
                  key={track.id}
                  onClick={() => handlePlayTrack(track)}
                  className="flex items-center cursor-pointer transition-colors"
                  style={{
                    gap: '14px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-card)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    className="flex-shrink-0 overflow-hidden"
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '5px',
                      background: track.coverUrl ? undefined : 'var(--cover-gradient)',
                    }}
                  >
                    {track.coverUrl && (
                      <img
                        src={track.coverUrl}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {track.title}
                      {isNew(track.submittedAt) && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '9px',
                            fontWeight: 700,
                            letterSpacing: '1px',
                            color: 'var(--accent)',
                            background: 'var(--accent-dim)',
                            padding: '2px 5px',
                            borderRadius: '3px',
                            marginLeft: '6px',
                            verticalAlign: 'middle',
                          }}
                        >
                          NEW
                        </span>
                      )}
                    </div>
                    <Link
                      to={`/artist/${track.artist.handle}`}
                      onClick={(e) => e.stopPropagation()}
                      className="transition-colors"
                      style={{ fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                    >
                      {track.artist.displayName}
                    </Link>
                  </div>
                  {/* Right side metadata */}
                  <div className="flex items-center flex-shrink-0" style={{ gap: '16px' }}>
                    <span
                      className="hidden sm:block"
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-tertiary)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'rgba(255,255,255,0.04)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {track.genre}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        minWidth: '60px',
                        textAlign: 'right',
                      }}
                    >
                      {formatTimeAgo(track.submittedAt)}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {formatDuration(track.duration)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
