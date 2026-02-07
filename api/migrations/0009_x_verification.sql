-- X/Twitter verification for artist profiles
-- Adds optional X account linking for social proof and marketing

ALTER TABLE artist_profiles ADD COLUMN x_id TEXT;
ALTER TABLE artist_profiles ADD COLUMN x_handle TEXT;
ALTER TABLE artist_profiles ADD COLUMN x_name TEXT;
ALTER TABLE artist_profiles ADD COLUMN x_avatar TEXT;
ALTER TABLE artist_profiles ADD COLUMN x_follower_count INTEGER;
ALTER TABLE artist_profiles ADD COLUMN x_verified_at INTEGER;

-- Verification claims table: tracks pending verifications
CREATE TABLE IF NOT EXISTS verification_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL,
  verification_code TEXT NOT NULL UNIQUE,
  claim_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Index for looking up claims by wallet
CREATE INDEX idx_verification_claims_wallet ON verification_claims(wallet);

-- Index for looking up by claim token
CREATE INDEX idx_verification_claims_token ON verification_claims(claim_token);
