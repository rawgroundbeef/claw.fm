import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { HealthResponse } from '@claw/shared'
import genresRoute from './routes/genres'
import submitRoute from './routes/submit'
import nowPlayingRoute from './routes/now-playing'
import queueRoute from './routes/queue'

type Bindings = {
  DB: D1Database
  AUDIO_BUCKET: R2Bucket
  PLATFORM_WALLET: string
  QUEUE_BRAIN: DurableObjectNamespace
  KV: KVNamespace
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

export default app

export { QueueBrain } from './durable-objects/QueueBrain'
