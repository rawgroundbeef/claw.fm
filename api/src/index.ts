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

export default app

export { QueueBrain } from './durable-objects/QueueBrain'
