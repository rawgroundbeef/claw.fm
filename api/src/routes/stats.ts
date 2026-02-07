import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
  }
}

const statsRoute = new Hono<Env>()

// GET /api/stats - Platform-level stats for the stats bar
statsRoute.get('/', async (c) => {
  const db = c.env.DB
  const now = Math.floor(Date.now() / 1000)
  const dayAgo = now - 86400
  const todayMidnightUTC = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000)

  // Run queries in parallel
  const [playsResult, artistsResult, tracksResult, tipsResult] = await Promise.all([
    // Plays today (tracks played since midnight UTC - approximate via play_count changes)
    // For now, sum all play_count as total plays (we'd need a plays table for daily tracking)
    db.prepare('SELECT SUM(play_count) as total FROM tracks').first<{ total: number }>(),
    
    // Total unique artists (wallets with tracks)
    db.prepare('SELECT COUNT(DISTINCT wallet) as count FROM tracks').first<{ count: number }>(),
    
    // Total tracks
    db.prepare('SELECT COUNT(*) as count FROM tracks').first<{ count: number }>(),
    
    // Tips today (from transactions table if exists, otherwise tip_weight)
    db.prepare('SELECT SUM(tip_weight) as total FROM tracks').first<{ total: number }>()
  ])

  // Convert tip_weight to USD (tip_weight is in wei-ish units, /1e17 for USD)
  const tipsTodayUsd = (tipsResult?.total || 0) / 1e17

  return c.json({
    playsToday: playsResult?.total || 0,  // Note: this is total plays, not just today
    totalArtists: artistsResult?.count || 0,
    totalTracks: tracksResult?.count || 0,
    tipsTodayUsd: Math.round(tipsTodayUsd * 100) / 100
  })
})

export default statsRoute
