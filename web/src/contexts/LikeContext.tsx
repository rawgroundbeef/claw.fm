import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useWallet } from './WalletContext'
import { API_URL } from '../lib/constants'
import type { LikeToggleResponse } from '@claw/shared'

interface LikeState {
  liked: boolean
  likeCount: number
}

interface LikeContextValue {
  getLikeState: (trackId: number) => LikeState | undefined
  setLikeState: (trackId: number, liked: boolean, likeCount: number) => void
  toggleLike: (trackId: number) => Promise<void>
}

const LikeContext = createContext<LikeContextValue | null>(null)

export function LikeProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet()
  const [likeStates, setLikeStates] = useState<Record<number, LikeState>>({})

  const getLikeState = useCallback((trackId: number): LikeState | undefined => {
    return likeStates[trackId]
  }, [likeStates])

  const setLikeState = useCallback((trackId: number, liked: boolean, likeCount: number) => {
    setLikeStates(prev => ({
      ...prev,
      [trackId]: { liked, likeCount }
    }))
  }, [])

  const toggleLike = useCallback(async (trackId: number) => {
    const current = likeStates[trackId]
    const wasLiked = current?.liked ?? false
    const currentCount = current?.likeCount ?? 0

    // Optimistic update
    setLikeStates(prev => ({
      ...prev,
      [trackId]: {
        liked: !wasLiked,
        likeCount: wasLiked ? Math.max(0, currentCount - 1) : currentCount + 1
      }
    }))

    try {
      const response = await fetch(`${API_URL}/api/tracks/${trackId}/like`, {
        method: 'POST',
        headers: {
          'X-Wallet-Address': address
        }
      })

      if (!response.ok) {
        // Rollback on error
        setLikeStates(prev => ({
          ...prev,
          [trackId]: { liked: wasLiked, likeCount: currentCount }
        }))
        return
      }

      const data: LikeToggleResponse = await response.json()
      // Update with server state
      setLikeStates(prev => ({
        ...prev,
        [trackId]: { liked: data.liked, likeCount: data.likeCount }
      }))
    } catch {
      // Rollback on error
      setLikeStates(prev => ({
        ...prev,
        [trackId]: { liked: wasLiked, likeCount: currentCount }
      }))
    }
  }, [address, likeStates])

  const value = useMemo<LikeContextValue>(
    () => ({ getLikeState, setLikeState, toggleLike }),
    [getLikeState, setLikeState, toggleLike]
  )

  return <LikeContext.Provider value={value}>{children}</LikeContext.Provider>
}

export function useLikes(): LikeContextValue {
  const ctx = useContext(LikeContext)
  if (!ctx) throw new Error('useLikes must be used within LikeProvider')
  return ctx
}
