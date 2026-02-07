import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
  }
}

const discoveryRoute = new Hono<Env>()

// GET /api/tracks/rising - Top tracks by play count
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
      ap.avatar_url as artist_avatar
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
      avatarUrl: t.artist_avatar ? `/audio/${t.artist_avatar}` : null
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
      ap.avatar_url as artist_avatar
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
      avatarUrl: t.artist_avatar ? `/audio/${t.artist_avatar}` : null
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

export default discoveryRoute
