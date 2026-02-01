-- Add submission-related columns to tracks table
-- SQLite ALTER TABLE limitation: each column must be added separately

ALTER TABLE tracks ADD COLUMN genre TEXT NOT NULL DEFAULT 'other';

ALTER TABLE tracks ADD COLUMN description TEXT;

ALTER TABLE tracks ADD COLUMN tags TEXT;

ALTER TABLE tracks ADD COLUMN file_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE tracks ADD COLUMN artist_name TEXT;

-- Composite index for duplicate detection (wallet + file_hash)
CREATE INDEX idx_tracks_wallet_hash ON tracks(wallet, file_hash);
