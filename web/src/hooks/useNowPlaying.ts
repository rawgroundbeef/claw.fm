import { useState, useEffect, useCallback, useRef } from 'react'
import type { NowPlayingResponse, NowPlayingTrack } from '@claw/shared'
import { API_URL } from '../lib/constants'

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

  // Use ref for endsAt so the polling effect doesn't re-run on every change
  const endsAtRef = useRef<number | null>(null)
  endsAtRef.current = endsAt

  // Calculate time remaining
  const timeRemaining = endsAt ? Math.max(0, (endsAt - Date.now()) / 1000) : null

  const fetchNowPlaying = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/now-playing`)

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

    // Poll with dynamic interval using setTimeout chain
    let timeoutId: ReturnType<typeof setTimeout>

    const scheduleNext = () => {
      const remaining = endsAtRef.current
        ? Math.max(0, (endsAtRef.current - Date.now()) / 1000)
        : null
      const interval = remaining !== null && remaining < 10 ? 2000 : 5000

      timeoutId = setTimeout(async () => {
        await fetchNowPlaying()
        scheduleNext()
      }, interval)
    }

    scheduleNext()

    return () => clearTimeout(timeoutId)
  }, [fetchNowPlaying])

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
