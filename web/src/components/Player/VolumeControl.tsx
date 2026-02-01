interface VolumeControlProps {
  volume: number;          // 0-1
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
}

export function VolumeControl({ volume, isMuted, onVolumeChange, onMuteToggle }: VolumeControlProps) {
  const displayVolume = isMuted ? 0 : volume;
  const volumeLevel = displayVolume > 0.5 ? 'high' : displayVolume > 0 ? 'low' : 'muted';

  return (
    <div className="hidden md:flex items-center gap-2">
      {/* Mute toggle button */}
      <button
        onClick={onMuteToggle}
        className="text-gray-600 hover:text-black transition-colors"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {volumeLevel === 'high' ? (
          // Speaker icon - high volume
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        ) : volumeLevel === 'low' ? (
          // Speaker icon - low volume
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        ) : (
          // Speaker icon - muted (with line through)
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        )}
      </button>

      {/* Volume slider */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={displayVolume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        className="w-24 h-1 bg-gray-200 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-black
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-3
          [&::-moz-range-thumb]:h-3
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-black
          [&::-moz-range-thumb]:cursor-pointer
          [&::-moz-range-thumb]:border-0"
        aria-label="Volume"
      />
    </div>
  );
}
