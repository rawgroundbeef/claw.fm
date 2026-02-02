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
import { Waveform } from './components/Visualizer/Waveform'
import { EmptyState } from './components/EmptyState'
import { ReconnectingIndicator } from './components/ReconnectingIndicator'
import { WalletDisplay } from './components/WalletDisplay'
import { TipButtons } from './components/TipButtons'
import { BuyButton } from './components/BuyButton'
import { ConfettiCelebration } from './components/ConfettiCelebration'

export default function App() {
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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Confetti celebration overlay */}
      <ConfettiCelebration fire={showConfetti} />

      {/* Reconnecting indicator */}
      <ReconnectingIndicator
        isReconnecting={recovery.isReconnecting}
        isOffline={recovery.isOffline}
      />

      {/* Main content area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-20">
        {/* Header */}
        <div className="w-full max-w-2xl flex items-center justify-between mb-8">
          <h1 className="text-sm font-medium text-gray-400 tracking-widest uppercase">
            claw.fm
          </h1>
          <WalletDisplay />
        </div>

        {/* Main visualizer and track info area */}
        {isWaiting ? (
          <EmptyState />
        ) : (
          <div className="w-full max-w-2xl flex flex-col items-center space-y-6">
            {/* Waveform visualizer */}
            <div className="w-full h-48 sm:h-64">
              <Waveform
                analyserNode={crossfade.activeAnalyser}
                isPlaying={crossfade.isPlaying}
                className="w-full h-full"
              />
            </div>

            {/* Track info with crossfade transition */}
            <div
              key={crossfade.currentTrack?.id}
              className="text-center track-info-enter track-info-active"
            >
              <h2 className="text-2xl font-bold text-black">
                {crossfade.currentTrack?.title || 'Loading...'}
              </h2>
              <p className="text-lg text-gray-500 mt-1">
                {crossfade.currentTrack?.artistName || ''}
              </p>
            </div>

            {/* Payment area - only show when playing */}
            {crossfade.isPlaying && crossfade.currentTrack && nowPlaying.track && (
              <div className="flex items-center gap-3 mt-4">
                <TipButtons
                  artistWallet={nowPlaying.track.artistWallet}
                  trackId={nowPlaying.track.id}
                  onTipSuccess={() => {
                    setShowConfetti(true)
                    setTimeout(() => setShowConfetti(false), 3000)
                  }}
                />
                <div className="w-px h-8 bg-gray-200" />
                <BuyButton
                  artistWallet={nowPlaying.track.artistWallet}
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
                className="mt-4 w-20 h-20 rounded-full bg-electric hover:bg-electric-dark disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-lg"
              >
                {crossfade.isBuffering ? (
                  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg
                    className="w-10 h-10 text-white ml-1"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            )}
          </div>
        )}
      </main>

      {/* Fixed bottom player bar */}
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
    </div>
  )
}
