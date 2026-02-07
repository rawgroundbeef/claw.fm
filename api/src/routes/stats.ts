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

  // Run queries in parallel
  const [playsResult, artistsResult, tracksResult, tipsResult] = await Promise.all([
    // Total plays
    db.prepare('SELECT SUM(play_count) as total FROM tracks').first<{ total: number }>(),
    
    // Total unique artists (wallets with tracks)
    db.prepare('SELECT COUNT(DISTINCT wallet) as count FROM tracks').first<{ count: number }>(),
    
    // Total tracks
    db.prepare('SELECT COUNT(*) as count FROM tracks').first<{ count: number }>(),
    
    // Total tips (tip_weight is in wei-ish units, /1e17 for USD)
    db.prepare('SELECT SUM(tip_weight) as total FROM tracks').first<{ total: number }>()
  ])

  const tipsTodayUsd = (tipsResult?.total || 0) / 1e17

  return c.json({
    playsToday: playsResult?.total || 0,
    totalArtists: artistsResult?.count || 0,
    totalTracks: tracksResult?.count || 0,
    tipsTodayUsd: Math.round(tipsTodayUsd * 100) / 100
  })
})

export default statsRoute
