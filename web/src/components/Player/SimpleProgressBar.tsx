import { useCallback } from 'react'

interface SimpleProgressBarProps {
  currentTime: number
  duration: number
  onSeek?: (time: number) => void
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function SimpleProgressBar({ currentTime, duration, onSeek }: SimpleProgressBarProps) {
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || duration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    onSeek(ratio * duration)
  }, [onSeek, duration])

  const remaining = duration - currentTime

  return (
    <div className="flex-1 min-w-0">
      {/* Progress bar track */}
      <div
        onClick={handleClick}
        className="relative w-full rounded-full overflow-hidden"
        style={{
          height: '4px',
          background: 'var(--text-faint)',
          cursor: onSeek ? 'pointer' : 'default',
        }}
      >
        {/* Progress fill */}
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-[width]"
          style={{
            width: `${progress}%`,
            background: 'var(--accent)',
            transitionDuration: '100ms',
          }}
        />
      </div>

      {/* Time display */}
      <div
        className="flex justify-between mt-1 tabular-nums"
        style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}
      >
        <span>{formatTime(currentTime)}</span>
        <span>{remaining > 0 ? `-${formatTime(remaining)}` : '0:00'}</span>
      </div>
    </div>
  )
}
