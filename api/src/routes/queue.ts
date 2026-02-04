import { Hono } from 'hono'
import type { QueueResponse, NowPlayingTrack } from '@claw/shared'
import { truncateBio } from '../lib/text-utils'

type Env = {
  Bindings: {
    DB: D1Database
    AUDIO_BUCKET: R2Bucket
    PLATFORM_WALLET: string
    QUEUE_BRAIN: DurableObjectNamespace
    KV: KVNamespace
  }
}

const queueRoute = new Hono<Env>()

queueRoute.get('/', async (c) => {
  try {
    // Step 1: Get DO stub
    const queueId = c.env.QUEUE_BRAIN.idFromName('global-queue')
    const queueStub = c.env.QUEUE_BRAIN.get(queueId) as any

    // Step 2: Call getQueuePreview to get array of track IDs
    const trackIds = await queueStub.getQueuePreview(5)

    // Step 3: If empty array, return empty queue
    if (trackIds.length === 0) {
      const response: QueueResponse = {
        tracks: [],
        currentlyPlaying: undefined
      }

      return c.json(response)
    }

    // Step 4: Fetch metadata for each track ID from D1
    const placeholders = trackIds.map(() => '?').join(', ')
    const trackResults = await c.env.DB.prepare(`
      SELECT
        t.id,
        t.title,
        t.wallet,
        t.artist_name,
        t.duration,
        t.file_url,
        t.cover_url,
        t.genre,
        ap.username AS profile_username,
        ap.display_name AS profile_display_name,
        ap.avatar_url AS profile_avatar_url,
        ap.bio AS profile_bio
      FROM tracks t
      LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
      WHERE t.id IN (${placeholders})
    `).bind(...trackIds).all<{
      id: number
      title: string
      wallet: string
      artist_name: string
      duration: number
      file_url: string
      cover_url: string
      genre: string
      profile_username: string | null
      profile_display_name: string | null
      profile_avatar_url: string | null
      profile_bio: string | null
    }>()

    // Build a map for quick lookup
    const trackMap = new Map<number, NowPlayingTrack>()

    if (trackResults.results) {
      for (const row of trackResults.results) {
        trackMap.set(row.id, {
          id: row.id,
          title: row.title,
          artistWallet: row.wallet,
          artistName: row.artist_name,
          duration: row.duration,
          coverUrl: `/audio/${row.cover_url}`,
          fileUrl: `/audio/${row.file_url}`,
          genre: row.genre,
          artistUsername: row.profile_username || undefined,
          artistDisplayName: row.profile_display_name || undefined,
          artistAvatarUrl: row.profile_avatar_url ? `/audio/${row.profile_avatar_url}` : undefined,
          artistBio: row.profile_bio ? truncateBio(row.profile_bio) : undefined
        })
      }
    }

    // Preserve order from getQueuePreview
    const tracks: NowPlayingTrack[] = []
    for (const id of trackIds) {
      const track = trackMap.get(id)
      if (track) {
        tracks.push(track)
      }
    }

    // Step 5: Optionally include currentlyPlaying
    let currentlyPlaying: NowPlayingTrack | undefined

    const state = await queueStub.getCurrentState() as any
    if (state.currentTrackId) {
      const currentTrack = await c.env.DB.prepare(`
        SELECT
          t.id,
          t.title,
          t.wallet,
          t.artist_name,
          t.duration,
          t.file_url,
          t.cover_url,
          t.genre,
          ap.username AS profile_username,
          ap.display_name AS profile_display_name,
          ap.avatar_url AS profile_avatar_url,
          ap.bio AS profile_bio
        FROM tracks t
        LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
        WHERE t.id = ?
      `).bind(state.currentTrackId).first<{
        id: number
        title: string
        wallet: string
        artist_name: string
        duration: number
        file_url: string
        cover_url: string
        genre: string
        profile_username: string | null
        profile_display_name: string | null
        profile_avatar_url: string | null
        profile_bio: string | null
      }>()

      if (currentTrack) {
        currentlyPlaying = {
          id: currentTrack.id,
          title: currentTrack.title,
          artistWallet: currentTrack.wallet,
          artistName: currentTrack.artist_name,
          duration: currentTrack.duration,
          coverUrl: `/audio/${currentTrack.cover_url}`,
          fileUrl: `/audio/${currentTrack.file_url}`,
          genre: currentTrack.genre,
          artistUsername: currentTrack.profile_username || undefined,
          artistDisplayName: currentTrack.profile_display_name || undefined,
          artistAvatarUrl: currentTrack.profile_avatar_url ? `/audio/${currentTrack.profile_avatar_url}` : undefined,
          artistBio: currentTrack.profile_bio ? truncateBio(currentTrack.profile_bio) : undefined
        }
      }
    }

    // Step 6: Return QueueResponse
    const response: QueueResponse = {
      tracks,
      currentlyPlaying
    }

    return c.json(response)
  } catch (error) {
    console.error('Queue endpoint error:', error)

    const response: QueueResponse = {
      tracks: [],
      currentlyPlaying: undefined
    }

    return c.json(response)
  }
})

export default queueRoute
