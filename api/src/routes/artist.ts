import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
  }
}

const artistRoute = new Hono<Env>()

artistRoute.get('/:username', async (c) => {
  return c.json({ error: 'NOT_IMPLEMENTED', message: 'Artist lookup coming soon' }, 501)
})

artistRoute.get('/by-wallet/:wallet', async (c) => {
  return c.json({ error: 'NOT_IMPLEMENTED', message: 'Wallet lookup coming soon' }, 501)
})

export default artistRoute
