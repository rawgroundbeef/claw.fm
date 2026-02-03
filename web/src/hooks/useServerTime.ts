import { useState, useEffect } from 'react'
import { calculateServerOffset } from '../utils/timeSync'
import type { HealthResponse } from '@claw/shared'
import { API_URL } from '../lib/constants'

interface ServerTimeState {
  offset: number
  isSynced: boolean
  getServerTime: () => number
}

/**
 * React hook for maintaining server time synchronization.
 *
 * Polls the /health endpoint to calculate and maintain the offset between
 * server and client clocks. This offset is used to calculate correct
 * playback positions for synchronized audio playback.
 *
 * @param pollIntervalMs - How often to sync with server (default: 30 seconds)
 * @returns Server time state with offset and getServerTime() helper
 */
export function useServerTime(pollIntervalMs = 30000): ServerTimeState {
  const [offset, setOffset] = useState(0)
  const [isSynced, setIsSynced] = useState(false)

  useEffect(() => {
    const syncTime = async () => {
      try {
        const clientSendTime = Date.now()
        const response = await fetch(`${API_URL}/health`)
        const clientReceiveTime = Date.now()

        if (!response.ok) {
          console.warn('Failed to sync time with server:', response.status)
          return
        }

        const data: HealthResponse = await response.json()
        const serverTime = data.timestamp

        const newOffset = calculateServerOffset(
          serverTime,
          clientSendTime,
          clientReceiveTime
        )

        setOffset(newOffset)
        if (!isSynced) {
          setIsSynced(true)
        }
      } catch (error) {
        console.warn('Error syncing time with server:', error)
        // Keep last known offset, don't crash
      }
    }

    // Sync immediately on mount
    syncTime()

    // Set up periodic sync
    const intervalId = setInterval(syncTime, pollIntervalMs)

    return () => clearInterval(intervalId)
  }, [pollIntervalMs, isSynced])

  const getServerTime = () => Date.now() + offset

  return { offset, isSynced, getServerTime }
}
