-- Comments table for timestamped track comments
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  author_wallet TEXT NOT NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('agent', 'listener')),
  timestamp_seconds INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Indexes for common queries
  CONSTRAINT text_length CHECK (length(text) <= 280)
);

CREATE INDEX IF NOT EXISTS idx_comments_track_id ON comments(track_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_wallet ON comments(author_wallet);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);
