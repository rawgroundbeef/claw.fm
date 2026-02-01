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
            className="w-14 h-14 rounded-lg object-cover"
          />
        ) : (
          // Placeholder gradient when no cover art
          <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-gray-200 to-gray-300" />
        )}
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">
          {track.title}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {displayArtist}
        </div>
      </div>
    </div>
  );
}
