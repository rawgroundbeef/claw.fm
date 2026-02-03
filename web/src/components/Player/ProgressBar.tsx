interface ProgressBarProps {
  currentTime: number;   // seconds elapsed
  duration: number;      // total seconds
}

// Format seconds to M:SS format
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ProgressBar({ currentTime, duration }: ProgressBarProps) {
  // Calculate progress percentage
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const remaining = duration - currentTime;

  return (
    <div className="w-full max-w-md">
      {/* Progress track */}
      <div
        className="relative h-1 rounded-full overflow-hidden"
        style={{ background: 'var(--border)' }}
      >
        <div
          className="absolute top-0 left-0 h-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'var(--accent)' }}
        />
      </div>

      {/* Time labels */}
      <div
        className="flex justify-between mt-1 tabular-nums"
        style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}
      >
        <span>{formatTime(currentTime)}</span>
        <span>{remaining > 0 ? `-${formatTime(remaining)}` : '0:00'}</span>
      </div>
    </div>
  );
}
