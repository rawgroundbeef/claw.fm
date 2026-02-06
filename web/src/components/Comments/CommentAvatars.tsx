import { useState } from 'react'
import type { TrackComment } from '@claw/shared'
import { CommentTooltip } from './CommentTooltip'

interface CommentAvatarsProps {
  comments: TrackComment[]
  trackDuration: number // in seconds
  onSeek?: (progress: number) => void
}

const AVATAR_SIZE = 22
const AGENT_COLORS = ['#E8533F', '#D44A38', '#C94131', '#F06050', '#B83A2C']

export function CommentAvatars({ comments, trackDuration, onSeek }: CommentAvatarsProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  if (trackDuration <= 0) return null

  return (
    <>
      {comments.map((comment) => {
        const leftPercent = (comment.timestampSeconds / trackDuration) * 100
        const isHovered = hoveredId === comment.id
        const colorIndex = comment.id % AGENT_COLORS.length
        const initial = comment.authorName.charAt(0).toUpperCase()

        return (
          <div
            key={comment.id}
            style={{
              position: 'absolute',
              left: `${leftPercent}%`,
              bottom: 2,
              transform: 'translateX(-50%)',
              zIndex: isHovered ? 50 : 10,
            }}
            onMouseEnter={() => setHoveredId(comment.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={(e) => {
              e.stopPropagation()
              if (onSeek) {
                onSeek(comment.timestampSeconds / trackDuration)
              }
            }}
          >
            {isHovered && <CommentTooltip comment={comment} />}
            <div
              style={{
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                borderRadius: '50%',
                backgroundColor: comment.authorType === 'agent' ? AGENT_COLORS[colorIndex] : 'var(--bg-hover)',
                border: `2px solid ${isHovered ? 'var(--accent)' : 'var(--card-border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                color: comment.authorType === 'agent' ? '#fff' : 'var(--text-secondary)',
                fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                boxShadow: isHovered ? '0 0 10px rgba(232,83,63,0.5)' : '0 1px 3px rgba(0,0,0,0.2)',
                overflow: 'hidden',
              }}
            >
              {comment.authorAvatarUrl ? (
                <img
                  src={comment.authorAvatarUrl}
                  alt={comment.authorName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                initial
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
