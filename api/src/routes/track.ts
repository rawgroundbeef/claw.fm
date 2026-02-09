import { Hono, Context } from 'hono'
import type { TrackDetailResponse, ArtistPublicProfile, Track, TrackComment } from '@claw/shared'

type Env = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
  }
}

type TrackRow = {
  id: number
  title: string
  slug: string
  wallet: string
  artist_name: string
  duration: number
  file_url: string
  cover_url: string | null
  genre: string
  description: string | null
  tags: string | null
  file_hash: string
  created_at: number
  play_count: number
  tip_weight: number
  waveform_peaks: string | null
  like_count: number
  profile_username: string | null
  profile_display_name: string | null
  profile_bio: string | null
  profile_avatar_url: string | null
  profile_wallet: string | null
  profile_created_at: number | null
}

const trackRoute = new Hono<Env>()

// Helper to fetch track details (shared between routes)
async function fetchTrackBySlug(db: D1Database, slug: string, username?: string): Promise<TrackRow | null> {
  const query = username
    ? `
      SELECT
        t.id,
        t.title,
        t.slug,
        t.wallet,
        t.artist_name,
        t.duration,
        t.file_url,
        t.cover_url,
        t.genre,
        t.description,
        t.tags,
        t.file_hash,
        t.created_at,
        t.play_count,
        t.tip_weight,
        t.waveform_peaks,
        t.like_count,
        ap.username AS profile_username,
        ap.display_name AS profile_display_name,
        ap.bio AS profile_bio,
        ap.avatar_url AS profile_avatar_url,
        ap.wallet AS profile_wallet,
        ap.created_at AS profile_created_at
      FROM tracks t
      LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
      WHERE t.slug = ? AND ap.username = ?
    `
    : `
      SELECT
        t.id,
        t.title,
        t.slug,
        t.wallet,
        t.artist_name,
        t.duration,
        t.file_url,
        t.cover_url,
        t.genre,
        t.description,
        t.tags,
        t.file_hash,
        t.created_at,
        t.play_count,
        t.tip_weight,
        t.waveform_peaks,
        t.like_count,
        ap.username AS profile_username,
        ap.display_name AS profile_display_name,
        ap.bio AS profile_bio,
        ap.avatar_url AS profile_avatar_url,
        ap.wallet AS profile_wallet,
        ap.created_at AS profile_created_at
      FROM tracks t
      LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
      WHERE t.slug = ?
    `

  const stmt = username
    ? db.prepare(query).bind(slug, username)
    : db.prepare(query).bind(slug)

  return stmt.first<TrackRow>()
}

// Helper to build the full track response
async function buildTrackResponse(c: Context<Env>, trackRow: TrackRow) {
  const db = c.env.DB
  const kv = c.env.KV
  const walletAddress = c.req.header('X-Wallet-Address')

  // Step 2: Compute tip total from transactions
  const tipSumRow = await db.prepare(`
    SELECT COALESCE(SUM(amount_usdc), 0) as total
    FROM transactions
    WHERE track_id = ? AND type = 'tip'
  `).bind(trackRow.id).first<{ total: number }>()
  const tipTotal = tipSumRow?.total || 0

  // Step 3: Compute rank within artist's catalog by play_count
  const rankRow = await db.prepare(`
    SELECT COUNT(*) + 1 as rank
    FROM tracks
    WHERE wallet = ? AND play_count > ?
  `).bind(trackRow.wallet, trackRow.play_count).first<{ rank: number }>()
  const rank = rankRow?.rank || 1

  // Step 4: Fetch last 10 tips
  const tipsResult = await db.prepare(`
    SELECT payer_wallet, amount_usdc, created_at
    FROM transactions
    WHERE track_id = ? AND type = 'tip'
    ORDER BY created_at DESC
    LIMIT 10
  `).bind(trackRow.id).all<{
    payer_wallet: string
    amount_usdc: number
    created_at: number
  }>()
  const tips = (tipsResult.results || []).map((t: { payer_wallet: string; amount_usdc: number; created_at: number }) => ({
    payerWallet: t.payer_wallet,
    amountUsdc: t.amount_usdc,
    createdAt: t.created_at
  }))

  // Step 5: Fetch related tracks (up to 3 from same wallet, excluding current, ordered by play_count)
  const relatedResult = await db.prepare(`
    SELECT id, title, slug, wallet, artist_name, duration, file_url, cover_url, genre, description, tags, file_hash, created_at, play_count, tip_weight, waveform_peaks
    FROM tracks
    WHERE wallet = ? AND id != ?
    ORDER BY play_count DESC
    LIMIT 3
  `).bind(trackRow.wallet, trackRow.id).all()

  const relatedTracks: Track[] = (relatedResult.results || []).map((t: Record<string, unknown>) => ({
    id: t.id as number,
    title: t.title as string,
    slug: (t.slug as string) || '',
    wallet: t.wallet as string,
    duration: t.duration as number,
    fileUrl: `/audio/${t.file_url}`,
    coverUrl: t.cover_url
      ? ((t.cover_url as string).startsWith('data:')
          ? t.cover_url as string
          : `/audio/${t.cover_url}`)
      : undefined,
    genre: t.genre as string,
    description: (t.description as string | null) || undefined,
    tags: (t.tags as string | null) || undefined,
    fileHash: (t.file_hash as string) || '',
    artistName: (t.artist_name as string | null) || undefined,
    createdAt: t.created_at as number,
    playCount: t.play_count as number,
    tipWeight: t.tip_weight as number,
    waveformPeaks: t.waveform_peaks ? JSON.parse(t.waveform_peaks as string) : undefined
  }))

  // Step 6: Check if track is currently live
  let isLive = false
  try {
    const cached = await kv.get('now-playing')
    if (cached) {
      const nowPlaying = JSON.parse(cached)
      if (nowPlaying.track?.id === trackRow.id) {
        isLive = true
      }
    }
  } catch {
    // Ignore KV errors
  }

  // Step 6b: Fetch comments (newest first, limit 50)
  const commentsResult = await db.prepare(`
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
    ORDER BY c.created_at DESC
    LIMIT 50
  `).bind(trackRow.id).all<{
    id: number
    track_id: number
    author_wallet: string
    author_type: 'agent' | 'listener'
    timestamp_seconds: number
    text: string
    created_at: number
    profile_username: string | null
    profile_display_name: string | null
    profile_avatar_url: string | null
  }>()

  const comments: TrackComment[] = (commentsResult.results || []).map((row) => ({
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
  }))

  // Step 6c: Check if user has liked this track
  let liked = false
  if (walletAddress && walletAddress.startsWith('0x') && walletAddress.length === 42) {
    const likeRow = await db.prepare(
      'SELECT 1 FROM likes WHERE track_id = ? AND wallet_address = ?'
    ).bind(trackRow.id, walletAddress).first()
    liked = !!likeRow
  }

  // Step 7: Build artist profile object (if exists)
  const artistProfile: ArtistPublicProfile | null = trackRow.profile_username
    ? {
        username: trackRow.profile_username,
        displayName: trackRow.profile_display_name || trackRow.profile_username,
        bio: trackRow.profile_bio || null,
        avatarUrl: trackRow.profile_avatar_url ? `/audio/${trackRow.profile_avatar_url}` : null,
        wallet: trackRow.profile_wallet || trackRow.wallet,
        createdAt: trackRow.profile_created_at || trackRow.created_at
      }
    : null

  // Step 8: Build track object
  const track: Track & { artistProfile: ArtistPublicProfile | null } = {
    id: trackRow.id,
    title: trackRow.title,
    slug: trackRow.slug,
    wallet: trackRow.wallet,
    duration: trackRow.duration,
    fileUrl: `/audio/${trackRow.file_url}`,
    coverUrl: trackRow.cover_url
      ? (trackRow.cover_url.startsWith('data:')
          ? trackRow.cover_url
          : `/audio/${trackRow.cover_url}`)
      : undefined,
    genre: trackRow.genre,
    description: trackRow.description || undefined,
    tags: trackRow.tags || undefined,
    fileHash: trackRow.file_hash,
    artistName: trackRow.artist_name || undefined,
    createdAt: trackRow.created_at,
    playCount: trackRow.play_count,
    tipWeight: trackRow.tip_weight,
    waveformPeaks: trackRow.waveform_peaks ? JSON.parse(trackRow.waveform_peaks) : undefined,
    artistProfile
  }

  // Step 9: Build response
  const response: TrackDetailResponse = {
    track,
    stats: {
      playCount: trackRow.play_count,
      tipTotal,
      rank
    },
    tips,
    relatedTracks,
    isLive,
    comments,
    liked,
    likeCount: trackRow.like_count || 0
  }

  return c.json(response, 200)
}

// Route for wallet-based track lookup: /w/:wallet/:trackSlug
trackRoute.get('/w/:wallet/:trackSlug', async (c) => {
  try {
    const wallet = c.req.param('wallet')
    const trackSlug = c.req.param('trackSlug')

    // Basic wallet format validation
    if (!wallet.startsWith('0x') || wallet.length !== 42) {
      return c.json({
        error: 'INVALID_WALLET',
        message: 'Invalid wallet address format'
      }, 400)
    }

    // Fetch track by wallet and slug
    const trackRow = await c.env.DB.prepare(`
      SELECT
        t.id,
        t.title,
        t.slug,
        t.wallet,
        t.artist_name,
        t.duration,
        t.file_url,
        t.cover_url,
        t.genre,
        t.description,
        t.tags,
        t.file_hash,
        t.created_at,
        t.play_count,
        t.tip_weight,
        t.waveform_peaks,
        t.like_count,
        ap.username AS profile_username,
        ap.display_name AS profile_display_name,
        ap.bio AS profile_bio,
        ap.avatar_url AS profile_avatar_url,
        ap.wallet AS profile_wallet,
        ap.created_at AS profile_created_at
      FROM tracks t
      LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
      WHERE t.slug = ? AND t.wallet = ? COLLATE NOCASE
    `).bind(trackSlug, wallet).first<TrackRow>()

    if (!trackRow) {
      return c.json({
        error: 'NOT_FOUND',
        message: 'Track not found'
      }, 404)
    }

    return buildTrackResponse(c, trackRow)

  } catch (error) {
    console.error('Track detail by wallet endpoint error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch track details'
    }, 500)
  }
})

// New route: /:username/:trackSlug
trackRoute.get('/:username/:trackSlug', async (c) => {
  try {
    const username = c.req.param('username')
    const trackSlug = c.req.param('trackSlug')

    const trackRow = await fetchTrackBySlug(c.env.DB, trackSlug, username)

    if (!trackRow) {
      return c.json({
        error: 'NOT_FOUND',
        message: 'Track not found'
      }, 404)
    }

    return buildTrackResponse(c, trackRow)

  } catch (error) {
    console.error('Track detail endpoint error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch track details'
    }, 500)
  }
})

// Legacy route: /:slug (backwards compatibility)
trackRoute.get('/:slug', async (c) => {
  try {
    const slug = c.req.param('slug')

    const trackRow = await fetchTrackBySlug(c.env.DB, slug)

    if (!trackRow) {
      return c.json({
        error: 'NOT_FOUND',
        message: 'Track not found'
      }, 404)
    }

    return buildTrackResponse(c, trackRow)

  } catch (error) {
    console.error('Track detail endpoint error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch track details'
    }, 500)
  }
})

export default trackRoute
