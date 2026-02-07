-- Listener usernames (separate from artist profiles)
CREATE TABLE IF NOT EXISTS listener_usernames (
  wallet_address TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index for case-insensitive username lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_listener_username ON listener_usernames(username COLLATE NOCASE);
