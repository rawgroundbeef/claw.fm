import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { HealthResponse } from '@claw/shared'
import genresRoute from './routes/genres'
import submitRoute from './routes/submit'
import nowPlayingRoute from './routes/now-playing'
import queueRoute from './routes/queue'
import tipRoute from './routes/tip'
import downloadsRoute from './routes/downloads'
import audioRoute from './routes/audio'
import profileRoute from './routes/profile'
import artistRoute from './routes/artist'
import usernameRoute from './routes/username'
import avatarRoute from './routes/avatar'
import trackRoute from './routes/track'
import commentsRoute from './routes/comments'
import likesRoute from './routes/likes'

type Bindings = {
  DB: D1Database
  AUDIO_BUCKET: R2Bucket
  PLATFORM_WALLET: string
  QUEUE_BRAIN: DurableObjectNamespace
  KV: KVNamespace
  DOWNLOAD_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

app.get('/health', (c) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: Date.now()
  }
  return c.json(response)
})

app.route('/api/genres', genresRoute)
app.route('/api/submit', submitRoute)
app.route('/api/now-playing', nowPlayingRoute)
app.route('/api/queue', queueRoute)
app.route('/api/tip', tipRoute)
app.route('/api/downloads', downloadsRoute)
app.route('/audio', audioRoute)
app.route('/api/profile', profileRoute)
app.route('/api/artist', artistRoute)
app.route('/api/username', usernameRoute)
app.route('/api/avatar', avatarRoute)
app.route('/api/track', trackRoute)
app.route('/api/comments', commentsRoute)
app.route('/api/tracks', likesRoute)

// Record a play for a track (called by client on override/direct plays)
app.post('/api/tracks/:id/play', async (c) => {
  const trackId = Number(c.req.param('id'))
  if (!trackId || trackId <= 0) {
    return c.json({ error: 'Invalid track ID' }, 400)
  }

  await c.env.DB.prepare(
    'UPDATE tracks SET play_count = play_count + 1 WHERE id = ?'
  ).bind(trackId).run()

  return c.json({ ok: true })
})

// Store client-computed waveform peaks (real PCM-derived data)
app.put('/api/tracks/:id/waveform', async (c) => {
  const trackId = Number(c.req.param('id'))
  if (!trackId || trackId <= 0) {
    return c.json({ error: 'Invalid track ID' }, 400)
  }

  const body = await c.req.json<{ peaks: number[] }>()
  if (!body.peaks || !Array.isArray(body.peaks) || body.peaks.length < 10 || body.peaks.length > 200) {
    return c.json({ error: 'peaks must be an array of 10-200 numbers' }, 400)
  }

  // Validate all values are numbers in 0-1
  for (const v of body.peaks) {
    if (typeof v !== 'number' || v < 0 || v > 1) {
      return c.json({ error: 'Each peak must be a number between 0 and 1' }, 400)
    }
  }

  // Round to 2 decimal places to keep payload small
  const rounded = body.peaks.map(v => Math.round(v * 100) / 100)

  await c.env.DB.prepare(
    'UPDATE tracks SET waveform_peaks = ? WHERE id = ?'
  ).bind(JSON.stringify(rounded), trackId).run()

  return c.json({ ok: true })
})

// One-shot backfill: compute waveform peaks for existing tracks
app.post('/api/dev/backfill-waveforms', async (c) => {
  const { extractWaveformPeaks } = await import('./lib/audio')

  const rows = await c.env.DB.prepare(
    'SELECT id, file_url FROM tracks WHERE waveform_peaks IS NULL'
  ).all<{ id: number; file_url: string }>()

  const tracks = rows.results || []
  let updated = 0
  let failed = 0

  for (const track of tracks) {
    try {
      const obj = await c.env.AUDIO_BUCKET.get(track.file_url)
      if (!obj) { failed++; continue }
      const buf = await obj.arrayBuffer()
      const peaks = extractWaveformPeaks(buf)
      if (!peaks) { failed++; continue }
      await c.env.DB.prepare(
        'UPDATE tracks SET waveform_peaks = ? WHERE id = ?'
      ).bind(JSON.stringify(peaks), track.id).run()
      updated++
    } catch {
      failed++
    }
  }

  return c.json({ total: tracks.length, updated, failed })
})

// DEV ONLY - seed route to trigger queue start (remove before deploy)
app.post('/api/dev/seed-start', async (c) => {
  const { trackId, force } = await c.req.json()
  const queueId = c.env.QUEUE_BRAIN.idFromName('global-queue')
  const queueStub = c.env.QUEUE_BRAIN.get(queueId) as any
  const started = force
    ? await queueStub.forceStart(trackId)
    : await queueStub.startImmediately(trackId)
  return c.json({ started, trackId })
})

// Admin endpoint to backfill slugs for existing tracks
app.post('/api/admin/backfill-slugs', async (c) => {
  // Simple secret header protection
  const secret = c.req.header('X-Admin-Secret')
  if (secret !== 'backfill-slugs-2024') {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { slugify } = await import('./lib/slugify')

  // Get all tracks without slugs
  const rows = await c.env.DB.prepare(
    'SELECT id, title FROM tracks WHERE slug IS NULL'
  ).all<{ id: number; title: string }>()

  const tracks = rows.results || []
  let updated = 0
  let failed = 0

  for (const track of tracks) {
    try {
      const base = slugify(track.title)
      let candidate = base
      let suffix = 1

      // Find unique slug
      while (true) {
        const existing = await c.env.DB.prepare(
          'SELECT 1 FROM tracks WHERE slug = ? AND id != ?'
        ).bind(candidate, track.id).first()

        if (!existing) break
        suffix++
        candidate = `${base}-${suffix}`
      }

      await c.env.DB.prepare(
        'UPDATE tracks SET slug = ? WHERE id = ?'
      ).bind(candidate, track.id).run()

      updated++
    } catch {
      failed++
    }
  }

  return c.json({ total: tracks.length, updated, failed })
})

export default app

export { QueueBrain } from './durable-objects/QueueBrain'
