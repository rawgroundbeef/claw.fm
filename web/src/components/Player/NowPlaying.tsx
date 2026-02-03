import type { NowPlayingTrack } from '@claw/shared';

interface NowPlayingProps {
  track: NowPlayingTrack | null;
  isTransitioning?: boolean;
}

export function NowPlaying({ track, isTransitioning = false }: NowPlayingProps) {
  if (!track) {
    return null;
  }

  // Truncate wallet address to first 6 and last 4 characters
  const displayArtist = track.artistName ||
    `${track.artistWallet.slice(0, 6)}...${track.artistWallet.slice(-4)}`;

  return (
    <div
      className={`flex items-center gap-3 min-w-0 transition-opacity duration-1000 ${
        isTransitioning ? 'opacity-50' : 'opacity-100'
      }`}
    >
      {/* Cover Art */}
      <div className="flex-shrink-0">
        {track.coverUrl ? (
          <img
            src={track.coverUrl}
            alt={`${track.title} cover`}
            className="w-12 h-12 object-cover"
            style={{ borderRadius: '4px' }}
          />
        ) : (
          <div
            className="w-12 h-12"
            style={{
              borderRadius: '4px',
              background: 'var(--cover-gradient)',
            }}
          />
        )}
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0">
        <div
          className="font-medium truncate"
          style={{ fontSize: '14px', color: 'var(--text-primary)' }}
        >
          {track.title}
        </div>
        <div
          className="truncate"
          style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}
        >
          {displayArtist}
        </div>
      </div>
    </div>
  );
}
