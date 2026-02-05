import { Link, Outlet } from 'react-router'
import { useAudio } from '../contexts/AudioContext'
import { PlayerBar } from '../components/Player/PlayerBar'
import { PlayButton } from '../components/Player/PlayButton'
import { VolumeControl } from '../components/Player/VolumeControl'
import { NowPlaying } from '../components/Player/NowPlaying'
import { ProgressBar } from '../components/Player/ProgressBar'
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
            className="font-semibold tracking-wider uppercase"
            style={{ fontSize: '16px', letterSpacing: '0.1em', color: 'var(--accent)' }}
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
            What is this?
          </button>
          <WalletButton />
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
          <div className="flex items-center space-x-4">
            <PlayButton
              isPlaying={crossfade.isPlaying}
              isLoading={crossfade.isLoading || crossfade.isBuffering}
              disabled={isWaiting}
              onPlay={crossfade.play}
              onPause={crossfade.pause}
            />
            <ProgressBar
              currentTime={crossfade.currentTime}
              duration={crossfade.duration}
              analyser={crossfade.activeAnalyser}
              isPlaying={crossfade.isPlaying}
              fileUrl={crossfade.currentTrack?.fileUrl}
              waveformPeaks={crossfade.currentTrack?.waveformPeaks}
              onSeek={crossfade.seek}
            />
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
