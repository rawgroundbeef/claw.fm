import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
  }
}

const poolRoute = new Hono<Env>()

// Helper: get next Sunday 00:00 UTC
function getNextSnapshotTime(): number {
  const now = new Date()
  const dayOfWeek = now.getUTCDay()
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek
  const nextSunday = new Date(now)
  nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday)
  nextSunday.setUTCHours(0, 0, 0, 0)
  return Math.floor(nextSunday.getTime() / 1000)
}

// Helper: get current week start (last Sunday 00:00 UTC)
function getCurrentWeekStart(): number {
  const now = new Date()
  const dayOfWeek = now.getUTCDay()
  const lastSunday = new Date(now)
  lastSunday.setUTCDate(now.getUTCDate() - dayOfWeek)
  lastSunday.setUTCHours(0, 0, 0, 0)
  return Math.floor(lastSunday.getTime() / 1000)
}

// GET /api/pool - Pool status and user's claimable amount
poolRoute.get('/', async (c) => {
  const walletAddress = c.req.header('X-Wallet-Address')
  const db = c.env.DB

  // Get pool balance
  const pool = await db.prepare(
    'SELECT balance_usdc, total_distributed_usdc, contribution_rate, last_snapshot_at FROM royalty_pool WHERE id = 1'
  ).first<{ balance_usdc: number; total_distributed_usdc: number; contribution_rate: number; last_snapshot_at: number | null }>()

  const balanceUsd = (pool?.balance_usdc || 0) / 1_000_000
  const totalDistributedUsd = (pool?.total_distributed_usdc || 0) / 1_000_000
  const contributionRate = pool?.contribution_rate || 15

  // Get artist count (unique wallets with claims or shares)
  const artistCount = await db.prepare(
    'SELECT COUNT(DISTINCT wallet) as count FROM pool_shares'
  ).first<{ count: number }>()

  // Calculate next snapshot time
  const nextSnapshotAt = getNextSnapshotTime()
  const currentWeekStart = getCurrentWeekStart()

  // Get user's claimable amount if wallet provided
  let claimableUsd = 0
  let userPlays = 0
  let userShareBps = 0

  if (walletAddress) {
    // Sum unclaimed shares
    const unclaimed = await db.prepare(`
      SELECT COALESCE(SUM(ps.amount_usdc), 0) as total
      FROM pool_shares ps
      LEFT JOIN pool_claims pc ON ps.snapshot_id = pc.snapshot_id AND ps.wallet = pc.wallet
      WHERE ps.wallet = ? AND pc.id IS NULL
    `).bind(walletAddress).first<{ total: number }>()

    claimableUsd = (unclaimed?.total || 0) / 1_000_000

    // Get current week plays for this wallet
    const weekPlays = await db.prepare(`
      SELECT COALESCE(SUM(play_count), 0) as plays
      FROM tracks
      WHERE wallet = ?
    `).bind(walletAddress).first<{ plays: number }>()

    userPlays = weekPlays?.plays || 0

    // Get total plays to calculate share
    const totalPlays = await db.prepare(
      'SELECT COALESCE(SUM(play_count), 0) as total FROM tracks'
    ).first<{ total: number }>()

    if (totalPlays?.total && totalPlays.total > 0) {
      userShareBps = Math.floor((userPlays / totalPlays.total) * 10000)
    }
  }

  return c.json({
    pool: {
      balanceUsd: Math.round(balanceUsd * 100) / 100,
      totalDistributedUsd: Math.round(totalDistributedUsd * 100) / 100,
      contributionRate,
      artistsPaid: artistCount?.count || 0,
      nextSnapshotAt,
      nextSnapshotAtIso: new Date(nextSnapshotAt * 1000).toISOString()
    },
    user: walletAddress ? {
      claimableUsd: Math.round(claimableUsd * 100) / 100,
      currentPlays: userPlays,
      currentShareBps: userShareBps,
      currentSharePercent: Math.round(userShareBps / 100 * 100) / 100
    } : null
  })
})

// GET /api/pool/leaderboard - Top artists by plays this period
poolRoute.get('/leaderboard', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 50)
  const walletAddress = c.req.header('X-Wallet-Address')
  const db = c.env.DB

  // Get pool balance for estimated payout calculation
  const pool = await db.prepare(
    'SELECT balance_usdc FROM royalty_pool WHERE id = 1'
  ).first<{ balance_usdc: number }>()

  const poolBalance = pool?.balance_usdc || 0

  // Get total plays
  const totalPlaysResult = await db.prepare(
    'SELECT COALESCE(SUM(play_count), 0) as total FROM tracks'
  ).first<{ total: number }>()

  const totalPlays = totalPlaysResult?.total || 1

  // Get top artists by play count
  const result = await db.prepare(`
    SELECT 
      t.wallet,
      COALESCE(SUM(t.play_count), 0) as plays,
      ap.username,
      ap.display_name,
      ap.avatar_url
    FROM tracks t
    LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
    GROUP BY t.wallet
    ORDER BY plays DESC
    LIMIT ?
  `).bind(limit).all()

  const leaders = (result.results || []).map((row, i) => {
    const plays = row.plays as number
    const shareBps = Math.floor((plays / totalPlays) * 10000)
    const estimatedPayout = (poolBalance * shareBps / 10000) / 1_000_000

    return {
      rank: i + 1,
      wallet: row.wallet,
      handle: row.username || null,
      displayName: row.display_name || row.username || `${(row.wallet as string).slice(0, 6)}...`,
      avatarUrl: row.avatar_url ? `/audio/${row.avatar_url}` : null,
      plays,
      shareBps,
      sharePercent: Math.round(shareBps / 100 * 100) / 100,
      estimatedPayoutUsd: Math.round(estimatedPayout * 100) / 100
    }
  })

  // Find user's rank if wallet provided
  let userRank = null
  if (walletAddress) {
    const userResult = await db.prepare(`
      SELECT COUNT(*) + 1 as rank
      FROM (
        SELECT wallet, SUM(play_count) as plays
        FROM tracks
        GROUP BY wallet
      ) t
      WHERE t.plays > (
        SELECT COALESCE(SUM(play_count), 0)
        FROM tracks
        WHERE wallet = ?
      )
    `).bind(walletAddress).first<{ rank: number }>()

    userRank = userResult?.rank || null
  }

  return c.json({
    leaderboard: leaders,
    totalPlays,
    poolBalanceUsd: Math.round(poolBalance / 1_000_000 * 100) / 100,
    userRank,
    periodEndsAt: getNextSnapshotTime()
  })
})

// GET /api/pool/history - User's claim history
poolRoute.get('/history', async (c) => {
  const walletAddress = c.req.header('X-Wallet-Address')
  if (!walletAddress) {
    return c.json({ error: 'UNAUTHORIZED', message: 'X-Wallet-Address header required' }, 401)
  }

  const db = c.env.DB
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)

  const result = await db.prepare(`
    SELECT 
      pc.amount_usdc,
      pc.tx_hash,
      pc.claimed_at,
      ps.week_start,
      ps.week_end,
      ps.plays
    FROM pool_claims pc
    JOIN pool_snapshots ps ON pc.snapshot_id = ps.id
    JOIN pool_shares psh ON pc.snapshot_id = psh.snapshot_id AND pc.wallet = psh.wallet
    WHERE pc.wallet = ?
    ORDER BY pc.claimed_at DESC
    LIMIT ?
  `).bind(walletAddress, limit).all()

  const claims = (result.results || []).map((row) => ({
    amountUsd: (row.amount_usdc as number) / 1_000_000,
    txHash: row.tx_hash,
    claimedAt: row.claimed_at,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    plays: row.plays
  }))

  return c.json({ claims })
})

// POST /api/pool/claim - Claim available royalties
poolRoute.post('/claim', async (c) => {
  const walletAddress = c.req.header('X-Wallet-Address')
  if (!walletAddress) {
    return c.json({ error: 'UNAUTHORIZED', message: 'X-Wallet-Address header required' }, 401)
  }

  const db = c.env.DB

  // Get all unclaimed shares for this wallet
  const unclaimed = await db.prepare(`
    SELECT ps.id as share_id, ps.snapshot_id, ps.amount_usdc
    FROM pool_shares ps
    LEFT JOIN pool_claims pc ON ps.snapshot_id = pc.snapshot_id AND ps.wallet = pc.wallet
    WHERE ps.wallet = ? AND pc.id IS NULL AND ps.amount_usdc > 0
  `).bind(walletAddress).all()

  const shares = unclaimed.results || []

  if (shares.length === 0) {
    return c.json({ 
      error: 'NOTHING_TO_CLAIM', 
      message: 'No unclaimed royalties available' 
    }, 400)
  }

  // Calculate total claimable
  const totalMicroUsdc = shares.reduce((sum, s) => sum + (s.amount_usdc as number), 0)
  const totalUsd = totalMicroUsdc / 1_000_000

  // For v1, we'll just record the claim and return success
  // In production, this would trigger an actual USDC transfer
  const now = Math.floor(Date.now() / 1000)

  // Insert claim records
  for (const share of shares) {
    await db.prepare(`
      INSERT INTO pool_claims (wallet, snapshot_id, amount_usdc, claimed_at)
      VALUES (?, ?, ?, ?)
    `).bind(walletAddress, share.snapshot_id, share.amount_usdc, now).run()
  }

  // Deduct from pool balance
  await db.prepare(`
    UPDATE royalty_pool 
    SET balance_usdc = balance_usdc - ?,
        total_distributed_usdc = total_distributed_usdc + ?
    WHERE id = 1
  `).bind(totalMicroUsdc, totalMicroUsdc).run()

  return c.json({
    success: true,
    claimed: {
      amountUsd: Math.round(totalUsd * 100) / 100,
      amountMicroUsdc: totalMicroUsdc,
      snapshotsClaimed: shares.length
    },
    message: `Successfully claimed $${totalUsd.toFixed(2)} in royalties!`,
    // In production, include tx_hash here
    note: 'v1: Claim recorded. USDC transfer will be processed.'
  })
})

// POST /api/pool/contribute - Manual contribution to pool (for testing/donations)
poolRoute.post('/contribute', async (c) => {
  const body = await c.req.json<{ amountUsd: number; source?: string }>()
  
  if (!body.amountUsd || body.amountUsd <= 0) {
    return c.json({ error: 'INVALID_AMOUNT', message: 'amountUsd must be positive' }, 400)
  }

  const db = c.env.DB
  const microUsdc = Math.floor(body.amountUsd * 1_000_000)

  await db.prepare(`
    UPDATE royalty_pool SET balance_usdc = balance_usdc + ? WHERE id = 1
  `).bind(microUsdc).run()

  await db.prepare(`
    INSERT INTO pool_contributions (source_type, amount_usdc)
    VALUES (?, ?)
  `).bind(body.source || 'manual', microUsdc).run()

  return c.json({
    success: true,
    contributed: {
      amountUsd: body.amountUsd,
      source: body.source || 'manual'
    }
  })
})

// POST /api/pool/snapshot - Trigger weekly snapshot (admin/cron)
poolRoute.post('/snapshot', async (c) => {
  // In production, add admin auth here
  const db = c.env.DB

  const weekStart = getCurrentWeekStart()
  const weekEnd = getNextSnapshotTime()

  // Check if snapshot already exists for this week
  const existing = await db.prepare(
    'SELECT id FROM pool_snapshots WHERE week_start = ?'
  ).bind(weekStart).first()

  if (existing) {
    return c.json({ error: 'SNAPSHOT_EXISTS', message: 'Snapshot already exists for this week' }, 400)
  }

  // Get pool balance
  const pool = await db.prepare(
    'SELECT balance_usdc FROM royalty_pool WHERE id = 1'
  ).first<{ balance_usdc: number }>()

  const poolBalance = pool?.balance_usdc || 0

  if (poolBalance === 0) {
    return c.json({ error: 'EMPTY_POOL', message: 'Pool has no balance to distribute' }, 400)
  }

  // Get total plays and plays by artist
  const playsResult = await db.prepare(`
    SELECT wallet, COALESCE(SUM(play_count), 0) as plays
    FROM tracks
    GROUP BY wallet
    HAVING plays > 0
    ORDER BY plays DESC
  `).all()

  const artists = playsResult.results || []
  const totalPlays = artists.reduce((sum, a) => sum + (a.plays as number), 0)

  if (totalPlays === 0) {
    return c.json({ error: 'NO_PLAYS', message: 'No plays recorded this period' }, 400)
  }

  // Create snapshot
  const snapshotResult = await db.prepare(`
    INSERT INTO pool_snapshots (week_start, week_end, total_plays, pool_amount_usdc, finalized_at)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `).bind(weekStart, weekEnd, totalPlays, poolBalance, Math.floor(Date.now() / 1000)).first<{ id: number }>()

  const snapshotId = snapshotResult!.id

  // Create shares for each artist
  let sharesCreated = 0
  for (const artist of artists) {
    const plays = artist.plays as number
    const shareBps = Math.floor((plays / totalPlays) * 10000)
    const amountUsdc = Math.floor(poolBalance * shareBps / 10000)

    if (amountUsdc > 0) {
      await db.prepare(`
        INSERT INTO pool_shares (snapshot_id, wallet, plays, share_bps, amount_usdc)
        VALUES (?, ?, ?, ?, ?)
      `).bind(snapshotId, artist.wallet, plays, shareBps, amountUsdc).run()
      sharesCreated++
    }
  }

  // Update last snapshot time
  await db.prepare(`
    UPDATE royalty_pool SET last_snapshot_at = ? WHERE id = 1
  `).bind(Math.floor(Date.now() / 1000)).run()

  return c.json({
    success: true,
    snapshot: {
      id: snapshotId,
      weekStart,
      weekEnd,
      totalPlays,
      poolAmountUsd: poolBalance / 1_000_000,
      artistsIncluded: sharesCreated
    }
  })
})

export default poolRoute
