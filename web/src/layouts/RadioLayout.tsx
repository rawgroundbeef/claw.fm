import { Link, Outlet } from 'react-router'
import { useAudio } from '../contexts/AudioContext'
import { PlayerBar } from '../components/Player/PlayerBar'
import { PlayButton } from '../components/Player/PlayButton'
import { VolumeControl } from '../components/Player/VolumeControl'
import { NowPlaying } from '../components/Player/NowPlaying'
import { SimpleProgressBar } from '../components/Player/SimpleProgressBar'
import { ReconnectingIndicator } from '../components/ReconnectingIndicator'
import { WalletButton } from '../components/WalletButton'
import { ConfettiCelebration } from '../components/ConfettiCelebration'
import { WhatIsThisModal } from '../components/WhatIsThisModal'
import { Toaster } from 'sonner'

export function RadioLayout() {
  const {
    theme,
    toggleTheme,
    crossfade,
    nowPlaying,
    volume,
    muted,
    handleVolumeChange,
    handleMuteToggle,
    recovery,
    showConfetti,
    modalOpen,
    openModal,
    dismissModal,
  } = useAudio()

  // Determine if player controls should be disabled
  const isWaiting = nowPlaying.state === 'waiting'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      <Toaster position="bottom-right" richColors theme={theme} />

      {/* Confetti celebration overlay */}
      <ConfettiCelebration fire={showConfetti} />

      {/* Reconnecting indicator */}
      <ReconnectingIndicator
        isReconnecting={recovery.isReconnecting}
        isOffline={recovery.isOffline}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 md:px-8 md:py-5 sticky top-0 z-40" style={{ background: 'var(--bg-primary)' }}>
        <Link to="/" className="flex items-center" style={{ gap: '12px', textDecoration: 'none' }}>
          <span
            className="font-mono font-bold tracking-wider uppercase"
            style={{ fontSize: '16px', letterSpacing: '0.1em', color: 'var(--text-primary)' }}
          >
            🦀 CLAW.FM
          </span>
        </Link>
        <div className="flex items-center" style={{ gap: '16px' }}>
          <button
            onClick={openModal}
            className="transition-colors"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '14px',
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            How it works
          </button>
          <WalletButton />
          <Link
            to="/favorites"
            className="flex items-center justify-center transition-colors"
            style={{
              width: '20px',
              height: '20px',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            title="Your Favorites"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </Link>
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center transition-colors"
            style={{
              width: '20px',
              height: '20px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main content area - routes render here */}
      <main className="flex-1 flex flex-col items-center px-4">
        <Outlet />
      </main>

      {/* Player bar - always mounted */}
      <PlayerBar
        leftContent={
          <NowPlaying
            track={crossfade.currentTrack}
            isTransitioning={crossfade.isLoading}
          />
        }
        centerContent={
          <div className="flex flex-col items-center w-full max-w-md">
            {/* Control buttons row */}
            <div className="flex items-center justify-center gap-4 mb-2">
              {/* Previous button - go back in history or restart track */}
              <button
                onClick={() => crossfade.canGoBack ? crossfade.goBack() : crossfade.seek(0)}
                disabled={isWaiting}
                className="flex items-center justify-center transition-colors"
                style={{
                  width: '32px',
                  height: '32px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: isWaiting ? 'not-allowed' : 'pointer',
                  opacity: isWaiting ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isWaiting) e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
                aria-label={crossfade.canGoBack ? "Previous track" : "Restart track"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
                </svg>
              </button>

              {/* Play/Pause button */}
              <PlayButton
                isPlaying={crossfade.isPlaying}
                isLoading={crossfade.hasInteracted && (crossfade.isLoading || crossfade.isBuffering)}
                disabled={isWaiting}
                onPlay={crossfade.play}
                onPause={crossfade.pause}
              />

              {/* Next button - skip to next track */}
              <button
                onClick={() => crossfade.skipToNext()}
                disabled={isWaiting}
                className="flex items-center justify-center transition-colors"
                style={{
                  width: '32px',
                  height: '32px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: isWaiting ? 'not-allowed' : 'pointer',
                  opacity: isWaiting ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isWaiting) e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
                aria-label="Next track"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zm10.5 0h2V6h-2v12z" />
                </svg>
              </button>
            </div>

            {/* Return to Live button - shows when not live */}
            {!crossfade.isLive && crossfade.hasInteracted && (
              <button
                onClick={() => crossfade.returnToLive()}
                className="text-xs px-2 py-1 rounded-full mb-2 transition-colors"
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--accent)'
                }}
              >
                ↻ Return to Live
              </button>
            )}

            {/* Progress bar below controls */}
            <div className="w-full">
              <SimpleProgressBar
                currentTime={crossfade.currentTime}
                duration={crossfade.duration}
                onSeek={crossfade.seek}
              />
            </div>
          </div>
        }
        rightContent={
          <VolumeControl
            volume={muted ? 0 : volume}
            isMuted={muted}
            onVolumeChange={handleVolumeChange}
            onMuteToggle={handleMuteToggle}
          />
        }
      />

      {/* What is this? modal */}
      <WhatIsThisModal open={modalOpen} onDismiss={dismissModal} />
    </div>
  )
}
