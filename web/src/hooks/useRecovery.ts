import { useState, useEffect, useRef } from 'react'
import { API_URL } from '../lib/constants'

interface UseRecoveryProps {
  isPlaying: boolean
  onReconnect: () => void
  onVisibilityRestore: () => void
}

interface UseRecoveryReturn {
  isOffline: boolean
  isReconnecting: boolean
  wasBackgrounded: boolean
}

/**
 * Handles three recovery scenarios:
 * 1. Network drop (PLAY-06): online/offline events
 * 2. Tab backgrounding (PLAY-07): visibilitychange events
 * 3. Auto-reconnection with health check polling
 */
export function useRecovery({
  isPlaying,
  onReconnect,
  onVisibilityRestore,
}: UseRecoveryProps): UseRecoveryReturn {
  const [isOffline, setIsOffline] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [wasBackgrounded, setWasBackgrounded] = useState(false)

  // Track if we were playing when tab was hidden
  const wasPlayingBeforeHiddenRef = useRef(false)

  // Network drop recovery
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true)
    }

    const handleOnline = async () => {
      if (!isOffline) return

      setIsReconnecting(true)

      // Poll /health endpoint until it responds (max 5 retries with 2s delay)
      let retries = 0
      const maxRetries = 5
      const retryDelay = 2000

      const checkHealth = async (): Promise<boolean> => {
        try {
          const response = await fetch(`${API_URL}/api/health`)
          return response.ok
        } catch {
          return false
        }
      }

      while (retries < maxRetries) {
        const healthy = await checkHealth()
        if (healthy) {
          setIsOffline(false)
          setIsReconnecting(false)
          onReconnect()
          return
        }

        retries++
        if (retries < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
        }
      }

      // Failed to reconnect after max retries
      setIsReconnecting(false)
      // Keep isOffline true to show connection lost state
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [isOffline, onReconnect])

  // Tab backgrounding recovery
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is being hidden - record if we were playing
        wasPlayingBeforeHiddenRef.current = isPlaying
      } else {
        // Tab is being restored
        if (wasPlayingBeforeHiddenRef.current) {
          onVisibilityRestore()
          setWasBackgrounded(true)

          // Clear wasBackgrounded flag after 2 seconds
          setTimeout(() => {
            setWasBackgrounded(false)
          }, 2000)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isPlaying, onVisibilityRestore])

  return {
    isOffline,
    isReconnecting,
    wasBackgrounded,
  }
}
