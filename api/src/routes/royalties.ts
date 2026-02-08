import { Hono } from 'hono'
import { verifyPayment } from '../middleware/x402'
import { sendUsdc } from '../lib/usdc-transfer'

type Env = {
  Bindings: {
    DB: D1Database
    PLATFORM_WALLET: string
    PLATFORM_WALLET_PRIVATE_KEY?: string  // Required for real withdrawals
  }
}

const royaltiesRoute = new Hono<Env>()

// Engagement point weights
const POINTS = {
  play: 1,
  like: 3,
  comment: 5,
  tip_received: 10,
}

// GET /api/royalties - Get your royalty balance and stats (artists only)
royaltiesRoute.get('/', async (c) => {
  const walletAddress = c.req.header('X-Wallet-Address')
  if (!walletAddress) {
    return c.json({ error: 'X-Wallet-Address header required' }, 400)
  }

  const db = c.env.DB

  // Check if wallet has submitted tracks (is an artist)
  const trackCount = await db.prepare(
    'SELECT COUNT(*) as count FROM tracks WHERE wallet = ?'
  ).bind(walletAddress).first<{ count: number }>()

  const isArtist = trackCount && trackCount.count > 0

  if (!isArtist) {
    return c.json({
      isArtist: false,
      claimable: 0,
      lifetime: 0,
      lastClaim: null,
      message: 'Submit your first track to become an artist and start earning royalties!'
    })
  }

  // Get artist profile with claimable balance
  const profile = await db.prepare(`
    SELECT claimable_balance, lifetime_royalties, last_claim_at
    FROM artist_profiles 
    WHERE wallet = ?
  `).bind(walletAddress).first<{
    claimable_balance: number
    lifetime_royalties: number
    last_claim_at: number | null
  }>()

  if (!profile) {
    return c.json({
      isArtist: true,
      claimable: 0,
      lifetime: 0,
      lastClaim: null,
      message: 'Create a profile to track your royalties!'
    })
  }

  // Get pool info
  const pool = await db.prepare('SELECT balance, last_distribution_at FROM royalty_pool WHERE id = 1').first<{
    balance: number
    last_distribution_at: number | null
  }>()

  // Get recent allocations for this wallet
  const recentAllocations = await db.prepare(`
    SELECT ra.amount, ra.points, ra.plays, ra.likes, ra.comments, ra.tips_received, rd.period_end
    FROM royalty_allocations ra
    JOIN royalty_distributions rd ON ra.distribution_id = rd.id
    WHERE ra.wallet = ?
    ORDER BY rd.period_end DESC
    LIMIT 7
  `).bind(walletAddress).all()

  // Calculate next distribution time (next midnight UTC)
  const now = Math.floor(Date.now() / 1000)
  const todayMidnight = now - (now % 86400)
  const nextDistribution = todayMidnight + 86400

  return c.json({
    isArtist: true,
    claimable: (profile.claimable_balance || 0) / 1_000_000, // Convert to USDC
    lifetime: (profile.lifetime_royalties || 0) / 1_000_000,
    lastClaim: profile.last_claim_at,
    pool: {
      balance: (pool?.balance || 0) / 1_000_000,
      lastDistribution: pool?.last_distribution_at,
      nextDistribution,
    },
    recentAllocations: (recentAllocations.results || []).map(a => ({
      amount: (a.amount as number) / 1_000_000,
      points: a.points,
      breakdown: {
        plays: a.plays,
        likes: a.likes,
        comments: a.comments,
        tipsReceived: a.tips_received,
      },
      periodEnd: a.period_end,
    })),
  })
})

// GET /api/royalties/pool - Public pool stats
royaltiesRoute.get('/pool', async (c) => {
  try {
    const db = c.env.DB

    const pool = await db.prepare(`
    SELECT balance, total_distributed, last_distribution_at
    FROM royalty_pool WHERE id = 1
  `).first<{
    balance: number
    total_distributed: number
    last_distribution_at: number | null
  }>()

  // Get recent distributions
  const distributions = await db.prepare(`
    SELECT pool_amount, total_points, artist_count, created_at
    FROM royalty_distributions
    ORDER BY created_at DESC
    LIMIT 7
  `).all()

  // Get top earners this week
  const weekAgo = Math.floor(Date.now() / 1000) - 604800
  const topEarners = await db.prepare(`
    SELECT ra.wallet, ap.username, ap.display_name, SUM(ra.amount) as total_earned
    FROM royalty_allocations ra
    JOIN royalty_distributions rd ON ra.distribution_id = rd.id
    LEFT JOIN artist_profiles ap ON ra.wallet = ap.wallet
    WHERE rd.period_end > ?
    GROUP BY ra.wallet
    ORDER BY total_earned DESC
    LIMIT 10
  `).bind(weekAgo).all()

  // Total unique artists who've earned
  const artistCount = await db.prepare(`
    SELECT COUNT(DISTINCT wallet) as count FROM royalty_allocations
  `).first<{ count: number }>()

  const now = Math.floor(Date.now() / 1000)
  const todayMidnight = now - (now % 86400)
  const nextDistribution = todayMidnight + 86400

  return c.json({
    pool: {
      current: (pool?.balance || 0) / 1_000_000,
      totalDistributed: (pool?.total_distributed || 0) / 1_000_000,
      lastDistribution: pool?.last_distribution_at,
      nextDistribution,
    },
    stats: {
      totalArtists: artistCount?.count || 0,
    },
    recentDistributions: (distributions.results || []).map(d => ({
      amount: (d.pool_amount as number) / 1_000_000,
      totalPoints: d.total_points,
      artistCount: d.artist_count,
      date: d.created_at,
    })),
    topEarners: (topEarners.results || []).map(e => ({
      wallet: e.wallet,
      username: e.username,
      displayName: e.display_name || e.username,
      earned: (e.total_earned as number) / 1_000_000,
    })),
    economics: {
      artistDirect: '75%',
      royaltyPool: '20%',
      platform: '5%',
      distribution: 'Daily at midnight UTC',
      weights: POINTS,
    },
    })
  } catch (error) {
    console.error('Pool stats error:', error)
    return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch pool stats' }, 500)
  }
})

// POST /api/royalties/claim - Claim your royalties (artists only, costs $0.01 to verify wallet)
royaltiesRoute.post('/claim', async (c) => {
  // x402 payment of $0.01 to verify wallet ownership + cover gas
  const paymentResult = await verifyPayment(c, {
    scheme: 'exact',
    network: 'base',
    maxAmountRequired: '10000', // $0.01 USDC (6 decimals)
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    resource: '/api/royalties/claim',
    description: 'Royalty claim fee ($0.01)',
    payTo: c.env.PLATFORM_WALLET,
  })

  if (!paymentResult.valid) {
    return paymentResult.error!
  }
  const walletAddress = paymentResult.walletAddress!

  const db = c.env.DB
  const minimumClaim = 1_000_000 // $1 minimum in micro-units

  // Check if wallet has submitted tracks (is an artist)
  const trackCount = await db.prepare(
    'SELECT COUNT(*) as count FROM tracks WHERE wallet = ?'
  ).bind(walletAddress).first<{ count: number }>()

  if (!trackCount || trackCount.count === 0) {
    return c.json({ 
      error: 'NOT_AN_ARTIST', 
      message: 'Only artists with submitted tracks can claim royalties. Submit your first track to become an artist!'
    }, 403)
  }

  // Get claimable balance
  const profile = await db.prepare(`
    SELECT claimable_balance, last_claim_at
    FROM artist_profiles 
    WHERE wallet = ?
  `).bind(walletAddress).first<{
    claimable_balance: number
    last_claim_at: number | null
  }>()

  if (!profile) {
    return c.json({ error: 'NO_PROFILE', message: 'No profile found. Create a profile first!' }, 400)
  }

  if (!profile.claimable_balance || profile.claimable_balance < minimumClaim) {
    return c.json({ 
      error: 'MINIMUM_NOT_MET', 
      message: `Minimum claim is $1.00. You have $${((profile.claimable_balance || 0) / 1_000_000).toFixed(2)} claimable.`,
      claimable: (profile.claimable_balance || 0) / 1_000_000,
      minimum: 1.00,
    }, 400)
  }

  // Rate limit: one claim per hour
  const now = Math.floor(Date.now() / 1000)
  if (profile.last_claim_at && (now - profile.last_claim_at) < 3600) {
    const waitTime = 3600 - (now - profile.last_claim_at)
    return c.json({ 
      error: 'RATE_LIMITED', 
      message: `Please wait ${Math.ceil(waitTime / 60)} minutes before claiming again`,
      retryAfterSeconds: waitTime,
    }, 429)
  }

  const claimAmount = profile.claimable_balance

  // Create claim record
  const claimResult = await db.prepare(`
    INSERT INTO royalty_claims (wallet, amount, status, created_at)
    VALUES (?, ?, 'pending', ?)
  `).bind(walletAddress, claimAmount, now).run()

  const claimId = claimResult.meta.last_row_id

  // Check if platform wallet private key is configured
  const platformPrivateKey = c.env.PLATFORM_WALLET_PRIVATE_KEY
  if (!platformPrivateKey) {
    return c.json({
      error: 'PAYOUT_NOT_CONFIGURED',
      message: 'Payouts are not yet configured. Please contact support.',
    }, 503)
  }

  // Zero out claimable balance BEFORE sending (prevents double-spend)
  await db.prepare(`
    UPDATE artist_profiles 
    SET claimable_balance = 0, last_claim_at = ?
    WHERE wallet = ?
  `).bind(now, walletAddress).run()

  // Send USDC to artist wallet
  const transferResult = await sendUsdc(platformPrivateKey, walletAddress, claimAmount)

  if (!transferResult.success) {
    // Restore balance on failure
    await db.prepare(`
      UPDATE artist_profiles 
      SET claimable_balance = claimable_balance + ?
      WHERE wallet = ?
    `).bind(claimAmount, walletAddress).run()

    // Update claim record as failed
    await db.prepare(`
      UPDATE royalty_claims SET status = 'failed' WHERE id = ?
    `).bind(claimId).run()

    return c.json({
      error: 'TRANSFER_FAILED',
      message: `Failed to send USDC: ${transferResult.error}`,
      claimId,
    }, 500)
  }

  // Update claim record with tx hash
  await db.prepare(`
    UPDATE royalty_claims 
    SET status = 'completed', tx_hash = ?, completed_at = ?
    WHERE id = ?
  `).bind(transferResult.txHash, now, claimId).run()

  return c.json({
    success: true,
    claimId,
    amount: claimAmount / 1_000_000,
    txHash: transferResult.txHash,
    message: `Sent $${(claimAmount / 1_000_000).toFixed(2)} USDC to your wallet!`,
    status: 'completed',
  })
})

// POST /api/royalties/distribute - Trigger distribution (admin/cron only)
royaltiesRoute.post('/distribute', async (c) => {
  // Simple auth for now - should be cron job or admin-only
  const secret = c.req.header('X-Admin-Secret')
  if (secret !== 'distribute-royalties-2026') {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const db = c.env.DB
  const now = Math.floor(Date.now() / 1000)
  const periodEnd = now
  const periodStart = now - 86400 // Last 24 hours

  // Get pool balance
  const pool = await db.prepare('SELECT balance FROM royalty_pool WHERE id = 1').first<{ balance: number }>()
  const poolBalance = pool?.balance || 0

  if (poolBalance === 0) {
    return c.json({ message: 'Pool is empty, nothing to distribute', distributed: 0 })
  }

  // Calculate engagement points for each artist in the period
  // Points = plays + (likes * 3) + (comments * 5) + (tips_received * 10)
  const engagementQuery = await db.prepare(`
    WITH artist_plays AS (
      SELECT wallet, SUM(play_count) as plays
      FROM tracks
      WHERE created_at >= ? OR created_at IS NOT NULL
      GROUP BY wallet
    ),
    artist_likes AS (
      SELECT t.wallet, COUNT(*) as likes
      FROM track_likes tl
      JOIN tracks t ON tl.track_id = t.id
      WHERE tl.created_at >= ?
      GROUP BY t.wallet
    ),
    artist_comments AS (
      SELECT t.wallet, COUNT(*) as comments
      FROM track_comments tc
      JOIN tracks t ON tc.track_id = t.id
      WHERE tc.created_at >= ?
      GROUP BY t.wallet
    ),
    artist_tips AS (
      SELECT artist_wallet as wallet, COUNT(*) as tips_count
      FROM pool_contributions
      WHERE source_type = 'tip' AND created_at >= ?
      GROUP BY artist_wallet
    )
    SELECT 
      ap.wallet,
      COALESCE(apl.plays, 0) as plays,
      COALESCE(al.likes, 0) as likes,
      COALESCE(ac.comments, 0) as comments,
      COALESCE(at.tips_count, 0) as tips_received,
      (COALESCE(apl.plays, 0) * ${POINTS.play} + 
       COALESCE(al.likes, 0) * ${POINTS.like} + 
       COALESCE(ac.comments, 0) * ${POINTS.comment} + 
       COALESCE(at.tips_count, 0) * ${POINTS.tip_received}) as total_points
    FROM artist_profiles ap
    LEFT JOIN artist_plays apl ON ap.wallet = apl.wallet
    LEFT JOIN artist_likes al ON ap.wallet = al.wallet
    LEFT JOIN artist_comments ac ON ap.wallet = ac.wallet
    LEFT JOIN artist_tips at ON ap.wallet = at.wallet
    WHERE (COALESCE(apl.plays, 0) + COALESCE(al.likes, 0) + COALESCE(ac.comments, 0) + COALESCE(at.tips_count, 0)) > 0
  `).bind(periodStart, periodStart, periodStart, periodStart).all()

  const artists = engagementQuery.results || []
  
  if (artists.length === 0) {
    return c.json({ message: 'No engagement in this period', distributed: 0 })
  }

  const totalPoints = artists.reduce((sum, a) => sum + (a.total_points as number), 0)

  // Create distribution record
  const distResult = await db.prepare(`
    INSERT INTO royalty_distributions (period_start, period_end, pool_amount, total_points, artist_count)
    VALUES (?, ?, ?, ?, ?)
  `).bind(periodStart, periodEnd, poolBalance, totalPoints, artists.length).run()

  const distributionId = distResult.meta.last_row_id

  // Allocate to each artist
  for (const artist of artists) {
    const points = artist.total_points as number
    const share = points / totalPoints
    const amount = Math.floor(poolBalance * share)

    if (amount > 0) {
      // Record allocation
      await db.prepare(`
        INSERT INTO royalty_allocations 
        (distribution_id, wallet, points, amount, plays, likes, comments, tips_received)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        distributionId,
        artist.wallet,
        points,
        amount,
        artist.plays,
        artist.likes,
        artist.comments,
        artist.tips_received
      ).run()

      // Add to claimable balance
      await db.prepare(`
        UPDATE artist_profiles 
        SET claimable_balance = claimable_balance + ?,
            lifetime_royalties = lifetime_royalties + ?
        WHERE wallet = ?
      `).bind(amount, amount, artist.wallet).run()
    }
  }

  // Zero out pool and update stats
  await db.prepare(`
    UPDATE royalty_pool 
    SET balance = 0, 
        total_distributed = total_distributed + ?,
        last_distribution_at = ?,
        updated_at = ?
    WHERE id = 1
  `).bind(poolBalance, now, now).run()

  return c.json({
    success: true,
    distributed: poolBalance / 1_000_000,
    artistCount: artists.length,
    totalPoints,
    distributionId,
  })
})

export default royaltiesRoute
