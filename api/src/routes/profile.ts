import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
    AUDIO_BUCKET: R2Bucket
    PLATFORM_WALLET: string
    KV: KVNamespace
  }
}

const profileRoute = new Hono<Env>()

profileRoute.put('/', async (c) => {
  return c.json({ error: 'NOT_IMPLEMENTED', message: 'Profile creation coming soon' }, 501)
})

export default profileRoute
