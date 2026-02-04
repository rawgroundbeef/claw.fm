import { Hono } from 'hono'
import { ArtistPublicProfile, ArtistProfileWithTracks } from '@claw/shared'

type Env = {
  Bindings: {
    DB: D1Database
  }
}

const artistRoute = new Hono<Env>()

// IMPORTANT: /by-wallet/:wallet must be registered BEFORE /:username
// to prevent path conflict (otherwise /by-wallet/0x123 matches /:username)
artistRoute.get('/by-wallet/:wallet', async (c) => {
  try {
    const wallet = c.req.param('wallet')

    // Basic wallet format validation
    if (!wallet.startsWith('0x') || wallet.length !== 42) {
      return c.json({
        error: 'INVALID_WALLET',
        message: 'Invalid wallet address format'
      }, 400)
    }

    // Query profile by wallet (optional)
    const profile = await c.env.DB.prepare(
      'SELECT wallet, username, display_name, bio, avatar_url, created_at FROM artist_profiles WHERE wallet = ? COLLATE NOCASE'
    ).bind(wallet).first()

    // Query track catalog for this wallet (always include)
    const trackResults = await c.env.DB.prepare(
      'SELECT id, title, wallet, artist_name, duration, file_url, cover_url, genre, description, tags, file_hash, created_at, play_count, tip_weight FROM tracks WHERE wallet = ? ORDER BY created_at DESC'
    ).bind(wallet).all()

    const tracks = (trackResults.results || []).map(t => ({
      id: t.id as number,
      title: t.title as string,
      wallet: t.wallet as string,
      duration: t.duration as number,
      // Map R2 keys to /audio/ streaming route
      fileUrl: `/audio/${t.file_url}`,
      // Cover URLs: data URI identicons pass through, R2 keys get /audio/ prefix
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
      tipWeight: t.tip_weight as number
    }))

    // If no profile and no tracks, return 404
    if (!profile && tracks.length === 0) {
      return c.json({
        error: 'NOT_FOUND',
        message: 'No profile or tracks found for this wallet'
      }, 404)
    }

    // Build response with optional profile and tracks
    const profileData: ArtistPublicProfile | null = profile
      ? {
          username: profile.username as string,
          displayName: profile.display_name as string,
          bio: (profile.bio as string | null) || null,
          avatarUrl: (profile.avatar_url as string | null) || null,
          wallet: profile.wallet as string,
          createdAt: profile.created_at as number
        }
      : null

    return c.json({ profile: profileData, tracks }, 200)

  } catch (error) {
    console.error('Artist lookup by wallet error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch artist profile'
    }, 500)
  }
})

artistRoute.get('/:username', async (c) => {
  try {
    const username = c.req.param('username')

    // Query profile by username (COLLATE NOCASE handles case-insensitivity)
    const profile = await c.env.DB.prepare(
      'SELECT wallet, username, display_name, bio, avatar_url, created_at FROM artist_profiles WHERE username = ?'
    ).bind(username).first()

    if (!profile) {
      return c.json({
        error: 'NOT_FOUND',
        message: 'Artist not found'
      }, 404)
    }

    // Query track catalog for this artist
    const trackResults = await c.env.DB.prepare(
      'SELECT id, title, wallet, artist_name, duration, file_url, cover_url, genre, description, tags, file_hash, created_at, play_count, tip_weight FROM tracks WHERE wallet = ? ORDER BY created_at DESC'
    ).bind(profile.wallet).all()

    const tracks = (trackResults.results || []).map(t => ({
      id: t.id as number,
      title: t.title as string,
      wallet: t.wallet as string,
      duration: t.duration as number,
      // Map R2 keys to /audio/ streaming route
      fileUrl: `/audio/${t.file_url}`,
      // Cover URLs: data URI identicons pass through, R2 keys get /audio/ prefix
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
      tipWeight: t.tip_weight as number
    }))

    // Build response with profile and tracks
    const response: ArtistProfileWithTracks = {
      profile: {
        username: profile.username as string,
        displayName: profile.display_name as string,
        bio: (profile.bio as string | null) || null,
        avatarUrl: (profile.avatar_url as string | null) || null,
        wallet: profile.wallet as string,
        createdAt: profile.created_at as number
      },
      tracks
    }

    return c.json(response, 200)

  } catch (error) {
    console.error('Artist lookup by username error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch artist profile'
    }, 500)
  }
})

export default artistRoute
