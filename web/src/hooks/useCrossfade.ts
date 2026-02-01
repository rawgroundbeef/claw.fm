import { useState, useRef, useEffect, useCallback } from 'react'
import { useAudioPlayer } from './useAudioPlayer'
import { useNowPlaying } from './useNowPlaying'
import { useServerTime } from './useServerTime'
import { getCorrectPlaybackPosition } from '../utils/timeSync'
import { getAudioContext } from '../utils/audioContext'
import type { NowPlayingTrack } from '@claw/shared'

interface UseCrossfadeReturn {
  play: () => Promise<void>
  pause: () => void
  setVolume: (volume: number) => void
  isPlaying: boolean
  isLoading: boolean
  currentTrack: NowPlayingTrack | null
  activeAnalyser: AnalyserNode | null  // For visualizer to consume
  currentTime: number        // Current playback position in seconds
  duration: number           // Current track duration in seconds
}

const CROSSFADE_DURATION_SEC = 2  // 2 second crossfade (short & subtle)

/**
 * Orchestrates dual audio players for seamless track crossfades.
 *
 * Manages two useAudioPlayer instances (A and B) and crossfades between them
 * when tracks rotate. Preloads next track when < 10s remaining.
 *
 * Uses linear ramp for 2-second crossfade (acceptable for short durations).
 * Equal-power curves would add complexity with minimal audible benefit at 2s.
 */
export function useCrossfade(): UseCrossfadeReturn {
  // Server state and time sync
  const nowPlaying = useNowPlaying()
  const { offset: serverOffset } = useServerTime()

  // Dual audio players for crossfade
  const playerA = useAudioPlayer()
  const playerB = useAudioPlayer()

  // Track which player is currently active
  const activePlayerRef = useRef<'A' | 'B'>('A')
  const [isPlaying, setIsPlaying] = useState(false)
  const [userVolume, setUserVolume] = useState(1.0)

  // Track the current track for UI
  const [currentTrack, setCurrentTrack] = useState<NowPlayingTrack | null>(null)

  // Get active and inactive players
  const getActivePlayers = useCallback(() => {
    const isAActive = activePlayerRef.current === 'A'
    return {
      active: isAActive ? playerA : playerB,
      inactive: isAActive ? playerB : playerA,
    }
  }, [playerA, playerB])

  // Preload next track when it appears (< 10s remaining)
  useEffect(() => {
    if (!nowPlaying.nextTrack) return

    const { inactive } = getActivePlayers()

    // Check if already loaded
    if (inactive.audioElement?.src === nowPlaying.nextTrack.fileUrl) {
      return
    }

    console.log('Preloading next track:', nowPlaying.nextTrack.title)
    inactive.setSource(nowPlaying.nextTrack.fileUrl)
  }, [nowPlaying.nextTrack, getActivePlayers])

  // Handle track transitions
  useEffect(() => {
    if (!nowPlaying.track || nowPlaying.state !== 'playing') return

    // Check if this is a new track (ID changed)
    if (currentTrack && currentTrack.id === nowPlaying.track.id) {
      return // Same track, no transition needed
    }

    // Track changed - trigger crossfade
    const newTrack = nowPlaying.track
    console.log('Track transition:', currentTrack?.title, '->', newTrack.title)

    const { active, inactive } = getActivePlayers()

    // If not playing yet, just load the first track
    if (!currentTrack) {
      console.log('Initial track load:', newTrack.title)
      active.setSource(newTrack.fileUrl)
      setCurrentTrack(newTrack)

      // Seek to correct position if we're joining mid-track
      if (nowPlaying.startedAt && inactive.audioElement) {
        const position = getCorrectPlaybackPosition(
          nowPlaying.startedAt,
          newTrack.duration * 1000,
          serverOffset
        )
        inactive.audioElement.currentTime = position
      }

      return
    }

    // Execute crossfade transition
    const executeCrossfade = async () => {
      try {
        const ctx = getAudioContext()
        const now = ctx.currentTime

        // Get gain nodes
        const activeGain = active.gainNode
        const inactiveGain = inactive.gainNode

        if (!activeGain || !inactiveGain) {
          console.error('Gain nodes not available for crossfade')
          return
        }

        // Cancel any previous automation
        activeGain.gain.cancelScheduledValues(now)
        inactiveGain.gain.cancelScheduledValues(now)

        // Get current gain values
        const currentActiveGain = activeGain.gain.value
        const currentInactiveGain = inactiveGain.gain.value

        // Schedule fade out for active player (linear ramp)
        activeGain.gain.setValueAtTime(currentActiveGain, now)
        activeGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_DURATION_SEC)

        // Schedule fade in for inactive player (linear ramp)
        inactiveGain.gain.setValueAtTime(currentInactiveGain, now)
        inactiveGain.gain.linearRampToValueAtTime(userVolume, now + CROSSFADE_DURATION_SEC)

        // Seek inactive player to correct position
        if (nowPlaying.startedAt && inactive.audioElement) {
          const position = getCorrectPlaybackPosition(
            nowPlaying.startedAt,
            newTrack.duration * 1000,
            serverOffset
          )
          inactive.audioElement.currentTime = position
        }

        // Start inactive player
        await inactive.play()

        // Swap active player reference
        activePlayerRef.current = activePlayerRef.current === 'A' ? 'B' : 'A'
        setCurrentTrack(newTrack)

        // After crossfade completes, pause and reset the now-inactive player
        setTimeout(() => {
          active.pause()
          if (active.audioElement) {
            active.audioElement.currentTime = 0
          }
        }, CROSSFADE_DURATION_SEC * 1000 + 100) // Add 100ms buffer

        console.log('Crossfade complete, now playing:', newTrack.title)
      } catch (error) {
        console.error('Crossfade execution failed:', error)
      }
    }

    executeCrossfade()
  }, [nowPlaying.track, nowPlaying.startedAt, currentTrack, getActivePlayers, serverOffset, userVolume, playerA, playerB])

  // Play function - starts playback
  const play = useCallback(async () => {
    if (!nowPlaying.track || !nowPlaying.startedAt) {
      console.warn('Cannot play: no track available')
      return
    }

    const { active } = getActivePlayers()

    // Load track if not loaded
    if (!active.audioElement?.src || active.audioElement.src !== nowPlaying.track.fileUrl) {
      active.setSource(nowPlaying.track.fileUrl)
      setCurrentTrack(nowPlaying.track)

      // Wait for load
      await new Promise<void>((resolve) => {
        const checkLoaded = setInterval(() => {
          if (active.isLoaded) {
            clearInterval(checkLoaded)
            resolve()
          }
        }, 100)
      })
    }

    // Seek to correct position
    if (active.audioElement) {
      const position = getCorrectPlaybackPosition(
        nowPlaying.startedAt,
        nowPlaying.track.duration * 1000,
        serverOffset
      )
      active.audioElement.currentTime = position
    }

    // Start playback
    await active.play()
    setIsPlaying(true)
  }, [nowPlaying.track, nowPlaying.startedAt, getActivePlayers, serverOffset])

  // Pause function
  const pause = useCallback(() => {
    const { active } = getActivePlayers()
    active.pause()
    setIsPlaying(false)
  }, [getActivePlayers])

  // Volume control
  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume))
    setUserVolume(clamped)

    // Apply to active player
    const { active } = getActivePlayers()
    active.setVolume(clamped)
  }, [getActivePlayers])

  // Get active player state for UI
  const { active } = getActivePlayers()

  return {
    play,
    pause,
    setVolume,
    isPlaying,
    isLoading: active.isLoading,
    currentTrack,
    activeAnalyser: active.analyserNode,
    currentTime: active.currentTime,
    duration: currentTrack?.duration || 0,
  }
}
