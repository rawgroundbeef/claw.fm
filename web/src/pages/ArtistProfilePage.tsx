import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { ArtistProfileWithTracks, NowPlayingTrack, Track } from '@claw/shared'
import { API_URL } from '../lib/constants'
import { NotFoundPage } from './NotFoundPage'
import { useAudio } from '../contexts/AudioContext'

// Helper to format milliseconds as M:SS
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}


export function ArtistProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { crossfade } = useAudio()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ArtistProfileWithTracks | null>(null)
  const [notFound, setNotFound] = useState(false)

  const fetchProfile = async () => {
    if (!username) return

    setLoading(true)
    setError(null)
    setNotFound(false)

    try {
      const response = await fetch(`${API_URL}/api/artist/${username}`)

      if (response.status === 404) {
        setNotFound(true)
        setLoading(false)
        return
      }

      if (!response.ok) {
        throw new Error('Failed to load artist profile')
      }

      const profileData: ArtistProfileWithTracks = await response.json()
      setData(profileData)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artist profile')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [username])

  // 404 handling
  if (notFound) {
    return <NotFoundPage />
  }

  // Loading state
  if (loading) {
    return (
      <div className="w-full max-w-2xl self-start" style={{ marginTop: '48px' }}>
        {/* Hero skeleton */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-8">
          {/* Avatar skeleton */}
          <div
            className="rounded-xl animate-pulse"
            style={{
              width: '128px',
              height: '128px',
              background: 'var(--bg-hover)',
            }}
          />
          {/* Info skeleton */}
          <div className="flex-1 flex flex-col gap-3 w-full">
            {/* Display name */}
            <div
              className="rounded animate-pulse"
              style={{
                height: '32px',
                width: '60%',
                background: 'var(--bg-hover)',
              }}
            />
            {/* Username */}
            <div
              className="rounded animate-pulse"
              style={{
                height: '20px',
                width: '40%',
                background: 'var(--bg-hover)',
              }}
            />
            {/* Bio */}
            <div
              className="rounded animate-pulse"
              style={{
                height: '40px',
                width: '80%',
                background: 'var(--bg-hover)',
              }}
            />
          </div>
        </div>

        {/* Track list skeleton */}
        <div className="mt-8">
          <div
            className="rounded animate-pulse mb-4"
            style={{
              height: '24px',
              width: '120px',
              background: 'var(--bg-hover)',
            }}
          />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 mb-3">
              <div
                className="rounded-sm animate-pulse"
                style={{
                  width: '48px',
                  height: '48px',
                  background: 'var(--bg-hover)',
                }}
              />
              <div className="flex-1 flex flex-col gap-2">
                <div
                  className="rounded animate-pulse"
                  style={{
                    height: '16px',
                    width: '70%',
                    background: 'var(--bg-hover)',
                  }}
                />
                <div
                  className="rounded animate-pulse"
                  style={{
                    height: '14px',
                    width: '30%',
                    background: 'var(--bg-hover)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ marginTop: '48px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          {error}
        </p>
        <button
          onClick={fetchProfile}
          className="px-4 py-2 rounded transition-colors"
          style={{
            background: 'var(--bg-hover)',
            color: 'var(--text-primary)',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)'
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  // Data state
  if (!data) return null

  const { profile, tracks } = data
  const avatarUrl = profile.avatarUrl || undefined

  const toNowPlaying = (track: Track): NowPlayingTrack => ({
    id: track.id,
    title: track.title,
    artistWallet: track.wallet,
    artistName: track.artistName,
    duration: track.duration,
    coverUrl: track.coverUrl,
    fileUrl: track.fileUrl,
    genre: track.genre,
    artistUsername: profile.username,
    artistDisplayName: profile.displayName,
    artistAvatarUrl: profile.avatarUrl || undefined,
    artistBio: profile.bio || undefined,
  })

  const handleTrackClick = (track: Track) => {
    crossfade.playOverride(toNowPlaying(track))
  }

  return (
    <div className="w-full max-w-2xl self-start" style={{ marginTop: '48px' }}>
      {/* Hero header */}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-8">
        {/* Avatar */}
        <div
          className="rounded-xl overflow-hidden flex-shrink-0"
          style={{
            width: '128px',
            height: '128px',
            background: avatarUrl ? undefined : 'var(--cover-gradient)',
          }}
        >
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt={`${profile.displayName} avatar`}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Profile info */}
        <div className="flex-1 flex flex-col gap-2 text-center md:text-left">
          <h1
            className="text-2xl md:text-4xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {profile.displayName}
          </h1>
          <p
            className="text-base md:text-lg"
            style={{ color: 'var(--text-secondary)' }}
          >
            @{profile.username}
          </p>
          {profile.bio && (
            <p
              className="text-sm md:text-base mt-2"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {/* Track catalog */}
      <div className="mt-8">
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          Tracks ({tracks.length})
        </h2>

        {tracks.length === 0 ? (
          <p
            className="text-center md:text-left"
            style={{ color: 'var(--text-secondary)', fontSize: '15px' }}
          >
            This artist hasn't submitted any tracks yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {tracks.map((track) => {
              const coverUrl = track.coverUrl || undefined
              const isActive = crossfade.overrideTrack?.id === track.id

              return (
                <div
                  key={track.id}
                  className="flex items-center gap-3 p-2 rounded transition-colors"
                  style={{
                    background: isActive ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleTrackClick(track)}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isActive
                      ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                      : 'transparent'
                  }}
                >
                  {/* Cover art */}
                  <div
                    className="rounded-sm overflow-hidden flex-shrink-0"
                    style={{
                      width: '48px',
                      height: '48px',
                      background: coverUrl ? undefined : 'var(--cover-gradient)',
                    }}
                  >
                    {coverUrl && (
                      <img
                        src={coverUrl}
                        alt={`${track.title} cover`}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-medium truncate"
                      style={{ color: 'var(--text-primary)', fontSize: '15px' }}
                    >
                      {track.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: 'var(--bg-hover)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {track.genre}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {formatDuration(track.duration)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
