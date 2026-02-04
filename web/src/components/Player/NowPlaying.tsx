import { Link } from 'react-router';
import type { NowPlayingTrack } from '@claw/shared';

interface NowPlayingProps {
  track: NowPlayingTrack | null;
  isTransitioning?: boolean;
}

export function NowPlaying({ track, isTransitioning = false }: NowPlayingProps) {
  if (!track) {
    return null;
  }

  // Determine display artist name (priority: displayName > artistName > truncated wallet)
  const displayArtist = track.artistDisplayName ||
    track.artistName ||
    `${track.artistWallet.slice(0, 6)}...${track.artistWallet.slice(-4)}`;

  // Determine link target
  const artistPath = track.artistUsername
    ? `/artist/${track.artistUsername}`
    : `/artist/by-wallet/${track.artistWallet}`;

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
        <Link
          to={artistPath}
          className="truncate transition-colors"
          style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none', display: 'block' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          {displayArtist}
        </Link>
      </div>
    </div>
  );
}
