-- Royalty Pool: shared earnings distributed based on play count
-- Funded by % of tips and purchases, claimed by artists

-- Main pool balance tracker
CREATE TABLE IF NOT EXISTS royalty_pool (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- Singleton row
  balance_usdc INTEGER NOT NULL DEFAULT 0,  -- Balance in micro-USDC (6 decimals)
  total_distributed_usdc INTEGER NOT NULL DEFAULT 0,  -- All-time distributed
  contribution_rate INTEGER NOT NULL DEFAULT 15,  -- % of tips/purchases that go to pool
  last_snapshot_at INTEGER,  -- Last weekly snapshot timestamp
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Initialize singleton row
INSERT OR IGNORE INTO royalty_pool (id, balance_usdc) VALUES (1, 0);

-- Weekly snapshots capture play counts and calculate shares
CREATE TABLE IF NOT EXISTS pool_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start INTEGER NOT NULL,  -- Unix timestamp of week start (Sunday 00:00 UTC)
  week_end INTEGER NOT NULL,    -- Unix timestamp of week end
  total_plays INTEGER NOT NULL,
  pool_amount_usdc INTEGER NOT NULL,  -- Amount available for this snapshot
  merkle_root TEXT,  -- Optional: for on-chain verification
  finalized_at INTEGER,  -- When snapshot was finalized
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_pool_snapshots_week ON pool_snapshots(week_start);

-- Individual artist shares per snapshot
CREATE TABLE IF NOT EXISTS pool_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES pool_snapshots(id),
  wallet TEXT NOT NULL,
  plays INTEGER NOT NULL,
  share_bps INTEGER NOT NULL,  -- Basis points (10000 = 100%)
  amount_usdc INTEGER NOT NULL,  -- Claimable amount in micro-USDC
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_pool_shares_snapshot ON pool_shares(snapshot_id);
CREATE INDEX idx_pool_shares_wallet ON pool_shares(wallet);
CREATE UNIQUE INDEX idx_pool_shares_unique ON pool_shares(snapshot_id, wallet);

-- Claim records
CREATE TABLE IF NOT EXISTS pool_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL REFERENCES pool_snapshots(id),
  amount_usdc INTEGER NOT NULL,
  tx_hash TEXT,  -- On-chain transaction hash if applicable
  claimed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_pool_claims_wallet ON pool_claims(wallet);
CREATE INDEX idx_pool_claims_snapshot ON pool_claims(snapshot_id);
CREATE UNIQUE INDEX idx_pool_claims_unique ON pool_claims(snapshot_id, wallet);

-- Pool contributions log (for transparency)
CREATE TABLE IF NOT EXISTS pool_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,  -- 'tip' or 'purchase'
  source_id INTEGER,  -- Reference to original transaction
  amount_usdc INTEGER NOT NULL,  -- Amount contributed to pool
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_pool_contributions_created ON pool_contributions(created_at);
