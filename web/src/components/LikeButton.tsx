import { useEffect, useState } from 'react'
import { useLikes } from '../contexts/LikeContext'

interface LikeButtonProps {
  trackId: number
  initialLiked?: boolean
  initialCount?: number
}

// Heart icon component
function HeartIcon({ filled, size = 16 }: { filled: boolean; size?: number }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

// Pill variant (homepage, song page) - Heart icon + count
export function LikeButtonPill({ trackId, initialLiked, initialCount }: LikeButtonProps) {
  const { getLikeState, setLikeState, toggleLike, fetchLikeStatus } = useLikes()
  const [animating, setAnimating] = useState(false)

  // Initialize state from props or fetch from API
  useEffect(() => {
    if (initialLiked !== undefined && initialCount !== undefined) {
      const current = getLikeState(trackId)
      if (!current) {
        setLikeState(trackId, initialLiked, initialCount)
      }
    } else {
      // No initial state provided, fetch from API
      fetchLikeStatus(trackId)
    }
  }, [trackId, initialLiked, initialCount, getLikeState, setLikeState, fetchLikeStatus])

  const state = getLikeState(trackId)
  const liked = state?.liked ?? initialLiked ?? false
  const likeCount = state?.likeCount ?? initialCount ?? 0

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()

    // Only animate on like, not unlike
    if (!liked) {
      setAnimating(true)
      setTimeout(() => setAnimating(false), 350)
    }

    await toggleLike(trackId)
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center transition-all"
      style={{
        padding: '8px 14px',
        borderRadius: '20px',
        background: liked ? 'var(--accent-dim)' : 'transparent',
        border: `1px solid ${liked ? 'var(--accent)' : 'var(--border)'}`,
        color: liked ? 'var(--accent)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        gap: '6px',
      }}
      onMouseEnter={(e) => {
        if (!liked) {
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.color = 'var(--accent)'
          e.currentTarget.style.background = 'var(--accent-dim)'
        }
      }}
      onMouseLeave={(e) => {
        if (!liked) {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          transform: animating ? 'scale(1.3)' : 'scale(1)',
          transition: 'transform 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
      >
        <HeartIcon filled={liked} size={16} />
      </span>
      <span>{likeCount}</span>
    </button>
  )
}

// Icon-only variant (track list, player bar)
export function LikeButtonIcon({ trackId, initialLiked, initialCount }: LikeButtonProps) {
  const { getLikeState, setLikeState, toggleLike, fetchLikeStatus } = useLikes()
  const [animating, setAnimating] = useState(false)

  // Initialize state from props or fetch from API
  useEffect(() => {
    if (initialLiked !== undefined && initialCount !== undefined) {
      const current = getLikeState(trackId)
      if (!current) {
        setLikeState(trackId, initialLiked, initialCount)
      }
    } else {
      // No initial state provided, fetch from API
      fetchLikeStatus(trackId)
    }
  }, [trackId, initialLiked, initialCount, getLikeState, setLikeState, fetchLikeStatus])

  const state = getLikeState(trackId)
  const liked = state?.liked ?? initialLiked ?? false

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()

    // Only animate on like, not unlike
    if (!liked) {
      setAnimating(true)
      setTimeout(() => setAnimating(false), 350)
    }

    await toggleLike(trackId)
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-center transition-all"
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: 'transparent',
        border: 'none',
        color: liked ? 'var(--accent)' : 'var(--text-tertiary)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!liked) {
          e.currentTarget.style.color = 'var(--accent)'
          e.currentTarget.style.background = 'var(--accent-dim)'
        }
      }}
      onMouseLeave={(e) => {
        if (!liked) {
          e.currentTarget.style.color = 'var(--text-tertiary)'
          e.currentTarget.style.background = 'transparent'
        }
      }}
      title={liked ? 'Unlike' : 'Like'}
    >
      <span
        style={{
          display: 'inline-flex',
          transform: animating ? 'scale(1.3)' : 'scale(1)',
          transition: 'transform 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
      >
        <HeartIcon filled={liked} size={18} />
      </span>
    </button>
  )
}
