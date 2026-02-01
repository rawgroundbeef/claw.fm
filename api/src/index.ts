import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { HealthResponse } from '@claw/shared'
import genresRoute from './routes/genres'
import submitRoute from './routes/submit'

type Bindings = {
  DB: D1Database
  AUDIO_BUCKET: R2Bucket
  PLATFORM_WALLET: string
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

export default app
