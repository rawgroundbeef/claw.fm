import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
    AUDIO_BUCKET: R2Bucket
    PLATFORM_WALLET: string
  }
}

const avatarRoute = new Hono<Env>()

avatarRoute.post('/', async (c) => {
  return c.json({ error: 'NOT_IMPLEMENTED', message: 'Avatar upload coming soon' }, 501)
})

export default avatarRoute
