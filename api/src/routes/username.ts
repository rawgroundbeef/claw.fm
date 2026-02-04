import { Hono } from 'hono'
import { UsernameSchema } from '@claw/shared'

type Env = {
  Bindings: {
    DB: D1Database
  }
}

const usernameRoute = new Hono<Env>()

usernameRoute.get('/:username/available', async (c) => {
  try {
    const username = c.req.param('username')

    // Validate format using shared Zod schema (includes reserved word check)
    const validation = UsernameSchema.safeParse(username)
    if (!validation.success) {
      return c.json({
        username,
        available: false,
        reason: 'Invalid username format'
      }, 200)
    }

    // Query database for existing username (COLLATE NOCASE handles case-insensitivity)
    const existing = await c.env.DB.prepare(
      'SELECT id FROM artist_profiles WHERE username = ?'
    ).bind(username).first()

    // Return availability result
    if (existing) {
      return c.json({
        username,
        available: false
      }, 200)
    }

    return c.json({
      username,
      available: true
    }, 200)

  } catch (error) {
    console.error('Username availability check error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to check username availability'
    }, 500)
  }
})

export default usernameRoute
