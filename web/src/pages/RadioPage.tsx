import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useAudio } from '../contexts/AudioContext'
import { EmptyState } from '../components/EmptyState'
import { TipButtons } from '../components/TipButtons'
import { BuyButton } from '../components/BuyButton'
import { Identicon } from '../components/Identicon'
import { LikeButtonPill } from '../components/LikeButton'

export function RadioPage() {
  const { nowPlaying, crossfade, triggerConfetti } = useAudio()
  const [coverError, setCoverError] = useState(false)
  
  // Reset cover error when track changes
  useEffect(() => {
    setCoverError(false)
  }, [crossfade.currentTrack?.id])

  // Determine state machine
  const isWaiting = nowPlaying.state === 'waiting'
  const isPrePlay = nowPlaying.state === 'playing' && !crossfade.isPlaying

  // Display artist name (priority: displayName > artistName > truncated wallet)
  const displayArtist = crossfade.currentTrack
    ? crossfade.currentTrack.artistDisplayName ||
      crossfade.currentTrack.artistName ||
      `${crossfade.currentTrack.artistWallet.slice(0, 6)}...${crossfade.currentTrack.artistWallet.slice(-4)}`
    : ''

  // Determine artist link target
  const artistPath = crossfade.currentTrack
    ? (crossfade.currentTrack.artistUsername
        ? `/artist/${crossfade.currentTrack.artistUsername}`
        : `/artist/by-wallet/${crossfade.currentTrack.artistWallet}`)
    : '/'

  return (
    <div className="flex flex-col items-center justify-center flex-1">
      {isWaiting ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col items-center" style={{ gap: '32px' }}>
          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded-full"
              style={{
                width: '8px',
                height: '8px',
                background: 'var(--accent)',
                boxShadow: '0 0 8px var(--accent-glow)',
                animation: 'pulse 2s ease-in-out infinite',
              }}
            />
            <span
              className="uppercase font-medium"
              style={{
                fontSize: '11px',
                letterSpacing: '0.15em',
                color: 'var(--text-tertiary)',
              }}
            >
              LIVE
            </span>
          </div>

          {/* Cover art */}
          <div
            className="relative rounded-lg overflow-hidden flex items-end justify-center"
            style={{
              width: 'min(320px, 80vw)',
              height: 'min(320px, 80vw)',
              boxShadow: 'var(--cover-shadow)',
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
                size={320} 
                className="absolute inset-0 w-full h-full"
              />
            ) : null}
            {/* Animated waveform bars */}
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
          <div
            key={crossfade.currentTrack?.id}
            className="text-center track-info-enter track-info-active"
          >
            <h2
              className="font-semibold text-lg md:text-2xl"
              style={{ color: 'var(--text-primary)' }}
            >
              {crossfade.currentTrack?.title || 'Loading...'}
            </h2>
            <Link
              to={artistPath}
              className="mt-1 transition-colors"
              style={{ fontSize: '15px', color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-block' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              {displayArtist}
            </Link>
          </div>

          {/* Action buttons - only show when playing */}
          {crossfade.isPlaying && crossfade.currentTrack && nowPlaying.track && (
            <div className="flex items-center flex-wrap justify-center" style={{ gap: '8px' }}>
              <TipButtons
                trackId={nowPlaying.track.id}
                onTipSuccess={triggerConfetti}
              />
              <BuyButton
                trackId={nowPlaying.track.id}
                trackTitle={nowPlaying.track.title}
              />
              <LikeButtonPill trackId={nowPlaying.track.id} />
            </div>
          )}

          {/* Large play button for pre-play landing */}
          {isPrePlay && (
            <button
              onClick={crossfade.play}
              disabled={crossfade.isLoading || crossfade.isBuffering}
              className="flex items-center justify-center transition-all"
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 8px 32px var(--accent-glow)',
                opacity: crossfade.isLoading || crossfade.isBuffering ? 0.5 : 1,
                cursor: crossfade.isLoading || crossfade.isBuffering ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!crossfade.isLoading && !crossfade.isBuffering) {
                  e.currentTarget.style.background = 'var(--accent-hover)'
                  e.currentTarget.style.transform = 'scale(1.05)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent)'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              {crossfade.isBuffering ? (
                <div
                  className="border-4 border-white rounded-full animate-spin"
                  style={{ width: '32px', height: '32px', borderTopColor: 'transparent' }}
                />
              ) : (
                <svg
                  className="ml-1"
                  width="40"
                  height="40"
                  fill="white"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}

          {/* Up next */}
          {nowPlaying.nextTrack && (
            <div style={{ fontSize: '13px' }}>
              <span style={{ color: 'var(--text-faint)' }}>Up next: </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {nowPlaying.nextTrack.title}
                {nowPlaying.nextTrack.artistName && ` — ${nowPlaying.nextTrack.artistName}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
