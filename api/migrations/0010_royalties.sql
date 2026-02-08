-- Royalty Pool System
-- 75% to artist (direct), 20% to pool, 5% to platform

-- Pool balance tracking
CREATE TABLE IF NOT EXISTS royalty_pool (
  id INTEGER PRIMARY KEY DEFAULT 1,
  balance INTEGER DEFAULT 0,  -- in USDC micro-units (6 decimals)
  total_distributed INTEGER DEFAULT 0,
  last_distribution_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  CHECK (id = 1)  -- singleton table
);

-- Initialize pool
INSERT OR IGNORE INTO royalty_pool (id, balance) VALUES (1, 0);

-- Artist claimable balances (added to artist_profiles)
ALTER TABLE artist_profiles ADD COLUMN claimable_balance INTEGER DEFAULT 0;  -- USDC micro-units
ALTER TABLE artist_profiles ADD COLUMN lifetime_royalties INTEGER DEFAULT 0;  -- total ever earned from pool
ALTER TABLE artist_profiles ADD COLUMN last_claim_at INTEGER;

-- Distribution history (each time pool is distributed)
CREATE TABLE IF NOT EXISTS royalty_distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  pool_amount INTEGER NOT NULL,  -- total distributed this period
  total_points INTEGER NOT NULL,  -- sum of all engagement points
  artist_count INTEGER NOT NULL,  -- how many artists received
  created_at INTEGER DEFAULT (unixepoch())
);

-- Individual artist distributions (who got what)
CREATE TABLE IF NOT EXISTS royalty_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distribution_id INTEGER NOT NULL,
  wallet TEXT NOT NULL,
  points INTEGER NOT NULL,
  amount INTEGER NOT NULL,  -- USDC micro-units
  plays INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  tips_received INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (distribution_id) REFERENCES royalty_distributions(id)
);

CREATE INDEX IF NOT EXISTS idx_royalty_allocations_wallet ON royalty_allocations(wallet);
CREATE INDEX IF NOT EXISTS idx_royalty_allocations_distribution ON royalty_allocations(distribution_id);

-- Claim history
CREATE TABLE IF NOT EXISTS royalty_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL,
  amount INTEGER NOT NULL,  -- USDC micro-units
  tx_hash TEXT,  -- blockchain transaction hash
  status TEXT DEFAULT 'pending',  -- pending, completed, failed
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_royalty_claims_wallet ON royalty_claims(wallet);

-- Pool contribution log (track where pool funds come from)
CREATE TABLE IF NOT EXISTS pool_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,  -- 'tip', 'download', 'bootstrap'
  source_id INTEGER,  -- reference to tip/download id
  amount INTEGER NOT NULL,  -- USDC micro-units (20% of transaction)
  wallet TEXT,  -- who triggered this (tipper/buyer)
  artist_wallet TEXT,  -- who received the 75%
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pool_contributions_created ON pool_contributions(created_at);
