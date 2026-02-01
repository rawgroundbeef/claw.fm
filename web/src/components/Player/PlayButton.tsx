interface PlayButtonProps {
  isPlaying: boolean;
  isLoading: boolean;
  disabled: boolean;
  onPlay: () => void;
  onPause: () => void;
}

export function PlayButton({ isPlaying, isLoading, disabled, onPlay, onPause }: PlayButtonProps) {
  const handleClick = () => {
    if (disabled) return;
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        w-12 h-12 rounded-full bg-black text-white
        flex items-center justify-center
        transition-transform
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}
      `}
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {isLoading ? (
        // Loading spinner
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : isPlaying ? (
        // Pause icon (two vertical bars)
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        // Play icon (right-pointing triangle)
        <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
