import { Hono } from 'hono'
import type { NowPlayingResponse, NowPlayingTrack } from '@claw/shared'
import { getCachedNowPlaying, cacheNowPlaying } from '../lib/kv-cache'
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

const nowPlayingRoute = new Hono<Env>()

nowPlayingRoute.get('/', async (c) => {
  try {
    // Step 1: Try KV cache first (fast path)
    const cached = await getCachedNowPlaying(c.env.KV)
    if (cached) {
      return c.json(cached)
    }

    // Step 2: Cache miss -- query QueueBrain DO
    const queueId = c.env.QUEUE_BRAIN.idFromName('global-queue')
    const queueStub = c.env.QUEUE_BRAIN.get(queueId) as any
    const state = await queueStub.getCurrentState()

    // Step 3: If no current track, return waiting state
    if (!state.currentTrackId) {
      const response: NowPlayingResponse = {
        state: 'waiting',
        message: 'Waiting for first track'
      }

      // Cache with short TTL for waiting state
      await cacheNowPlaying(c.env.KV, response)

      return c.json(response)
    }

    // Step 4: Current track exists -- fetch full metadata from D1
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
        t.waveform_peaks,
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
      waveform_peaks: string | null
      profile_username: string | null
      profile_display_name: string | null
      profile_avatar_url: string | null
      profile_bio: string | null
    }>()

    if (!currentTrack) {
      // Track was deleted, return waiting state
      const response: NowPlayingResponse = {
        state: 'waiting',
        message: 'Waiting for first track'
      }

      await cacheNowPlaying(c.env.KV, response)

      return c.json(response)
    }

    // Build NowPlayingTrack from D1 row
    // file_url is an R2 key — prefix with /audio/ for the streaming route
    const track: NowPlayingTrack = {
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
      artistBio: currentTrack.profile_bio ? truncateBio(currentTrack.profile_bio) : undefined,
      waveformPeaks: currentTrack.waveform_peaks ? JSON.parse(currentTrack.waveform_peaks) : undefined
    }

    // Step 5: Check if next track should be included (crossfade pre-buffer)
    let nextTrack: NowPlayingTrack | undefined

    if (state.currentEndsAt && state.nextTrackId) {
      const timeRemaining = state.currentEndsAt - Date.now()

      if (timeRemaining < 10000) {
        // Less than 10s remaining, fetch next track metadata
        const nextTrackData = await c.env.DB.prepare(`
          SELECT
            t.id,
            t.title,
            t.wallet,
            t.artist_name,
            t.duration,
            t.file_url,
            t.cover_url,
            t.genre,
            t.waveform_peaks,
            ap.username AS profile_username,
            ap.display_name AS profile_display_name,
            ap.avatar_url AS profile_avatar_url,
            ap.bio AS profile_bio
          FROM tracks t
          LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
          WHERE t.id = ?
        `).bind(state.nextTrackId).first<{
          id: number
          title: string
          wallet: string
          artist_name: string
          duration: number
          file_url: string
          cover_url: string
          genre: string
          waveform_peaks: string | null
          profile_username: string | null
          profile_display_name: string | null
          profile_avatar_url: string | null
          profile_bio: string | null
        }>()

        if (nextTrackData) {
          nextTrack = {
            id: nextTrackData.id,
            title: nextTrackData.title,
            artistWallet: nextTrackData.wallet,
            artistName: nextTrackData.artist_name,
            duration: nextTrackData.duration,
            coverUrl: `/audio/${nextTrackData.cover_url}`,
            fileUrl: `/audio/${nextTrackData.file_url}`,
            genre: nextTrackData.genre,
            artistUsername: nextTrackData.profile_username || undefined,
            artistDisplayName: nextTrackData.profile_display_name || undefined,
            artistAvatarUrl: nextTrackData.profile_avatar_url ? `/audio/${nextTrackData.profile_avatar_url}` : undefined,
            artistBio: nextTrackData.profile_bio ? truncateBio(nextTrackData.profile_bio) : undefined,
            waveformPeaks: nextTrackData.waveform_peaks ? JSON.parse(nextTrackData.waveform_peaks) : undefined
          }
        }
      }
    }

    // Step 6: Build playing response
    const response: NowPlayingResponse = {
      state: 'playing',
      track,
      startedAt: state.currentStartedAt!,
      endsAt: state.currentEndsAt!,
      nextTrack
    }

    // Step 7: Cache and return
    await cacheNowPlaying(c.env.KV, response, state.currentEndsAt!)

    return c.json(response)
  } catch (error) {
    console.error('Now-playing endpoint error:', error)

    // Return waiting state on error
    const response: NowPlayingResponse = {
      state: 'waiting',
      message: 'Waiting for first track'
    }

    return c.json(response)
  }
})

export default nowPlayingRoute
