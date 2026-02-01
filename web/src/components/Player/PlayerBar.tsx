interface PlayerBarProps {
  leftContent: React.ReactNode;   // NowPlaying
  centerContent: React.ReactNode; // PlayButton + ProgressBar
  rightContent: React.ReactNode;  // VolumeControl
}

export function PlayerBar({ leftContent, centerContent, rightContent }: PlayerBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-white border-t border-gray-100 shadow-sm z-50">
      <div className="h-full flex items-center justify-between px-4 gap-4">
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
