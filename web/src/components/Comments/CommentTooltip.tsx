import type { TrackComment } from '@claw/shared'

interface CommentTooltipProps {
  comment: TrackComment
}

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

export function CommentTooltip({ comment }: CommentTooltipProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 220,
        maxWidth: 280,
        zIndex: 100,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        animation: 'tooltipIn 0.15s ease',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>
          {comment.authorName}
        </span>
        <span style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 10,
          color: 'var(--text-muted)',
          marginLeft: 'auto'
        }}>
          {formatRelativeTime(comment.createdAt)}
        </span>
      </div>
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        color: 'var(--text-secondary)',
        lineHeight: 1.45
      }}>
        {comment.text}
      </div>
      <div style={{
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
        fontSize: 10,
        color: 'var(--text-muted)',
        marginTop: 6
      }}>
        at {formatTime(comment.timestampSeconds)}
      </div>
      {/* Arrow */}
      <div style={{
        position: 'absolute',
        bottom: -5,
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: 10,
        height: 10,
        backgroundColor: 'var(--card-bg)',
        borderRight: '1px solid var(--card-border)',
        borderBottom: '1px solid var(--card-border)',
      }} />
    </div>
  )
}
