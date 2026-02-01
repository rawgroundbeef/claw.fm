import { useEffect, useRef } from 'react'
import { getCorrectPlaybackPosition } from '../utils/timeSync'

interface AudioSyncProps {
  audioElement: HTMLAudioElement | null
  startedAt: number | undefined
  durationMs: number | undefined
  serverOffset: number
  isPlaying: boolean
}

interface AudioSyncState {
  getCorrectPosition: () => number
}

/**
 * React hook for keeping audio element synchronized with server time.
 *
 * Handles:
 * - Initial seek when track changes
 * - Periodic drift correction while playing
 * - Correct position calculation for UI progress display
 *
 * @param props - Audio sync configuration
 * @returns State with getCorrectPosition() for UI display
 */
export function useAudioSync({
  audioElement,
  startedAt,
  durationMs,
  serverOffset,
  isPlaying,
}: AudioSyncProps): AudioSyncState {
  const lastSyncRef = useRef<number>(0)

  // Sync on track change
  useEffect(() => {
    if (!audioElement || startedAt === undefined || durationMs === undefined) {
      return
    }

    const correctPosition = getCorrectPlaybackPosition(
      startedAt,
      durationMs,
      serverOffset
    )

    const currentPosition = audioElement.currentTime
    const drift = Math.abs(correctPosition - currentPosition)

    // Only seek if drift is significant (> 1 second)
    if (drift > 1) {
      console.log(
        `[AudioSync] Track change - seeking to ${correctPosition.toFixed(1)}s (drift: ${drift.toFixed(1)}s)`
      )
      audioElement.currentTime = correctPosition
    }

    lastSyncRef.current = Date.now()
  }, [audioElement, startedAt, durationMs, serverOffset])

  // Periodic drift correction while playing
  useEffect(() => {
    if (!isPlaying || !audioElement || startedAt === undefined || durationMs === undefined) {
      return
    }

    const checkDrift = () => {
      const correctPosition = getCorrectPlaybackPosition(
        startedAt,
        durationMs,
        serverOffset
      )

      const currentPosition = audioElement.currentTime
      const drift = Math.abs(correctPosition - currentPosition)

      // Re-sync if drift exceeds threshold
      if (drift > 1) {
        console.log(
          `[AudioSync] Drift detected - correcting to ${correctPosition.toFixed(1)}s (drift: ${drift.toFixed(1)}s)`
        )
        audioElement.currentTime = correctPosition
        lastSyncRef.current = Date.now()
      }
    }

    // Check every 10 seconds
    const intervalId = setInterval(checkDrift, 10000)

    return () => clearInterval(intervalId)
  }, [isPlaying, audioElement, startedAt, durationMs, serverOffset])

  const getCorrectPosition = (): number => {
    if (startedAt === undefined || durationMs === undefined) {
      return 0
    }

    return getCorrectPlaybackPosition(startedAt, durationMs, serverOffset)
  }

  return { getCorrectPosition }
}
