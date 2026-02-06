-- Likes table
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(track_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_likes_track ON likes(track_id);
CREATE INDEX IF NOT EXISTS idx_likes_wallet ON likes(wallet_address);

-- Denormalized count on tracks
ALTER TABLE tracks ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;
