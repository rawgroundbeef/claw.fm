import { Hono } from 'hono'
import type { QueueResponse, NowPlayingTrack } from '@claw/shared'

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
      SELECT id, title, wallet, artist_name, duration, file_url, cover_url, genre
      FROM tracks
      WHERE id IN (${placeholders})
    `).bind(...trackIds).all<{
      id: number
      title: string
      wallet: string
      artist_name: string
      duration: number
      file_url: string
      cover_url: string
      genre: string
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
          genre: row.genre
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
        SELECT id, title, wallet, artist_name, duration, file_url, cover_url, genre
        FROM tracks
        WHERE id = ?
      `).bind(state.currentTrackId).first<{
        id: number
        title: string
        wallet: string
        artist_name: string
        duration: number
        file_url: string
        cover_url: string
        genre: string
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
          genre: currentTrack.genre
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
