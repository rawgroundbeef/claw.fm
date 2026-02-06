-- Add slug column to tracks (URL-safe identifier)
ALTER TABLE tracks ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX idx_tracks_slug ON tracks(slug);

-- Transaction log for tips and purchases
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  type TEXT NOT NULL,
  amount_usdc REAL NOT NULL,
  payer_wallet TEXT NOT NULL,
  artist_wallet TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_txn_track_created ON transactions(track_id, created_at DESC);
CREATE INDEX idx_txn_artist ON transactions(artist_wallet);
