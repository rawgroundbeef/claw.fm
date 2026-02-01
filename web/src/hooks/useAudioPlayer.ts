import { useState, useRef, useEffect, useCallback } from 'react'
import { getAudioContext, resumeAudioContext } from '../utils/audioContext'

interface UseAudioPlayerReturn {
  play: () => Promise<void>
  pause: () => void
  setSource: (url: string) => void
  setVolume: (volume: number) => void  // 0-1
  isPlaying: boolean
  isLoaded: boolean    // readyState >= 3 (HAVE_FUTURE_DATA)
  isLoading: boolean   // loading but not yet playable
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
export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  // Audio graph refs (created once on mount)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const analyserNodeRef = useRef<AnalyserNode | null>(null)

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
    }

    const handleLoadStart = () => {
      setIsLoaded(false)
      setIsLoading(true)
    }

    const handleError = (e: ErrorEvent | Event) => {
      console.error('Audio element error:', e)
      setIsLoaded(false)
      setIsLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    audio.addEventListener('canplaythrough', handleCanPlayThrough)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('error', handleError)
    audio.addEventListener('timeupdate', handleTimeUpdate)

    // Cleanup on unmount
    return () => {
      audio.removeEventListener('canplaythrough', handleCanPlayThrough)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('timeupdate', handleTimeUpdate)

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

      await audioRef.current.play()
      setIsPlaying(true)
    } catch (error) {
      console.error('Failed to play audio:', error)
      setIsPlaying(false)
    }
  }, [])

  const pause = useCallback(() => {
    if (!audioRef.current) return

    audioRef.current.pause()
    setIsPlaying(false)
  }, [])

  const setVolume = useCallback((volume: number) => {
    if (!gainNodeRef.current) return

    // Direct set is fine for user volume control (not crossfade)
    gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume))
  }, [])

  return {
    play,
    pause,
    setSource,
    setVolume,
    isPlaying,
    isLoaded,
    isLoading,
    currentTime,
    audioElement: audioRef.current,
    gainNode: gainNodeRef.current,
    analyserNode: analyserNodeRef.current,
  }
}
