import { useState, useEffect, useCallback, useRef } from 'react'
import type { NowPlayingResponse, NowPlayingTrack } from '@claw/shared'
import { API_URL } from '../lib/constants'

interface UseNowPlayingReturn {
  state: 'idle' | 'waiting' | 'playing' | 'loading'
  track: NowPlayingTrack | null
  nextTrack: NowPlayingTrack | null
  startedAt: number | null
  endsAt: number | null
  message: string | null
  error: string | null
  /** Manually fetch now-playing state */
  fetch: () => Promise<{ track: NowPlayingTrack | null; startedAt: number | null }>
  /** Start listening - fetches immediately and schedules next fetch based on endsAt. Returns promise that resolves with first fetch result. */
  activate: () => Promise<{ track: NowPlayingTrack | null; startedAt: number | null }>
  /** Stop listening - cancels any scheduled fetches */
  deactivate: () => void
  isActive: boolean
}

/**
 * React hook for fetching now-playing state from the server.
 *
 * LAZY by default - does NOT poll until activate() is called.
 *
 * Once active:
 * - Fetches immediately
 * - Schedules next fetch ~5s before track ends (based on endsAt)
 * - No wasteful constant polling
 */
export function useNowPlaying(): UseNowPlayingReturn {
  const [state, setState] = useState<'idle' | 'waiting' | 'playing' | 'loading'>('idle')
  const [track, setTrack] = useState<NowPlayingTrack | null>(null)
  const [nextTrack, setNextTrack] = useState<NowPlayingTrack | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(false)

  // Refs for scheduling
  const scheduledTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveRef = useRef(false)

  // Track previous ID to detect transitions
  const previousTrackIdRef = useRef<number | null>(null)

  const clearScheduledFetch = useCallback(() => {
    if (scheduledTimeoutRef.current) {
      clearTimeout(scheduledTimeoutRef.current)
      scheduledTimeoutRef.current = null
    }
  }, [])

  const fetchNowPlaying = useCallback(async (): Promise<{ track: NowPlayingTrack | null; startedAt: number | null }> => {
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

        // In waiting state, check again in 10s
        if (isActiveRef.current) {
          clearScheduledFetch()
          scheduledTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current) fetchNowPlaying()
          }, 10000)
        }

        return { track: null, startedAt: null }
      } else if (data.state === 'playing' && data.track) {
        // Track transition detection
        const currentTrackId = data.track.id
        if (previousTrackIdRef.current !== null && previousTrackIdRef.current !== currentTrackId) {
          console.log('[NowPlaying] Track transition:', previousTrackIdRef.current, '->', currentTrackId)
        }
        previousTrackIdRef.current = currentTrackId

        setState('playing')
        setTrack(data.track)
        setNextTrack(data.nextTrack || null)
        setStartedAt(data.startedAt || null)
        setEndsAt(data.endsAt || null)
        setMessage(null)
        setError(null)

        // Schedule next fetch ~5s before track ends
        if (data.endsAt && isActiveRef.current) {
          const msUntilEnd = data.endsAt - Date.now()
          const fetchIn = Math.max(1000, msUntilEnd - 5000) // At least 1s, or 5s before end

          clearScheduledFetch()
          console.log(`[NowPlaying] Next fetch in ${Math.round(fetchIn / 1000)}s`)
          scheduledTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current) fetchNowPlaying()
          }, fetchIn)
        }

        return { track: data.track, startedAt: data.startedAt || null }
      }

      return { track: null, startedAt: null }
    } catch (err) {
      console.warn('[NowPlaying] Error fetching:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch now-playing')

      // On error, retry in 10s if still active
      if (isActiveRef.current) {
        clearScheduledFetch()
        scheduledTimeoutRef.current = setTimeout(() => {
          if (isActiveRef.current) fetchNowPlaying()
        }, 10000)
      }

      return { track: null, startedAt: null }
    }
  }, [clearScheduledFetch])

  const activate = useCallback(async (): Promise<{ track: NowPlayingTrack | null; startedAt: number | null }> => {
    if (isActiveRef.current) {
      // Already active - return current state
      return { track, startedAt }
    }

    console.log('[NowPlaying] Activated')
    isActiveRef.current = true
    setIsActive(true)
    setState('loading')
    return fetchNowPlaying()
  }, [fetchNowPlaying, track, startedAt])

  const deactivate = useCallback(() => {
    console.log('[NowPlaying] Deactivated')
    isActiveRef.current = false
    setIsActive(false)
    clearScheduledFetch()
  }, [clearScheduledFetch])

  // Fetch once on mount to show current track, but don't start polling yet
  useEffect(() => {
    // Single fetch to display what's playing
    fetchNowPlaying()

    return () => {
      clearScheduledFetch()
    }
  }, [clearScheduledFetch, fetchNowPlaying])

  return {
    state,
    track,
    nextTrack,
    startedAt,
    endsAt,
    message,
    error,
    fetch: fetchNowPlaying,
    activate,
    deactivate,
    isActive,
  }
}
