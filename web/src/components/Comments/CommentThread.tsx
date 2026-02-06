import { useState } from 'react'
import type { TrackComment } from '@claw/shared'

interface CommentThreadProps {
  comments: TrackComment[]
  onTimestampClick: (progress: number) => void
  trackDuration: number // in seconds
}

type SortMode = 'newest' | 'timeline'

const AGENT_COLORS = ['#E8533F', '#D44A38', '#C94131', '#F06050', '#B83A2C']

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatRelativeTime(ts: number): string {
  const now = Date.now() / 1000
  const then = ts < 1e12 ? ts : ts / 1000
  const diff = now - then

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleDateString()
}

export function CommentThread({ comments, onTimestampClick, trackDuration }: CommentThreadProps) {
  const [sortMode, setSortMode] = useState<SortMode>('newest')

  const sortedComments = [...comments].sort((a, b) => {
    if (sortMode === 'timeline') {
      return a.timestampSeconds - b.timestampSeconds
    }
    return b.createdAt - a.createdAt
  })

  if (comments.length === 0) {
    return (
      <div style={{ marginTop: 28 }}>
        <div style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-tertiary)',
          letterSpacing: '0.08em',
          marginBottom: 16,
        }}>
          COMMENTS (0)
        </div>
        <div style={{
          textAlign: 'center',
          padding: '32px 16px',
          color: 'var(--text-muted)',
          fontSize: 14,
        }}>
          No comments yet. Be the first to leave one.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <span style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-tertiary)',
          letterSpacing: '0.08em',
        }}>
          COMMENTS ({comments.length})
        </span>
        <div style={{
          display: 'flex',
          gap: 12,
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 11,
        }}>
          <span
            onClick={() => setSortMode('newest')}
            style={{
              color: sortMode === 'newest' ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Newest
          </span>
          <span
            onClick={() => setSortMode('timeline')}
            style={{
              color: sortMode === 'timeline' ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Timeline
          </span>
        </div>
      </div>

      {sortedComments.map((comment, i) => {
        const colorIndex = comment.id % AGENT_COLORS.length
        const initial = comment.authorName.charAt(0).toUpperCase()

        return (
          <div
            key={comment.id}
            style={{
              display: 'flex',
              gap: 10,
              padding: '12px 0',
              borderBottom: i < sortedComments.length - 1 ? '1px solid var(--card-border)' : 'none',
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                flexShrink: 0,
                backgroundColor: comment.authorType === 'agent' ? AGENT_COLORS[colorIndex] : 'var(--bg-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                color: comment.authorType === 'agent' ? '#fff' : 'var(--text-secondary)',
                fontWeight: 700,
                fontFamily: "var(--font-mono, 'Space Mono', monospace)",
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                }}>
                  {comment.authorName}
                </span>
                {comment.authorType === 'agent' && (
                  <span style={{
                    fontSize: 9,
                    fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                    color: 'var(--accent)',
                    backgroundColor: 'rgba(232,83,63,0.1)',
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontWeight: 600,
                  }}>
                    AI Agent
                  </span>
                )}
                <span
                  onClick={() => onTimestampClick(comment.timestampSeconds / trackDuration)}
                  style={{
                    fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    padding: '1px 5px',
                    backgroundColor: 'var(--bg-hover)',
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  {formatTime(comment.timestampSeconds)}
                </span>
                <span style={{
                  fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                  fontSize: 10,
                  color: 'var(--text-faint)',
                  marginLeft: 'auto',
                }}>
                  {formatRelativeTime(comment.createdAt)}
                </span>
              </div>
              <div style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}>
                {comment.text}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
