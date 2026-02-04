interface PlayerBarProps {
  leftContent: React.ReactNode;   // NowPlaying
  centerContent: React.ReactNode; // PlayButton + ProgressBar
  rightContent: React.ReactNode;  // VolumeControl
}

export function PlayerBar({ leftContent, centerContent, rightContent }: PlayerBarProps) {
  return (
    <div
      className="flex-shrink-0 px-4 py-3 md:px-8 md:py-4"
      style={{
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: Now Playing — hidden on mobile (shown in main content) */}
        <div className="hidden md:block flex-shrink-0 w-1/4 min-w-0">
          {leftContent}
        </div>

        {/* Center: Play Controls + Progress */}
        <div className="flex-1 flex flex-col items-center gap-1">
          {centerContent}
        </div>

        {/* Right: Volume Control — hidden on mobile via VolumeControl */}
        <div className="hidden md:flex flex-shrink-0 w-1/4 justify-end">
          {rightContent}
        </div>
      </div>
    </div>
  );
}
