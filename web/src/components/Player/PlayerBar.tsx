interface PlayerBarProps {
  leftContent: React.ReactNode;   // NowPlaying
  centerContent: React.ReactNode; // PlayButton + ProgressBar
  rightContent: React.ReactNode;  // VolumeControl
}

export function PlayerBar({ leftContent, centerContent, rightContent }: PlayerBarProps) {
  return (
    <div
      className="flex-shrink-0"
      style={{
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '16px 32px',
      }}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: Now Playing */}
        <div className="flex-shrink-0 w-1/4 min-w-0">
          {leftContent}
        </div>

        {/* Center: Play Controls + Progress */}
        <div className="flex-1 flex flex-col items-center gap-1">
          {centerContent}
        </div>

        {/* Right: Volume Control */}
        <div className="flex-shrink-0 w-1/4 flex justify-end">
          {rightContent}
        </div>
      </div>
    </div>
  );
}
