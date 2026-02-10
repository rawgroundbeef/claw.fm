import { useState, useRef, useEffect, useCallback } from 'react'
import { useAudioPlayer } from './useAudioPlayer'
import { getCorrectPlaybackPosition } from '../utils/timeSync'
import { getAudioContext, resumeAudioContext } from '../utils/audioContext'
import type { NowPlayingTrack } from '@claw/shared'
import { API_URL } from '../lib/constants'
import type { useNowPlaying } from './useNowPlaying'
import type { useServerTime } from './useServerTime'

interface UseCrossfadeProps {
  nowPlaying: ReturnType<typeof useNowPlaying>
  serverTime: ReturnType<typeof useServerTime>
}

interface UseCrossfadeReturn {
  play: () => Promise<void>
  pause: () => void
  setVolume: (volume: number) => void
  seek: (time: number) => void
  skipToNext: () => Promise<void>  // Skip to next track (breaks from live)
  goBack: () => void              // Go back to previous track
  returnToLive: () => void        // Return to live radio stream
  isPlaying: boolean
  isLoading: boolean
  isBuffering: boolean
  hasInteracted: boolean     // User has clicked play at least once
  isLive: boolean            // True when synced with live radio
  canGoBack: boolean         // True when there's history to go back to
  currentTrack: NowPlayingTrack | null
  activeAnalyser: AnalyserNode | null  // For visualizer to consume
  currentTime: number        // Current playback position in seconds
  duration: number           // Current track duration in seconds
  overrideTrack: NowPlayingTrack | null
  playOverride: (track: NowPlayingTrack) => void
  clearOverride: () => void
  preloadTrack: (track: NowPlayingTrack) => void  // Set track without auto-playing
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
 *
 * NOTE: nowPlaying and serverTime are passed in from AudioContext to avoid
 * duplicate hook instances and excessive polling.
 */
export function useCrossfade({ nowPlaying, serverTime }: UseCrossfadeProps): UseCrossfadeReturn {
  const serverOffset = serverTime.offset

  // Override track state (click-to-play from profile pages)
  const [overrideTrack, setOverrideTrack] = useState<NowPlayingTrack | null>(null)
  const overrideTrackRef = useRef<NowPlayingTrack | null>(null)
  const clearOverrideRef = useRef<() => void>(() => {})
  
  // Personal playback history for back button
  const [playHistory, setPlayHistory] = useState<NowPlayingTrack[]>([])
  const playHistoryRef = useRef<NowPlayingTrack[]>([])

  // Handler called when either player's audio element fires 'ended'
  const handlePlayerEnded = useCallback(() => {
    if (overrideTrackRef.current) {
      // Override track finished — crossfade back to radio
      clearOverrideRef.current()
    }
  }, [])

  // Dual audio players for crossfade
  const playerA = useAudioPlayer({ onEnded: handlePlayerEnded })
  const playerB = useAudioPlayer({ onEnded: handlePlayerEnded })

  // Track which player is currently active
  const activePlayerRef = useRef<'A' | 'B'>('A')
  const [isPlaying, setIsPlaying] = useState(false)
  const [userVolume, setUserVolume] = useState(1.0)
  const [hasInteracted, setHasInteracted] = useState(false)  // User has clicked play at least once

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

    // Check if already loaded (src is absolute, fileUrl is relative)
    if (inactive.audioElement?.src?.endsWith(nowPlaying.nextTrack.fileUrl)) {
      return
    }

    console.log('Preloading next track:', nowPlaying.nextTrack.title)
    inactive.setSource(`${API_URL}${nowPlaying.nextTrack.fileUrl}`)
  }, [nowPlaying.nextTrack, getActivePlayers])

  // Track whether user has explicitly paused (to prevent ghost playback)
  // Initialize to true — don't auto-play until user explicitly starts
  const userPausedRef = useRef(true)

  // Handle track transitions
  useEffect(() => {
    if (!nowPlaying.track || nowPlaying.state !== 'playing') return

    // Skip server-driven transitions while override is active
    if (overrideTrackRef.current) return

    // Respect user's pause state - don't auto-play if user paused
    if (userPausedRef.current && currentTrack) return

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
      active.setSource(`${API_URL}${newTrack.fileUrl}`)
      setCurrentTrack(newTrack)

      // Seek to correct position if we're joining mid-track
      if (nowPlaying.startedAt && active.audioElement) {
        const position = getCorrectPlaybackPosition(
          nowPlaying.startedAt,
          newTrack.duration,
          serverOffset
        )
        active.audioElement.currentTime = position
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
            newTrack.duration,
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

  // Clear override — crossfade back to current radio track
  const clearOverride = useCallback(async () => {
    if (!overrideTrackRef.current) return

    overrideTrackRef.current = null
    setOverrideTrack(null)

    // Crossfade back to the current server radio track
    if (nowPlaying.track && nowPlaying.startedAt && isPlaying) {
      await resumeAudioContext()

      const { active, inactive } = getActivePlayers()
      const ctx = getAudioContext()
      const now = ctx.currentTime

      // Load radio track on inactive player
      inactive.setSource(`${API_URL}${nowPlaying.track.fileUrl}`)

      // Seek to correct server position
      if (inactive.audioElement) {
        const position = getCorrectPlaybackPosition(
          nowPlaying.startedAt,
          nowPlaying.track.duration,
          serverOffset
        )
        inactive.audioElement.currentTime = position
      }

      const activeGain = active.gainNode
      const inactiveGain = inactive.gainNode
      if (activeGain && inactiveGain) {
        activeGain.gain.cancelScheduledValues(now)
        inactiveGain.gain.cancelScheduledValues(now)
        activeGain.gain.setValueAtTime(activeGain.gain.value, now)
        activeGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_DURATION_SEC)
        inactiveGain.gain.setValueAtTime(0, now)
        inactiveGain.gain.linearRampToValueAtTime(userVolume, now + CROSSFADE_DURATION_SEC)
      }

      await inactive.play()
      activePlayerRef.current = activePlayerRef.current === 'A' ? 'B' : 'A'
      setCurrentTrack(nowPlaying.track)

      setTimeout(() => {
        active.pause()
        if (active.audioElement) active.audioElement.currentTime = 0
      }, CROSSFADE_DURATION_SEC * 1000 + 100)
    }
  }, [nowPlaying.track, nowPlaying.startedAt, isPlaying, getActivePlayers, serverOffset, userVolume])

  // Keep ref in sync
  clearOverrideRef.current = clearOverride

  // Play override track — instantly switch to a specific track from position 0
  const playOverride = useCallback(async (track: NowPlayingTrack) => {
    // No-op if same track already playing as override
    if (overrideTrackRef.current && overrideTrackRef.current.id === track.id) return

    userPausedRef.current = false  // User intends to play
    overrideTrackRef.current = track
    setOverrideTrack(track)

    // Record play count for this track
    fetch(`${API_URL}/api/tracks/${track.id}/play`, { method: 'POST' }).catch(() => {})

    await resumeAudioContext()

    const { active, inactive } = getActivePlayers()

    // Stop active player immediately
    const activeGain = active.gainNode
    if (activeGain) {
      activeGain.gain.cancelScheduledValues(0)
      activeGain.gain.value = 0
    }
    active.pause()
    if (active.audioElement) active.audioElement.currentTime = 0

    // Set inactive player gain to full volume before loading
    const inactiveGain = inactive.gainNode
    if (inactiveGain) {
      inactiveGain.gain.cancelScheduledValues(0)
      inactiveGain.gain.value = userVolume
    }

    // Load and play new track from position 0
    inactive.setSource(`${API_URL}${track.fileUrl}`)
    if (inactive.audioElement) {
      inactive.audioElement.currentTime = 0
    }

    await inactive.play()
    activePlayerRef.current = activePlayerRef.current === 'A' ? 'B' : 'A'
    setCurrentTrack(track)
    setIsPlaying(true)
  }, [getActivePlayers, userVolume])

  // Skip to next track - fetches from queue and plays as override
  const skipToNext = useCallback(async () => {
    setHasInteracted(true)
    
    // Save current track to history before skipping
    if (currentTrack) {
      const newHistory = [...playHistoryRef.current, currentTrack].slice(-20) // Keep last 20
      playHistoryRef.current = newHistory
      setPlayHistory(newHistory)
    }
    
    try {
      // Fetch queue from API
      const response = await fetch(`${API_URL}/api/queue`)
      const data = await response.json()
      
      if (data.tracks && data.tracks.length > 0) {
        // Play first track from queue
        await playOverride(data.tracks[0])
      }
    } catch (error) {
      console.error('Failed to fetch queue for skip:', error)
    }
  }, [currentTrack, playOverride])

  // Go back to previous track from history
  const goBack = useCallback(() => {
    if (playHistoryRef.current.length === 0) return
    
    // Pop last track from history
    const newHistory = [...playHistoryRef.current]
    const prevTrack = newHistory.pop()
    
    if (prevTrack) {
      playHistoryRef.current = newHistory
      setPlayHistory(newHistory)
      playOverride(prevTrack)
    }
  }, [playOverride])

  // Return to live radio (alias for clearOverride with history handling)
  const returnToLive = useCallback(() => {
    // Ensure now-playing is active for live radio
    if (!nowPlaying.isActive) {
      nowPlaying.activate()
    }
    // Save current track to history before returning to live
    if (currentTrack) {
      const newHistory = [...playHistoryRef.current, currentTrack].slice(-20)
      playHistoryRef.current = newHistory
      setPlayHistory(newHistory)
    }
    clearOverride()
  }, [currentTrack, clearOverride, nowPlaying])

  // Play function - starts playback
  const play = useCallback(async () => {
    setHasInteracted(true)  // User has clicked play
    userPausedRef.current = false  // User intends to play

    // If there's an override track (e.g., from track page), resume it instead of live radio
    if (overrideTrackRef.current) {
      await resumeAudioContext()
      const { active } = getActivePlayers()

      // Record play count if this is the first play (not a resume)
      if (!isPlaying && overrideTrackRef.current.id) {
        fetch(`${API_URL}/api/tracks/${overrideTrackRef.current.id}/play`, { method: 'POST' }).catch(() => {})
      }

      await active.play()
      setIsPlaying(true)
      return
    }

    // Sync server time for accurate playback position
    await serverTime.syncOnce()

    // Activate now-playing if not already active (lazy activation)
    // activate() returns a promise with the first fetch result
    const { track: liveTrack, startedAt: liveStartedAt } = await nowPlaying.activate()

    if (!liveTrack || !liveStartedAt) {
      console.warn('Cannot play: no track available (server may be waiting for first track)')
      return
    }

    const { active } = getActivePlayers()

    // Load track if not loaded
    const audioEl = active.audioElement
    const needsLoad = !audioEl?.src || !audioEl.src.endsWith(liveTrack.fileUrl)
    if (needsLoad) {
      active.setSource(`${API_URL}${liveTrack.fileUrl}`)
      setCurrentTrack(liveTrack)

      // Wait for load — use audioElement.readyState directly (not stale closure)
      await new Promise<void>((resolve) => {
        if (!audioEl) { resolve(); return }
        const checkLoaded = setInterval(() => {
          if (audioEl.readyState >= 3) {
            clearInterval(checkLoaded)
            resolve()
          }
        }, 100)
      })
    }

    // Seek to correct position
    if (active.audioElement) {
      const position = getCorrectPlaybackPosition(
        liveStartedAt,
        liveTrack.duration,
        serverOffset
      )
      active.audioElement.currentTime = position
    }

    // Start playback
    await active.play()
    setIsPlaying(true)
  }, [nowPlaying, serverTime, serverOffset, getActivePlayers, isPlaying])

  // Pause function
  const pause = useCallback(() => {
    userPausedRef.current = true  // User explicitly paused
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

  // Seek to a specific time
  const seek = useCallback((time: number) => {
    const { active } = getActivePlayers()
    if (active.audioElement) {
      active.audioElement.currentTime = Math.max(0, time)
    }
  }, [getActivePlayers])

  // Get active player state for UI
  const { active } = getActivePlayers()

  // Set override track without auto-playing (for track page pre-loading)
  const preloadTrack = useCallback((track: NowPlayingTrack) => {
    overrideTrackRef.current = track
    setOverrideTrack(track)
    setCurrentTrack(track)
    
    // Preload the track on the ACTIVE player so play() works correctly
    const { active } = getActivePlayers()
    active.setSource(`${API_URL}${track.fileUrl}`)
    
    // Set gain to user volume (will be used when play() is called)
    if (active.gainNode) {
      active.gainNode.gain.value = userVolume
    }
  }, [getActivePlayers, userVolume])

  return {
    play,
    pause,
    setVolume,
    seek,
    skipToNext,
    goBack,
    returnToLive,
    isPlaying,
    isLoading: active.isLoading,
    isBuffering: active.isBuffering,
    hasInteracted,  // True after user clicks play - use to gate loading spinner
    isLive: !overrideTrack,  // True when synced with live radio
    canGoBack: playHistory.length > 0,  // True when there's history
    currentTrack,
    activeAnalyser: active.analyserNode,
    currentTime: active.currentTime,
    duration: (currentTrack?.duration || 0) / 1000,
    overrideTrack,
    playOverride,
    clearOverride,
    preloadTrack,  // Set track without auto-playing (for track pages)
  }
}
