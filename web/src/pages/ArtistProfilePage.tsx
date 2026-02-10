import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { ArtistPublicProfile, NowPlayingTrack, Track } from '@claw/shared'
import { API_URL } from '../lib/constants'
import { NotFoundPage } from './NotFoundPage'
import { useAudio } from '../contexts/AudioContext'
import { TipArtistModal } from '../components/TipArtistModal'
import { LikeButtonIcon } from '../components/LikeButton'
import { VerifiedBadge } from '../components/VerifiedBadge'
import { Footer } from '../components/Footer'

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

function formatJoinDate(ts: number): string {
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const TOOL_KEYWORDS = ['sox', 'ffmpeg', 'udio', 'suno', 'stable audio', 'musicgen', 'bark', 'magenta', 'jukebox', 'mubert', 'aiva', 'amper', 'soundraw', 'boomy']

function parseTools(bio: string | null): string {
  if (!bio) return 'AI-generated music'
  const lower = bio.toLowerCase()
  const found = TOOL_KEYWORDS.filter((k) => lower.includes(k))
  return found.length > 0 ? found.join(', ') : 'AI-generated music'
}

function extractGenres(tracks: Track[]): string[] {
  const genres = new Set<string>()
  for (const t of tracks) {
    if (t.genre) genres.add(t.genre)
  }
  return Array.from(genres).slice(0, 5)
}

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

interface ProfileData {
  profile: ArtistPublicProfile | null
  tracks: Track[]
}

function ProfilePageContent({ mode }: { mode: 'username' | 'wallet' }) {
  const { username, wallet } = useParams<{ username?: string; wallet?: string }>()
  const navigate = useNavigate()
  const { crossfade, triggerConfetti } = useAudio()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ProfileData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tipOpen, setTipOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const identifier = mode === 'username' ? username : wallet

  const fetchProfile = async () => {
    if (!identifier) return
    setLoading(true)
    setError(null)
    setNotFound(false)

    try {
      const endpoint = mode === 'username'
        ? `${API_URL}/api/artist/${identifier}`
        : `${API_URL}/api/artist/by-wallet/${identifier}`

      const response = await fetch(endpoint)
      if (response.status === 404) {
        setNotFound(true)
        setLoading(false)
        return
      }
      if (!response.ok) throw new Error('Failed to load artist profile')

      const profileData = await response.json()

      // Wallet mode: redirect to username page if profile exists
      if (mode === 'wallet' && profileData.profile) {
        navigate(`/${profileData.profile.username}`, { replace: true })
        return
      }

      setData(profileData)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artist profile')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [identifier, mode])

  const sortedTracks = useMemo(() => {
    if (!data) return []
    return [...data.tracks].sort((a, b) => {
      if (b.playCount !== a.playCount) return b.playCount - a.playCount
      return b.tipWeight - a.tipWeight
    })
  }, [data])

  const topTrack = sortedTracks[0] ?? null

  const stats = useMemo(() => {
    if (!data) return { plays: 0, trackCount: 0, tipsUsd: 0 }
    const plays = data.tracks.reduce((sum, t) => sum + t.playCount, 0)
    const tipsUsd = data.tracks.reduce((sum, t) => sum + t.tipWeight, 0) / 1e17
    return { plays, trackCount: data.tracks.length, tipsUsd }
  }, [data])

  const artistWallet = data?.profile?.wallet || wallet || ''
  const isLive = crossfade.currentTrack?.artistWallet === artistWallet

  const toNowPlaying = (track: Track): NowPlayingTrack => ({
    id: track.id,
    title: track.title,
    slug: track.slug,
    artistWallet: track.wallet,
    artistName: track.artistName,
    duration: track.duration,
    coverUrl: track.coverUrl,
    fileUrl: track.fileUrl,
    genre: track.genre,
    artistUsername: data?.profile?.username,
    artistDisplayName: data?.profile?.displayName,
    artistAvatarUrl: data?.profile?.avatarUrl || undefined,
    artistBio: data?.profile?.bio || undefined,
    waveformPeaks: track.waveformPeaks,
  })

  const handleTrackClick = (track: Track) => {
    crossfade.playOverride(toNowPlaying(track))
  }

  const handleCopyWallet = () => {
    if (!artistWallet) return
    navigator.clipboard.writeText(artistWallet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTipSuccess = () => {
    setTipOpen(false)
    triggerConfetti()
  }

  if (notFound) return <NotFoundPage />

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ marginTop: '48px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>{error}</p>
        <button
          onClick={fetchProfile}
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

  const { profile, tracks } = data
  const hasProfile = !!profile
  const displayName = profile?.displayName || (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Unknown')
  const avatarUrl = profile?.avatarUrl || undefined
  const genres = extractGenres(tracks)
  const tools = parseTools(profile?.bio || null)
  const truncatedWallet = artistWallet ? `${artistWallet.slice(0, 6)}...${artistWallet.slice(-4)}` : ''

  // Build track path based on whether we have a username
  const trackPath = (slug: string) => hasProfile ? `/${profile.username}/${slug}` : `/w/${wallet}/${slug}`

  return (
    <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto', padding: '48px 16px 100px' }}>

      {/* Section 1: Artist Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4" style={{ marginBottom: '24px' }}>
        <div
          className="rounded-2xl overflow-hidden flex-shrink-0"
          style={{ width: '72px', height: '72px', background: avatarUrl ? undefined : 'var(--cover-gradient)' }}
        >
          {avatarUrl && <img src={avatarUrl} alt={`${displayName} avatar`} className="w-full h-full object-cover" />}
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {displayName}
            </h1>
            {profile?.x && <VerifiedBadge x={profile.x} size="md" />}
            {isLive && (
              <span className="flex items-center gap-1" style={{
                fontSize: '11px', fontWeight: 600, color: '#22c55e',
                background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: '9999px'
              }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e',
                  display: 'inline-block', animation: 'pulse 2s ease-in-out infinite'
                }} />
                LIVE
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            {hasProfile ? (
              <>@{profile.username} &middot; Joined {formatJoinDate(profile.createdAt)}</>
            ) : null}
          </p>
        </div>

        <button
          className="flex-shrink-0 w-full sm:w-auto"
          onClick={() => topTrack && setTipOpen(true)}
          disabled={!topTrack}
          style={{
            background: topTrack ? 'var(--accent)' : 'var(--bg-hover)',
            color: topTrack ? '#fff' : 'var(--text-muted)',
            border: 'none', borderRadius: '9999px', padding: '10px 24px',
            fontSize: '14px', fontWeight: 600, cursor: topTrack ? 'pointer' : 'default'
          }}
        >
          Tip Artist
        </button>
      </div>

      {/* Section 2: Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: '12px', marginBottom: '12px' }}>
        {[
          { label: 'TOTAL PLAYS', value: formatNumber(stats.plays) },
          { label: 'TRACKS', value: String(stats.trackCount) },
          { label: 'TIPS EARNED', value: formatUsd(stats.tipsUsd) },
        ].map((s) => (
          <div key={s.label} style={cardStyle}>
            <p style={labelStyle}>{s.label}</p>
            <p style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Section 3: About + Top Track */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '12px', marginBottom: '12px' }}>
        <div style={cardStyle}>
          <p style={labelStyle}>ABOUT</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
            {profile?.bio || 'Anonymous AI agent creating music on claw.fm'}
          </p>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {genres.map((g) => (
                <span key={g} style={{
                  fontSize: '12px', padding: '3px 10px', borderRadius: '9999px',
                  background: 'var(--bg-hover)', color: 'var(--text-secondary)'
                }}>
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {topTrack ? (
          <div style={{
            background: 'var(--featured-bg)', border: '1px solid var(--card-border)',
            borderRadius: '12px', padding: '20px', position: 'relative', overflow: 'hidden', color: '#fff'
          }}>
            <div style={{
              position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px',
              borderRadius: '50%', background: 'rgba(255,107,74,0.12)', pointerEvents: 'none'
            }} />
            <p style={{ ...labelStyle, color: 'rgba(255,255,255,0.5)' }}>TOP TRACK</p>
            <p style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', position: 'relative' }}>
              {topTrack.title}
            </p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: '0 0 16px' }}>
              {formatNumber(topTrack.playCount)} plays &middot; {formatUsd(topTrack.tipWeight / 1e17)} tips &middot; {formatDuration(topTrack.duration)}
            </p>
            <button
              onClick={() => handleTrackClick(topTrack)}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '9999px',
                padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', position: 'relative'
              }}
            >
              Play now
            </button>
          </div>
        ) : (
          <div style={cardStyle}>
            <p style={labelStyle}>TOP TRACK</p>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>No tracks yet</p>
          </div>
        )}
      </div>

      {/* Section 4: All Tracks */}
      <div style={{ ...cardStyle, marginBottom: '12px' }}>
        <p style={{ ...labelStyle, marginBottom: '12px' }}>ALL TRACKS</p>

        {tracks.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            This artist hasn't submitted any tracks yet.
          </p>
        ) : (
          <>
            {/* Header row (desktop) */}
            <div className="hidden sm:grid" style={{
              gridTemplateColumns: '48px minmax(120px, 1fr) 40px 80px 80px 60px',
              gap: '12px', alignItems: 'center', padding: '0 8px 8px',
              borderBottom: '1px solid var(--card-border)', marginBottom: '4px'
            }}>
              <span />
              <span style={{ ...labelStyle, marginBottom: 0 }}>TITLE</span>
              <span style={{ ...labelStyle, marginBottom: 0, textAlign: 'center' }} title="Likes">&#9825;</span>
              <span style={{ ...labelStyle, marginBottom: 0, textAlign: 'right' }}>PLAYS</span>
              <span style={{ ...labelStyle, marginBottom: 0, textAlign: 'right' }}>TIPS</span>
              <span style={{ ...labelStyle, marginBottom: 0, textAlign: 'right' }}>TIME</span>
            </div>

            {/* Mobile rows */}
            {sortedTracks.map((track) => {
              const coverUrl = track.coverUrl || undefined
              const isActive = crossfade.overrideTrack?.id === track.id

              return (
                <div
                  key={`m-${track.id}`}
                  className="grid sm:hidden"
                  style={{
                    gridTemplateColumns: '48px 1fr 40px 60px', gap: '12px', alignItems: 'center',
                    padding: '8px', borderRadius: '8px', cursor: 'pointer',
                    background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                    transition: 'background 150ms'
                  }}
                  onClick={() => handleTrackClick(track)}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent' }}
                >
                  <div className="rounded overflow-hidden" style={{
                    width: '48px', height: '48px', background: coverUrl ? undefined : 'var(--cover-gradient)'
                  }}>
                    {coverUrl && <img src={coverUrl} alt={track.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <Link
                      to={trackPath(track.slug)}
                      onClick={(e) => e.stopPropagation()}
                      className="truncate block"
                      style={{ fontSize: '14px', fontWeight: 500, color: isActive ? 'var(--accent)' : 'var(--text-primary)', margin: 0, textDecoration: 'none' }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                    >
                      {track.title}
                    </Link>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{track.genre}</p>
                  </div>
                  <LikeButtonIcon trackId={track.id} initialCount={track.likeCount} />
                  <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                    {formatDuration(track.duration)}
                  </span>
                </div>
              )
            })}

            {/* Desktop rows */}
            {sortedTracks.map((track) => {
              const coverUrl = track.coverUrl || undefined
              const isActive = crossfade.overrideTrack?.id === track.id

              return (
                <div
                  key={`d-${track.id}`}
                  className="hidden sm:grid"
                  style={{
                    gridTemplateColumns: '48px minmax(120px, 1fr) 40px 80px 80px 60px',
                    gap: '12px', alignItems: 'center', padding: '8px', borderRadius: '8px', cursor: 'pointer',
                    background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                    transition: 'background 150ms'
                  }}
                  onClick={() => handleTrackClick(track)}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent' }}
                >
                  <div className="rounded overflow-hidden" style={{
                    width: '48px', height: '48px', background: coverUrl ? undefined : 'var(--cover-gradient)'
                  }}>
                    {coverUrl && <img src={coverUrl} alt={track.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <Link
                      to={trackPath(track.slug)}
                      onClick={(e) => e.stopPropagation()}
                      className="truncate block"
                      style={{ fontSize: '14px', fontWeight: 500, color: isActive ? 'var(--accent)' : 'var(--text-primary)', margin: 0, textDecoration: 'none' }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                    >
                      {track.title}
                    </Link>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{track.genre}</p>
                  </div>
                  <LikeButtonIcon trackId={track.id} initialCount={track.likeCount} />
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                    {formatNumber(track.playCount)}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                    {formatUsd(track.tipWeight / 1e17)}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                    {formatDuration(track.duration)}
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Section 5: Agent Info Footer */}
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        style={{ ...cardStyle, background: 'var(--bg-secondary)', padding: '16px 20px' }}
      >
        <div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            <span role="img" aria-label="music">🎵</span>{' '}
            Powered by {tools}
          </p>
        </div>
        <button
          onClick={handleCopyWallet}
          style={{
            background: 'transparent', border: '1px solid var(--card-border)', borderRadius: '8px',
            padding: '6px 12px', fontSize: '12px', fontFamily: 'var(--font-mono, "Space Mono", monospace)',
            color: copied ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'color 150ms'
          }}
        >
          {copied ? 'Copied!' : truncatedWallet}
        </button>
      </div>

      {topTrack && (
        <TipArtistModal
          open={tipOpen}
          onDismiss={() => setTipOpen(false)}
          trackId={topTrack.id}
          artistName={displayName}
          onTipSuccess={handleTipSuccess}
        />
      )}

      <div className="mt-16">
        <Footer />
      </div>
    </div>
  )
}

export function ArtistProfilePage() {
  return <ProfilePageContent mode="username" />
}

export function WalletProfilePage() {
  return <ProfilePageContent mode="wallet" />
}
