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
      className="flex-shrink-0 flex items-center justify-center transition-all"
      style={{
        width: '40px',
        height: '40px',
        minWidth: '40px',
        minHeight: '40px',
        borderRadius: '50%',
        background: 'var(--accent)',
        color: 'white',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'var(--accent-hover)'
          e.currentTarget.style.transform = 'scale(1.05)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--accent)'
        e.currentTarget.style.transform = 'scale(1)'
      }}
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {isLoading ? (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24">
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-[1px]">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
