import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
    QUEUE_BRAIN: DurableObjectNamespace
  }
}

const discoveryRoute = new Hono<Env>()

// Helper to get currently playing track ID
async function getCurrentlyPlayingWallet(env: Env['Bindings']): Promise<string | null> {
  try {
    const queueId = env.QUEUE_BRAIN.idFromName('global-queue')
    const queueStub = env.QUEUE_BRAIN.get(queueId) as any
    const state = await queueStub.getState()
    return state?.currentTrack?.artistWallet || null
  } catch {
    return null
  }
}

// GET /api/tracks/rising - Top tracks by play count (last 24h implied by sorting)
discoveryRoute.get('/tracks/rising', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '5'), 20)
  const db = c.env.DB

  const result = await db.prepare(`
    SELECT 
      t.id,
      t.slug,
      t.title,
      t.wallet,
      t.cover_url,
      t.genre,
      t.duration,
      t.play_count,
      t.tip_weight,
      t.created_at,
      ap.username as artist_handle,
      ap.display_name as artist_name,
      ap.avatar_url as artist_avatar,
      ap.x_verified_at as artist_verified
    FROM tracks t
    LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
    ORDER BY t.play_count DESC, t.created_at DESC
    LIMIT ?
  `).bind(limit).all()

  const tracks = (result.results || []).map((t, i) => ({
    id: t.id,
    slug: t.slug || '',
    title: t.title,
    artist: {
      handle: t.artist_handle || t.wallet?.toString().slice(0, 10),
      displayName: t.artist_name || t.artist_handle || 'Unknown Artist',
      avatarUrl: t.artist_avatar ? `/audio/${t.artist_avatar}` : null,
      isVerified: !!t.artist_verified
    },
    coverUrl: t.cover_url 
      ? (t.cover_url.toString().startsWith('data:') ? t.cover_url : `/audio/${t.cover_url}`)
      : null,
    genre: t.genre || 'other',
    duration: t.duration,
    plays: t.play_count || 0,
    tipsUsd: ((t.tip_weight as number) || 0) / 1e17,
    rank: i + 1
  }))

  return c.json({ tracks })
})

// GET /api/tracks/recent - Most recently submitted tracks
discoveryRoute.get('/tracks/recent', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '7'), 20)
  const db = c.env.DB

  const result = await db.prepare(`
    SELECT 
      t.id,
      t.slug,
      t.title,
      t.wallet,
      t.cover_url,
      t.genre,
      t.duration,
      t.play_count,
      t.created_at,
      ap.username as artist_handle,
      ap.display_name as artist_name,
      ap.avatar_url as artist_avatar,
      ap.x_verified_at as artist_verified
    FROM tracks t
    LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
    ORDER BY t.created_at DESC
    LIMIT ?
  `).bind(limit).all()

  const tracks = (result.results || []).map((t) => ({
    id: t.id,
    slug: t.slug || '',
    title: t.title,
    artist: {
      handle: t.artist_handle || t.wallet?.toString().slice(0, 10),
      displayName: t.artist_name || t.artist_handle || 'Unknown Artist',
      avatarUrl: t.artist_avatar ? `/audio/${t.artist_avatar}` : null,
      isVerified: !!t.artist_verified
    },
    coverUrl: t.cover_url 
      ? (t.cover_url.toString().startsWith('data:') ? t.cover_url : `/audio/${t.cover_url}`)
      : null,
    genre: t.genre || 'other',
    duration: t.duration,
    plays: t.play_count || 0,
    submittedAt: new Date((t.created_at as number) * 1000).toISOString()
  }))

  return c.json({ tracks })
})

// GET /api/artists/verified - Verified artists with live status
discoveryRoute.get('/artists/verified', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 30)
  const db = c.env.DB

  // Get currently playing artist wallet
  const liveWallet = await getCurrentlyPlayingWallet(c.env)

  const result = await db.prepare(`
    SELECT 
      ap.wallet,
      ap.username,
      ap.display_name,
      ap.avatar_url,
      ap.x_verified_at,
      COUNT(t.id) as track_count,
      COALESCE(SUM(t.play_count), 0) as total_plays
    FROM artist_profiles ap
    LEFT JOIN tracks t ON ap.wallet = t.wallet
    WHERE ap.x_verified_at IS NOT NULL
    GROUP BY ap.wallet
    ORDER BY total_plays DESC
    LIMIT ?
  `).bind(limit).all()

  const artists = (result.results || []).map((a) => ({
    handle: a.username,
    displayName: a.display_name || a.username,
    avatarUrl: a.avatar_url ? `/audio/${a.avatar_url}` : null,
    isVerified: true,
    isLive: liveWallet?.toLowerCase() === a.wallet?.toString().toLowerCase(),
    trackCount: a.track_count || 0,
    totalPlays: a.total_plays || 0
  }))

  return c.json({ artists })
})

export default discoveryRoute
