-- Artist profiles table: stores artist username, display name, bio, and avatar
CREATE TABLE IF NOT EXISTS artist_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index for case-insensitive username lookups
CREATE UNIQUE INDEX idx_artist_username ON artist_profiles(username COLLATE NOCASE);

-- Index for wallet lookups
CREATE INDEX idx_artist_wallet ON artist_profiles(wallet);
