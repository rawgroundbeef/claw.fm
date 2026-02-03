import { useState } from 'react'
import { useNowPlaying } from './hooks/useNowPlaying'
import { useCrossfade } from './hooks/useCrossfade'
import { useRecovery } from './hooks/useRecovery'
import { useServerTime } from './hooks/useServerTime'
import { getCorrectPlaybackPosition } from './utils/timeSync'
import { PlayerBar } from './components/Player/PlayerBar'
import { PlayButton } from './components/Player/PlayButton'
import { VolumeControl } from './components/Player/VolumeControl'
import { NowPlaying } from './components/Player/NowPlaying'
import { ProgressBar } from './components/Player/ProgressBar'
import { EmptyState } from './components/EmptyState'
import { ReconnectingIndicator } from './components/ReconnectingIndicator'
import { WalletButton } from './components/WalletButton'
import { TipButtons } from './components/TipButtons'
import { BuyButton } from './components/BuyButton'
import { ConfettiCelebration } from './components/ConfettiCelebration'
import { WelcomeModal } from './components/WelcomeModal'
import { Toaster } from 'sonner'
import { useTheme } from './hooks/useTheme'

export default function App() {
  // Theme
  const { theme, toggle: toggleTheme } = useTheme()

  // Now playing state from API
  const nowPlaying = useNowPlaying()

  // Server time sync
  const { offset: serverOffset } = useServerTime()

  // Audio engine with crossfade
  const crossfade = useCrossfade()

  // Volume state
  const [volume, setVolume] = useState<number>(0.8)
  const [muted, setMuted] = useState<boolean>(false)

  // Confetti state
  const [showConfetti, setShowConfetti] = useState(false)

  // Welcome/info modal state
  const isFirstVisit = !localStorage.getItem('claw_welcomed')
  const [modalOpen, setModalOpen] = useState(isFirstVisit)
  const [modalPersistent, setModalPersistent] = useState(isFirstVisit)
  const dismissModal = () => { localStorage.setItem('claw_welcomed', '1'); setModalOpen(false) }
  const openInfo = () => { setModalPersistent(false); setModalOpen(true) }

  // Recovery and resilience
  const recovery = useRecovery({
    isPlaying: crossfade.isPlaying,
    onReconnect: () => {
      // Re-fetch now-playing state
      nowPlaying.refetch()

      // Re-sync audio position if we have a track
      if (nowPlaying.track && nowPlaying.startedAt) {
        const position = getCorrectPlaybackPosition(
          nowPlaying.startedAt,
          nowPlaying.track.duration * 1000,
          serverOffset
        )

        // Find active audio element from crossfade
        const audioElement = crossfade.isPlaying
          ? document.querySelector('audio') as HTMLAudioElement | null
          : null

        if (audioElement) {
          audioElement.currentTime = position
        }
      }
    },
    onVisibilityRestore: () => {
      // Re-sync audio position when tab is restored
      if (nowPlaying.track && nowPlaying.startedAt) {
        const position = getCorrectPlaybackPosition(
          nowPlaying.startedAt,
          nowPlaying.track.duration * 1000,
          serverOffset
        )

        const audioElement = document.querySelector('audio') as HTMLAudioElement | null
        if (audioElement) {
          audioElement.currentTime = position
        }
      }
    },
  })

  // Volume change handler
  const handleVolumeChange = (v: number) => {
    setVolume(v)
    if (muted) {
      setMuted(false)
    }
    crossfade.setVolume(v)
  }

  // Mute toggle handler
  const handleMuteToggle = () => {
    const newMuted = !muted
    setMuted(newMuted)
    crossfade.setVolume(newMuted ? 0 : volume)
  }

  // Determine state machine
  const isWaiting = nowPlaying.state === 'waiting'
  const isPrePlay = nowPlaying.state === 'playing' && !crossfade.isPlaying

  // Display artist name
  const displayArtist = crossfade.currentTrack
    ? crossfade.currentTrack.artistName ||
      `${crossfade.currentTrack.artistWallet.slice(0, 6)}...${crossfade.currentTrack.artistWallet.slice(-4)}`
    : ''

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
      <header className="flex items-center justify-between" style={{ padding: '20px 32px' }}>
        <div className="flex items-center" style={{ gap: '12px' }}>
          <span
            className="font-semibold tracking-wider uppercase"
            style={{ fontSize: '16px', letterSpacing: '0.1em', color: 'var(--accent)' }}
          >
            🦀 CLAW.FM
          </span>
{/* removed — info button moved next to wallet */}
        </div>
        <div className="flex items-center" style={{ gap: '16px' }}>
          <button
            onClick={openInfo}
            className="transition-colors"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            How does this work?
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

      {/* Main content area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
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
                width: '320px',
                height: '320px',
                background: crossfade.currentTrack?.coverUrl
                  ? undefined
                  : 'var(--cover-gradient)',
                boxShadow: 'var(--cover-shadow)',
              }}
            >
              {crossfade.currentTrack?.coverUrl && (
                <img
                  src={crossfade.currentTrack.coverUrl}
                  alt={`${crossfade.currentTrack.title} cover`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
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
                className="font-semibold"
                style={{ fontSize: '24px', color: 'var(--text-primary)' }}
              >
                {crossfade.currentTrack?.title || 'Loading...'}
              </h2>
              <p
                className="mt-1 cursor-pointer transition-colors"
                style={{ fontSize: '15px', color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {displayArtist}
              </p>
            </div>

            {/* Action buttons - only show when playing */}
            {crossfade.isPlaying && crossfade.currentTrack && nowPlaying.track && (
              <div className="flex items-center" style={{ gap: '12px' }}>
                <TipButtons
                  trackId={nowPlaying.track.id}
                  onTipSuccess={() => {
                    setShowConfetti(true)
                    setTimeout(() => setShowConfetti(false), 3000)
                  }}
                />
                <BuyButton
                  trackId={nowPlaying.track.id}
                  trackTitle={nowPlaying.track.title}
                />
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
      </main>

      {/* Player bar */}
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

      {/* Welcome / info modal */}
      <WelcomeModal open={modalOpen} onDismiss={dismissModal} persistent={modalPersistent} />
    </div>
  )
}
