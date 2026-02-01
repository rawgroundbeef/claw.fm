-- Tracks table: stores metadata for submitted audio tracks
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  wallet TEXT NOT NULL,
  duration INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  cover_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  play_count INTEGER NOT NULL DEFAULT 0,
  tip_weight REAL NOT NULL DEFAULT 0.0
);

-- Index for querying tracks by submitter wallet
CREATE INDEX idx_tracks_wallet ON tracks(wallet);

-- Index for decay-weighted rotation (created_at used for age decay)
CREATE INDEX idx_tracks_created_at ON tracks(created_at);

-- Index for queue selection (tip_weight for weighted random)
CREATE INDEX idx_tracks_tip_weight ON tracks(tip_weight);
