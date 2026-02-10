import { useState, useRef, useEffect, useCallback } from 'react'
import { getAudioContext, resumeAudioContext } from '../utils/audioContext'

interface UseAudioPlayerOptions {
  onEnded?: () => void
}

interface UseAudioPlayerReturn {
  play: () => Promise<void>
  pause: () => void
  setSource: (url: string) => void
  setVolume: (volume: number) => void  // 0-1
  retry: () => void
  isPlaying: boolean
  isLoaded: boolean    // readyState >= 3 (HAVE_FUTURE_DATA)
  isLoading: boolean   // loading but not yet playable
  isBuffering: boolean // stalled or waiting for data
  hasError: boolean    // audio element error occurred
  currentTime: number  // current playback position in seconds
  audioElement: HTMLAudioElement | null
  gainNode: GainNode | null
  analyserNode: AnalyserNode | null
}

/**
 * Core audio playback hook using Web Audio API.
 *
 * Creates and manages an audio graph:
 * HTMLAudioElement -> MediaElementSource -> GainNode -> AnalyserNode -> destination
 *
 * This hook is designed to be used twice by the crossfade system
 * (one instance for current track, one for next track).
 *
 * IMPORTANT: MediaElementSource can only be created ONCE per audio element.
 * This hook creates it on mount and stores in ref.
 */
export function useAudioPlayer(options?: UseAudioPlayerOptions): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  // Stable ref for onEnded callback (avoids effect re-runs)
  const onEndedRef = useRef(options?.onEnded)
  onEndedRef.current = options?.onEnded

  // Audio graph refs (created once on mount)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const analyserNodeRef = useRef<AnalyserNode | null>(null)
  const stallRecoveryTimeoutRef = useRef<number | null>(null)
  const isIntentionallyPlayingRef = useRef(false)  // Track if user intends playback

  // Create audio element and graph on mount
  useEffect(() => {
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'  // Required for CORS + Web Audio API
    audioRef.current = audio

    // Create Web Audio API graph
    const ctx = getAudioContext()

    // MediaElementSource - CRITICAL: can only create ONCE per audio element
    const sourceNode = ctx.createMediaElementSource(audio)
    sourceNodeRef.current = sourceNode

    // GainNode for volume control and crossfade
    const gainNode = ctx.createGain()
    gainNode.gain.value = 1.0
    gainNodeRef.current = gainNode

    // AnalyserNode for visualizer
    const analyserNode = ctx.createAnalyser()
    analyserNode.fftSize = 2048
    analyserNode.smoothingTimeConstant = 0.8
    analyserNodeRef.current = analyserNode

    // Connect the graph: source -> gain -> analyser -> destination
    sourceNode.connect(gainNode)
    gainNode.connect(analyserNode)
    analyserNode.connect(ctx.destination)

    // Set up event listeners
    const handleCanPlayThrough = () => {
      setIsLoaded(true)
      setIsLoading(false)
      setIsBuffering(false)
    }

    const handleLoadStart = () => {
      setIsLoaded(false)
      setIsLoading(true)
    }

    const handleError = (e: ErrorEvent | Event) => {
      console.error('Audio element error:', e)
      setHasError(true)
      setIsLoaded(false)
      setIsLoading(false)
      setIsBuffering(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handlePlaying = () => {
      // Audio is actually playing - clear all loading states
      setIsLoading(false)
      setIsBuffering(false)
      setIsLoaded(true)
    }

    const handleWaiting = () => {
      setIsBuffering(true)
    }

    const handleEnded = () => {
      onEndedRef.current?.()
    }

    const handleStalled = () => {
      setIsBuffering(true)

      // Only auto-recover if user intends playback
      if (!isIntentionallyPlayingRef.current) return

      // Auto-recover from stalled state after 3s
      if (stallRecoveryTimeoutRef.current !== null) {
        window.clearTimeout(stallRecoveryTimeoutRef.current)
      }

      stallRecoveryTimeoutRef.current = window.setTimeout(() => {
        // Double-check intent before recovery (user may have paused)
        if (!isIntentionallyPlayingRef.current) return

        console.log('Audio stalled - attempting recovery')
        audio.load()
        audio.play().catch((err) => {
          console.error('Stall recovery failed:', err)
        })
      }, 3000)
    }

    audio.addEventListener('canplaythrough', handleCanPlayThrough)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('error', handleError)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('stalled', handleStalled)
    audio.addEventListener('ended', handleEnded)

    // Cleanup on unmount
    return () => {
      audio.removeEventListener('canplaythrough', handleCanPlayThrough)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('stalled', handleStalled)
      audio.removeEventListener('ended', handleEnded)

      if (stallRecoveryTimeoutRef.current !== null) {
        window.clearTimeout(stallRecoveryTimeoutRef.current)
      }

      audio.pause()
      audio.src = ''

      // Disconnect nodes
      sourceNode.disconnect()
      gainNode.disconnect()
      analyserNode.disconnect()
    }
  }, [])

  const setSource = useCallback((url: string) => {
    if (!audioRef.current) return

    setIsLoaded(false)
    setIsLoading(true)
    audioRef.current.src = url
  }, [])

  const play = useCallback(async () => {
    if (!audioRef.current) return

    try {
      // Resume AudioContext first (autoplay policy)
      await resumeAudioContext()

      isIntentionallyPlayingRef.current = true
      await audioRef.current.play()
      setIsPlaying(true)
    } catch (error) {
      console.error('Failed to play audio:', error)
      isIntentionallyPlayingRef.current = false
      setIsPlaying(false)
    }
  }, [])

  const pause = useCallback(() => {
    if (!audioRef.current) return

    isIntentionallyPlayingRef.current = false

    // Cancel any pending stall recovery
    if (stallRecoveryTimeoutRef.current !== null) {
      window.clearTimeout(stallRecoveryTimeoutRef.current)
      stallRecoveryTimeoutRef.current = null
    }

    audioRef.current.pause()
    setIsPlaying(false)
  }, [])

  const setVolume = useCallback((volume: number) => {
    if (!gainNodeRef.current) return

    // Direct set is fine for user volume control (not crossfade)
    gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume))
  }, [])

  const retry = useCallback(() => {
    if (!audioRef.current) return

    setHasError(false)
    setIsBuffering(false)

    audioRef.current.load()
    audioRef.current.play().catch((err) => {
      console.error('Retry failed:', err)
      setHasError(true)
    })
  }, [])

  return {
    play,
    pause,
    setSource,
    setVolume,
    retry,
    isPlaying,
    isLoaded,
    isLoading,
    isBuffering,
    hasError,
    currentTime,
    audioElement: audioRef.current,
    gainNode: gainNodeRef.current,
    analyserNode: analyserNodeRef.current,
  }
}
