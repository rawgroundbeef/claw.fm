import { useState, useEffect, useCallback, useRef } from 'react'
import { calculateServerOffset } from '../utils/timeSync'
import type { HealthResponse } from '@claw/shared'
import { API_URL } from '../lib/constants'

interface ServerTimeState {
  offset: number
  isSynced: boolean
  getServerTime: () => number
  /** Sync once on demand (for initial playback) */
  syncOnce: () => Promise<void>
}

/**
 * React hook for maintaining server time synchronization.
 *
 * LAZY by default - only syncs when syncOnce() is called.
 * After first sync, periodically re-syncs every 60 seconds to handle clock drift.
 *
 * @returns Server time state with offset and getServerTime() helper
 */
export function useServerTime(): ServerTimeState {
  const [offset, setOffset] = useState(0)
  const [isSynced, setIsSynced] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const syncTime = useCallback(async () => {
    try {
      const clientSendTime = Date.now()
      const response = await fetch(`${API_URL}/health`)
      const clientReceiveTime = Date.now()

      if (!response.ok) {
        console.warn('[ServerTime] Failed to sync:', response.status)
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
      setIsSynced(true)
      console.log(`[ServerTime] Synced, offset: ${newOffset}ms`)
    } catch (error) {
      console.warn('[ServerTime] Error syncing:', error)
    }
  }, [])

  // Sync once on demand, then start periodic sync every 60s
  const syncOnce = useCallback(async () => {
    if (isSynced) return // Already synced

    await syncTime()

    // Start periodic sync for clock drift (every 60s)
    if (!intervalRef.current) {
      intervalRef.current = setInterval(syncTime, 60000)
    }
  }, [isSynced, syncTime])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  const getServerTime = useCallback(() => Date.now() + offset, [offset])

  return { offset, isSynced, getServerTime, syncOnce }
}
