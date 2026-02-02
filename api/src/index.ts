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
