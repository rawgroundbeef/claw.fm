import { useState } from 'react';
import { Link } from 'react-router';
import type { NowPlayingTrack } from '@claw/shared';
import { Identicon } from '../Identicon';
import { LikeButtonIcon } from '../LikeButton';

interface NowPlayingProps {
  track: NowPlayingTrack | null;
  isTransitioning?: boolean;
}

export function NowPlaying({ track, isTransitioning = false }: NowPlayingProps) {
  const [imgError, setImgError] = useState(false);
  
  if (!track) {
    return null;
  }

  // Determine display artist name (priority: displayName > artistName > truncated wallet)
  const displayArtist = track.artistDisplayName ||
    track.artistName ||
    `${track.artistWallet.slice(0, 6)}...${track.artistWallet.slice(-4)}`;

  // Determine link target
  const artistPath = track.artistUsername
    ? `/${track.artistUsername}`
    : `/w/${track.artistWallet}`;

  return (
    <div
      className={`flex items-center gap-3 min-w-0 transition-opacity duration-1000 ${
        isTransitioning ? 'opacity-50' : 'opacity-100'
      }`}
    >
      {/* Cover Art */}
      <div className="flex-shrink-0">
        {track.coverUrl && !imgError ? (
          <img
            src={track.coverUrl}
            alt={`${track.title} cover`}
            className="w-12 h-12 object-cover"
            style={{ borderRadius: '4px' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <Identicon seed={`${track.id}-${track.title}`} size={48} />
        )}
      </div>

      {/* Track Info */}
      <div className="min-w-0" style={{ width: '140px' }}>
        <Link
          to={track.slug && track.artistUsername ? `/${track.artistUsername}/${track.slug}` : '#'}
          className="font-medium truncate transition-colors block"
          style={{ fontSize: '14px', color: 'var(--text-primary)', textDecoration: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        >
          {track.title}
        </Link>
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

      {/* Like Button */}
      {track.id && (
        <div className="flex-shrink-0">
          <LikeButtonIcon trackId={track.id} />
        </div>
      )}
    </div>
  );
}
