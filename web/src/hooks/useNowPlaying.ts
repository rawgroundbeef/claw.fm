import { useState, useEffect, useCallback, useRef } from 'react'
import type { NowPlayingResponse, NowPlayingTrack } from '@claw/shared'

interface UseNowPlayingReturn {
  state: 'waiting' | 'playing' | 'loading'
  track: NowPlayingTrack | null
  nextTrack: NowPlayingTrack | null
  startedAt: number | null
  endsAt: number | null
  message: string | null      // "Waiting for first track" when state === 'waiting'
  timeRemaining: number | null // seconds until track ends
  error: string | null
  refetch: () => Promise<void> // Manually trigger a fetch (for recovery scenarios)
}

/**
 * React hook for polling now-playing state from the server.
 *
 * Polls /api/now-playing every 5 seconds (matching KV cache TTL for waiting state).
 * When timeRemaining < 10s, polls every 2 seconds to catch nextTrack appearing.
 *
 * Detects track transitions by comparing track.id across polls, allowing
 * the crossfade system to trigger when the track rotates.
 */
export function useNowPlaying(): UseNowPlayingReturn {
  const [state, setState] = useState<'waiting' | 'playing' | 'loading'>('loading')
  const [track, setTrack] = useState<NowPlayingTrack | null>(null)
  const [nextTrack, setNextTrack] = useState<NowPlayingTrack | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Track previous ID to detect transitions
  const previousTrackIdRef = useRef<number | null>(null)

  // Calculate time remaining
  const timeRemaining = endsAt ? Math.max(0, (endsAt - Date.now()) / 1000) : null

  const fetchNowPlaying = useCallback(async () => {
    try {
      const response = await fetch('/api/now-playing')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data: NowPlayingResponse = await response.json()

      if (data.state === 'waiting') {
        setState('waiting')
        setTrack(null)
        setNextTrack(null)
        setStartedAt(null)
        setEndsAt(null)
        setMessage(data.message || 'Waiting for first track')
        setError(null)
      } else if (data.state === 'playing' && data.track) {
        // Track transition detection
        const currentTrackId = data.track.id
        if (previousTrackIdRef.current !== null && previousTrackIdRef.current !== currentTrackId) {
          // Track ID changed - transition occurred
          console.log('Track transition detected:', previousTrackIdRef.current, '->', currentTrackId)
        }
        previousTrackIdRef.current = currentTrackId

        setState('playing')
        setTrack(data.track)
        setNextTrack(data.nextTrack || null)
        setStartedAt(data.startedAt || null)
        setEndsAt(data.endsAt || null)
        setMessage(null)
        setError(null)
      }
    } catch (err) {
      console.warn('Error fetching now-playing:', err)
      // Keep last known state, set error message
      setError(err instanceof Error ? err.message : 'Failed to fetch now-playing')
      // Don't crash - retry on next interval
    }
  }, [])

  useEffect(() => {
    // Fetch immediately on mount
    fetchNowPlaying()

    // Determine poll interval based on time remaining
    const getPollInterval = () => {
      if (timeRemaining !== null && timeRemaining < 10) {
        // Poll more frequently when < 10s remaining (catch nextTrack appearing)
        return 2000
      }
      // Normal polling: every 5 seconds (matches KV cache TTL)
      return 5000
    }

    // Set up polling interval
    const intervalId = setInterval(() => {
      fetchNowPlaying()
    }, getPollInterval())

    // Update interval if timeRemaining changes
    return () => clearInterval(intervalId)
  }, [fetchNowPlaying, timeRemaining])

  return {
    state,
    track,
    nextTrack,
    startedAt,
    endsAt,
    message,
    timeRemaining,
    error,
    refetch: fetchNowPlaying,
  }
}
