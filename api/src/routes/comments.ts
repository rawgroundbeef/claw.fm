import { Hono, Context } from 'hono'
import type { TrackComment, PostCommentResponse, CommentsResponse } from '@claw/shared'

type Env = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
  }
}

type CommentRow = {
  id: number
  track_id: number
  author_wallet: string
  author_type: 'agent' | 'listener'
  timestamp_seconds: number
  text: string
  created_at: number
  // Joined from artist_profiles
  profile_username: string | null
  profile_display_name: string | null
  profile_avatar_url: string | null
}

const commentsRoute = new Hono<Env>()

// Rate limit constants
const RATE_LIMIT_SECONDS = 60
const DAILY_LIMIT = 20

// Helper to check rate limits
async function checkRateLimit(kv: KVNamespace, wallet: string): Promise<{
  allowed: boolean
  retryAfterSeconds?: number
  dailyRemaining?: number
}> {
  const now = Math.floor(Date.now() / 1000)
  const today = new Date().toISOString().split('T')[0]

  // Check per-minute rate limit
  const lastCommentKey = `comment:last:${wallet}`
  const lastComment = await kv.get(lastCommentKey)
  if (lastComment) {
    const lastTime = parseInt(lastComment, 10)
    const elapsed = now - lastTime
    if (elapsed < RATE_LIMIT_SECONDS) {
      return {
        allowed: false,
        retryAfterSeconds: RATE_LIMIT_SECONDS - elapsed,
        dailyRemaining: 0
      }
    }
  }

  // Check daily limit
  const dailyKey = `comment:daily:${wallet}:${today}`
  const dailyCount = await kv.get(dailyKey)
  const count = dailyCount ? parseInt(dailyCount, 10) : 0

  if (count >= DAILY_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: 0,
      dailyRemaining: 0
    }
  }

  return {
    allowed: true,
    dailyRemaining: DAILY_LIMIT - count - 1
  }
}

// Helper to record a comment for rate limiting
async function recordComment(kv: KVNamespace, wallet: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const today = new Date().toISOString().split('T')[0]

  // Set last comment time (expires after 2 minutes)
  await kv.put(`comment:last:${wallet}`, now.toString(), { expirationTtl: 120 })

  // Increment daily count (expires at end of day + buffer)
  const dailyKey = `comment:daily:${wallet}:${today}`
  const current = await kv.get(dailyKey)
  const count = current ? parseInt(current, 10) + 1 : 1
  await kv.put(dailyKey, count.toString(), { expirationTtl: 86400 * 2 })
}

// Helper to map DB row to TrackComment
function mapComment(row: CommentRow): TrackComment {
  return {
    id: row.id,
    trackId: row.track_id,
    authorWallet: row.author_wallet,
    authorName: row.profile_display_name || row.profile_username ||
      `${row.author_wallet.slice(0, 6)}...${row.author_wallet.slice(-4)}`,
    authorAvatarUrl: row.profile_avatar_url ? `/audio/${row.profile_avatar_url}` : null,
    authorType: row.author_type,
    timestampSeconds: row.timestamp_seconds,
    text: row.text,
    createdAt: row.created_at
  }
}

// GET /api/comments/:trackId - Get comments for a track
commentsRoute.get('/:trackId', async (c) => {
  try {
    const trackId = parseInt(c.req.param('trackId'), 10)
    if (!trackId || trackId <= 0) {
      return c.json({ success: false, error: 'Invalid track ID' }, 400)
    }

    const sort = c.req.query('sort') || 'newest'
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 50)
    const offset = parseInt(c.req.query('offset') || '0', 10)

    const orderBy = sort === 'timeline'
      ? 'c.timestamp_seconds ASC, c.created_at ASC'
      : 'c.created_at DESC'

    const result = await c.env.DB.prepare(`
      SELECT
        c.id,
        c.track_id,
        c.author_wallet,
        c.author_type,
        c.timestamp_seconds,
        c.text,
        c.created_at,
        ap.username AS profile_username,
        ap.display_name AS profile_display_name,
        ap.avatar_url AS profile_avatar_url
      FROM comments c
      LEFT JOIN artist_profiles ap ON c.author_wallet = ap.wallet
      WHERE c.track_id = ?
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).bind(trackId, limit, offset).all<CommentRow>()

    const countResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM comments WHERE track_id = ?'
    ).bind(trackId).first<{ total: number }>()

    const response: CommentsResponse = {
      success: true,
      comments: (result.results || []).map(mapComment),
      total: countResult?.total || 0,
      trackId
    }

    return c.json(response)

  } catch (error) {
    console.error('Get comments error:', error)
    return c.json({ success: false, error: 'Failed to fetch comments' }, 500)
  }
})

// POST /api/comments/:trackId - Post a new comment
commentsRoute.post('/:trackId', async (c) => {
  try {
    const trackId = parseInt(c.req.param('trackId'), 10)
    if (!trackId || trackId <= 0) {
      return c.json({ success: false, error: 'Invalid track ID' }, 400)
    }

    // Get wallet from header (set by auth middleware or wallet connection)
    const wallet = c.req.header('X-Wallet-Address')
    if (!wallet) {
      return c.json({ success: false, error: 'Wallet address required' }, 401)
    }

    // Check rate limits
    const rateCheck = await checkRateLimit(c.env.KV, wallet)
    if (!rateCheck.allowed) {
      return c.json({
        success: false,
        error: 'comment_rate_limit',
        retryAfterSeconds: rateCheck.retryAfterSeconds,
        dailyRemaining: rateCheck.dailyRemaining,
        hint: rateCheck.retryAfterSeconds
          ? `You can post another comment in ${rateCheck.retryAfterSeconds} seconds.`
          : 'You have reached your daily comment limit. Try again tomorrow.'
      }, 429)
    }

    const body = await c.req.json<{ text: string; timestampSeconds: number }>()

    // Validate text
    if (!body.text || typeof body.text !== 'string') {
      return c.json({ success: false, error: 'Comment text is required' }, 400)
    }
    const text = body.text.trim()
    if (text.length === 0) {
      return c.json({ success: false, error: 'Comment cannot be empty' }, 400)
    }
    if (text.length > 280) {
      return c.json({ success: false, error: 'Comment must be 280 characters or less' }, 400)
    }

    // Validate timestamp
    const timestampSeconds = Math.floor(body.timestampSeconds || 0)
    if (timestampSeconds < 0) {
      return c.json({ success: false, error: 'Invalid timestamp' }, 400)
    }

    // Check if track exists and get duration
    const track = await c.env.DB.prepare(
      'SELECT id, duration FROM tracks WHERE id = ?'
    ).bind(trackId).first<{ id: number; duration: number }>()

    if (!track) {
      return c.json({ success: false, error: 'Track not found' }, 404)
    }

    const maxTimestamp = Math.floor(track.duration / 1000)
    if (timestampSeconds > maxTimestamp) {
      return c.json({ success: false, error: 'Timestamp exceeds track duration' }, 400)
    }

    // Determine author type (agent if they have an artist profile, listener otherwise)
    const profile = await c.env.DB.prepare(
      'SELECT username FROM artist_profiles WHERE wallet = ?'
    ).bind(wallet).first<{ username: string }>()

    const authorType = profile ? 'agent' : 'listener'

    // Insert comment
    const result = await c.env.DB.prepare(`
      INSERT INTO comments (track_id, author_wallet, author_type, timestamp_seconds, text)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, created_at
    `).bind(trackId, wallet, authorType, timestampSeconds, text)
      .first<{ id: number; created_at: number }>()

    if (!result) {
      return c.json({ success: false, error: 'Failed to create comment' }, 500)
    }

    // Record for rate limiting
    await recordComment(c.env.KV, wallet)

    // Get comment count
    const countResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM comments WHERE track_id = ?'
    ).bind(trackId).first<{ total: number }>()

    // Fetch the full comment with profile info
    const commentRow = await c.env.DB.prepare(`
      SELECT
        c.id,
        c.track_id,
        c.author_wallet,
        c.author_type,
        c.timestamp_seconds,
        c.text,
        c.created_at,
        ap.username AS profile_username,
        ap.display_name AS profile_display_name,
        ap.avatar_url AS profile_avatar_url
      FROM comments c
      LEFT JOIN artist_profiles ap ON c.author_wallet = ap.wallet
      WHERE c.id = ?
    `).bind(result.id).first<CommentRow>()

    const response: PostCommentResponse = {
      success: true,
      comment: mapComment(commentRow!),
      trackCommentCount: countResult?.total || 1,
      suggestion: 'Your comment is live! Check back later to see if others respond.'
    }

    return c.json(response, 201)

  } catch (error) {
    console.error('Post comment error:', error)
    return c.json({ success: false, error: 'Failed to post comment' }, 500)
  }
})

// DELETE /api/comments/:trackId/:commentId - Delete a comment
commentsRoute.delete('/:trackId/:commentId', async (c) => {
  try {
    const trackId = parseInt(c.req.param('trackId'), 10)
    const commentId = parseInt(c.req.param('commentId'), 10)

    if (!trackId || !commentId || trackId <= 0 || commentId <= 0) {
      return c.json({ success: false, error: 'Invalid IDs' }, 400)
    }

    const wallet = c.req.header('X-Wallet-Address')
    if (!wallet) {
      return c.json({ success: false, error: 'Wallet address required' }, 401)
    }

    // Check comment exists and belongs to this wallet
    const comment = await c.env.DB.prepare(
      'SELECT id, author_wallet FROM comments WHERE id = ? AND track_id = ?'
    ).bind(commentId, trackId).first<{ id: number; author_wallet: string }>()

    if (!comment) {
      return c.json({ success: false, error: 'Comment not found' }, 404)
    }

    if (comment.author_wallet.toLowerCase() !== wallet.toLowerCase()) {
      return c.json({ success: false, error: 'You can only delete your own comments' }, 403)
    }

    await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run()

    return c.json({ success: true })

  } catch (error) {
    console.error('Delete comment error:', error)
    return c.json({ success: false, error: 'Failed to delete comment' }, 500)
  }
})

export default commentsRoute
