import { Hono } from 'hono'
import type { LikeToggleResponse } from '@claw/shared'

type Env = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
  }
}

const likesRoute = new Hono<Env>()

const prefixPath = (path: string | null) => {
  if (!path) return null
  if (path.startsWith('data:') || path.startsWith('http')) return path
  return `/audio/${path}`
}

// Rate limit: 30 actions per minute per wallet
const RATE_LIMIT_WINDOW = 60 // seconds
const RATE_LIMIT_MAX = 30

async function checkRateLimit(kv: KVNamespace, wallet: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `likes:ratelimit:${wallet}`
  const current = await kv.get(key)
  const count = current ? parseInt(current, 10) : 0

  if (count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }

  await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW })
  return { allowed: true, remaining: RATE_LIMIT_MAX - count - 1 }
}

// GET /api/likes/:walletAddress - Get all tracks liked by a user
likesRoute.get('/wallet/:walletAddress', async (c) => {
  const walletAddress = c.req.param('walletAddress')
  if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    return c.json({ error: 'INVALID_WALLET', message: 'Invalid wallet address' }, 400)
  }

  const db = c.env.DB

  // Get all tracks liked by this wallet with track details
  const result = await db.prepare(`
    SELECT
      t.id,
      t.title,
      t.slug,
      t.wallet as artist_wallet,
      t.cover_url,
      t.file_url,
      t.genre,
      t.duration,
      t.play_count,
      t.like_count,
      t.waveform_peaks,
      l.created_at as liked_at,
      p.username as artist_username,
      p.display_name as artist_display_name,
      p.avatar_url as artist_avatar_url
    FROM likes l
    JOIN tracks t ON l.track_id = t.id
    LEFT JOIN artist_profiles p ON t.wallet = p.wallet
    WHERE l.wallet_address = ?
    ORDER BY l.created_at DESC
  `).bind(walletAddress).all()

  const tracks = (result.results || []).map((row: any) => ({
    ...row,
    cover_url: prefixPath(row.cover_url),
    file_url: prefixPath(row.file_url),
    artist_avatar_url: prefixPath(row.artist_avatar_url),
    duration_seconds: Math.floor((row.duration || 0) / 1000),
  }))

  return c.json({
    wallet: walletAddress,
    tracks,
    total: tracks.length
  }, 200)
})

// GET /api/tracks/:trackId/like - Get like status
likesRoute.get('/:trackId/like', async (c) => {
  const trackId = parseInt(c.req.param('trackId'), 10)
  if (isNaN(trackId) || trackId <= 0) {
    return c.json({ error: 'INVALID_TRACK_ID', message: 'Invalid track ID' }, 400)
  }

  const walletAddress = c.req.header('X-Wallet-Address')
  if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    return c.json({ liked: false, likeCount: 0 }, 200)
  }

  const db = c.env.DB

  // Get track like count
  const track = await db.prepare('SELECT like_count FROM tracks WHERE id = ?').bind(trackId).first<{ like_count: number }>()
  if (!track) {
    return c.json({ liked: false, likeCount: 0 }, 200)
  }

  // Check if user liked
  const existing = await db.prepare(
    'SELECT id FROM likes WHERE track_id = ? AND wallet_address = ?'
  ).bind(trackId, walletAddress).first()

  return c.json({
    liked: !!existing,
    likeCount: track.like_count || 0
  }, 200)
})

// POST /api/tracks/:trackId/like - Toggle like
likesRoute.post('/:trackId/like', async (c) => {
  const trackId = parseInt(c.req.param('trackId'), 10)
  if (isNaN(trackId) || trackId <= 0) {
    return c.json({ error: 'INVALID_TRACK_ID', message: 'Invalid track ID' }, 400)
  }

  const walletAddress = c.req.header('X-Wallet-Address')
  if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    return c.json({ error: 'INVALID_WALLET', message: 'Valid X-Wallet-Address header required' }, 400)
  }

  // Rate limit check
  const { allowed, remaining } = await checkRateLimit(c.env.KV, walletAddress)
  if (!allowed) {
    return c.json(
      { error: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' },
      429
    )
  }

  const db = c.env.DB

  // Check if track exists
  const track = await db.prepare('SELECT id, like_count FROM tracks WHERE id = ?').bind(trackId).first<{ id: number; like_count: number }>()
  if (!track) {
    return c.json({ error: 'NOT_FOUND', message: 'Track not found' }, 404)
  }

  // Check if user already liked
  const existing = await db.prepare(
    'SELECT id FROM likes WHERE track_id = ? AND wallet_address = ?'
  ).bind(trackId, walletAddress).first()

  let liked: boolean
  let newLikeCount: number

  if (existing) {
    // Unlike: delete the like and decrement count
    await db.prepare('DELETE FROM likes WHERE track_id = ? AND wallet_address = ?')
      .bind(trackId, walletAddress).run()
    await db.prepare('UPDATE tracks SET like_count = like_count - 1 WHERE id = ? AND like_count > 0')
      .bind(trackId).run()
    liked = false
    newLikeCount = Math.max(0, track.like_count - 1)
  } else {
    // Like: insert the like and increment count
    await db.prepare('INSERT INTO likes (track_id, wallet_address) VALUES (?, ?)')
      .bind(trackId, walletAddress).run()
    await db.prepare('UPDATE tracks SET like_count = like_count + 1 WHERE id = ?')
      .bind(trackId).run()
    liked = true
    newLikeCount = track.like_count + 1
  }

  const response: LikeToggleResponse = {
    success: true,
    liked,
    likeCount: newLikeCount
  }

  return c.json(response, 200, {
    'X-RateLimit-Remaining': String(remaining)
  })
})

export default likesRoute
