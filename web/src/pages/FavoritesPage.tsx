import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { API_URL } from '../lib/constants'
import { useAudio } from '../contexts/AudioContext'
import { useWallet } from '../contexts/WalletContext'
import { LikeButtonIcon } from '../components/LikeButton'
import { Footer } from '../components/Footer'

interface LikedTrack {
  id: number
  title: string
  slug: string
  artist_wallet: string
  cover_url: string | null
  file_url: string
  genre: string
  duration_seconds: number
  play_count: number
  like_count: number
  waveform_peaks: string | null
  liked_at: string
  artist_username: string | null
  artist_display_name: string | null
  artist_avatar_url: string | null
}

interface FavoritesResponse {
  wallet: string
  tracks: LikedTrack[]
  total: number
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '12px',
  padding: '20px',
}

export function FavoritesPage() {
  const { crossfade: { playOverride } } = useAudio()
  const { address } = useWallet()
  const [loading, setLoading] = useState(true)
  const [tracks, setTracks] = useState<LikedTrack[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) {
      setLoading(false)
      return
    }

    const fetchFavorites = async () => {
      try {
        const response = await fetch(`${API_URL}/api/likes/wallet/${address}`)
        if (!response.ok) {
          throw new Error('Failed to fetch favorites')
        }
        const data: FavoritesResponse = await response.json()
        setTracks(data.tracks)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchFavorites()
  }, [address])

  const handlePlay = (track: LikedTrack) => {
    playOverride({
      id: track.id,
      title: track.title,
      slug: track.slug,
      artistWallet: track.artist_wallet,
      artistUsername: track.artist_username ?? undefined,
      artistDisplayName: track.artist_display_name ?? undefined,
      artistAvatarUrl: track.artist_avatar_url ?? undefined,
      coverUrl: track.cover_url ?? undefined,
      fileUrl: track.file_url,
      genre: track.genre,
      duration: track.duration_seconds * 1000,
      waveformPeaks: track.waveform_peaks ? JSON.parse(track.waveform_peaks) : undefined,
    })
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading your favorites...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--error)' }}>Error: {error}</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 28px)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--accent)">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          Your Favorites
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'} you've liked
        </p>
      </div>

      {tracks.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
            No favorites yet. Like some tracks to see them here!
          </p>
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <Link to="/" style={{ color: 'var(--accent)' }}>
              ← Back to Radio
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tracks.map((track) => {
            const artistLink = track.artist_username
              ? `/${track.artist_username}`
              : `/w/${track.artist_wallet}`
            const trackLink = track.artist_username
              ? `/${track.artist_username}/${track.slug}`
              : `/w/${track.artist_wallet}/${track.slug}`

            return (
              <div
                key={track.id}
                style={{
                  ...cardStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  padding: '12px',
                }}
                onClick={() => handlePlay(track)}
              >
                {/* Cover art */}
                <div style={{ width: '50px', height: '50px', flexShrink: 0 }}>
                  {track.cover_url ? (
                    <img
                      src={track.cover_url}
                      alt={track.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '8px',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'var(--card-border)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      🎵
                    </div>
                  )}
                </div>

                {/* Track info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    to={trackLink}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      textDecoration: 'none',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {track.title}
                  </Link>
                  <Link
                    to={artistLink}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: '14px',
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                    }}
                  >
                    {track.artist_display_name || track.artist_username || `${track.artist_wallet.slice(0, 6)}...${track.artist_wallet.slice(-4)}`}
                  </Link>
                </div>

                {/* Duration - hidden on mobile */}
                <div 
                  className="hidden sm:block"
                  style={{ color: 'var(--text-secondary)', fontSize: '14px', flexShrink: 0 }}
                >
                  {formatDuration(track.duration_seconds)}
                </div>

                {/* Like button */}
                <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                  <LikeButtonIcon trackId={track.id} initialLiked={true} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Footer />
    </div>
  )
}
