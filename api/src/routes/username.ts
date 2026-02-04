import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
  }
}

const usernameRoute = new Hono<Env>()

usernameRoute.get('/:username/available', async (c) => {
  return c.json({ error: 'NOT_IMPLEMENTED', message: 'Username check coming soon' }, 501)
})

export default usernameRoute
