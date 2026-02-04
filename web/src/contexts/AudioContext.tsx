import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import { useNowPlaying } from '../hooks/useNowPlaying'
import { useCrossfade } from '../hooks/useCrossfade'
import { useRecovery } from '../hooks/useRecovery'
import { useServerTime } from '../hooks/useServerTime'
import { useTheme } from '../hooks/useTheme'
import { getCorrectPlaybackPosition } from '../utils/timeSync'

interface AudioContextValue {
  // From useNowPlaying
  nowPlaying: ReturnType<typeof useNowPlaying>
  // From useCrossfade
  crossfade: ReturnType<typeof useCrossfade>
  // Volume state
  volume: number
  muted: boolean
  handleVolumeChange: (v: number) => void
  handleMuteToggle: () => void
  // Recovery
  recovery: { isReconnecting: boolean; isOffline: boolean }
  // Theme
  theme: 'dark' | 'light'
  toggleTheme: () => void
  // Confetti
  showConfetti: boolean
  triggerConfetti: () => void
  // Modal
  modalOpen: boolean
  openModal: () => void
  dismissModal: () => void
}

const AudioContext = createContext<AudioContextValue | null>(null)

export function AudioProvider({ children }: { children: ReactNode }) {
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

  // "What is this?" modal state
  const isFirstVisit = !localStorage.getItem('claw_seen_intro')
  const [modalOpen, setModalOpen] = useState(isFirstVisit)
  const dismissModal = () => {
    localStorage.setItem('claw_seen_intro', 'true')
    setModalOpen(false)
  }
  const openModal = () => setModalOpen(true)

  // Recovery and resilience
  const recovery = useRecovery({
    isPlaying: crossfade.isPlaying,
    onReconnect: () => {
      // Re-fetch now-playing state
      nowPlaying.refetch()

      // Skip re-sync if override track is playing (it has its own position)
      if (crossfade.overrideTrack) return

      // Re-sync audio position if we have a track
      if (nowPlaying.track && nowPlaying.startedAt) {
        const position = getCorrectPlaybackPosition(
          nowPlaying.startedAt,
          nowPlaying.track.duration,
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
      // Skip re-sync if override track is playing (it has its own position)
      if (crossfade.overrideTrack) return

      // Re-sync audio position when tab is restored
      if (nowPlaying.track && nowPlaying.startedAt) {
        const position = getCorrectPlaybackPosition(
          nowPlaying.startedAt,
          nowPlaying.track.duration,
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

  // Confetti trigger
  const triggerConfetti = () => {
    setShowConfetti(true)
    setTimeout(() => setShowConfetti(false), 3000)
  }

  // Memoize stable functions and changing values separately for optimal re-render behavior
  const value = useMemo<AudioContextValue>(
    () => ({
      nowPlaying,
      crossfade,
      volume,
      muted,
      handleVolumeChange,
      handleMuteToggle,
      recovery,
      theme,
      toggleTheme,
      showConfetti,
      triggerConfetti,
      modalOpen,
      openModal,
      dismissModal,
    }),
    [
      nowPlaying,
      crossfade,
      volume,
      muted,
      recovery,
      theme,
      toggleTheme,
      showConfetti,
      modalOpen,
    ]
  )

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
}

export function useAudio(): AudioContextValue {
  const context = useContext(AudioContext)
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider')
  }
  return context
}
