import { Hono } from 'hono'
import { UsernameSchema } from '@claw/shared'

type Env = {
  Bindings: {
    DB: D1Database
  }
}

const usernameRoute = new Hono<Env>()

// Check username availability
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

    // Query both artist_profiles and listener_usernames tables
    const [artistExists, listenerExists] = await Promise.all([
      c.env.DB.prepare(
        'SELECT id FROM artist_profiles WHERE username = ?'
      ).bind(username).first(),
      c.env.DB.prepare(
        'SELECT wallet_address FROM listener_usernames WHERE username = ?'
      ).bind(username).first()
    ])

    // Return availability result
    if (artistExists || listenerExists) {
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

// Set username for a wallet (upsert)
usernameRoute.post('/wallet/username', async (c) => {
  try {
    const walletAddress = c.req.header('X-Wallet-Address')
    if (!walletAddress) {
      return c.json({ error: 'Missing X-Wallet-Address header' }, 400)
    }

    const body = await c.req.json<{ username: string }>()
    const { username } = body

    if (!username) {
      return c.json({ error: 'Username is required' }, 400)
    }

    // Validate format using shared Zod schema
    const validation = UsernameSchema.safeParse(username)
    if (!validation.success) {
      return c.json({
        error: 'Invalid username format',
        details: validation.error.issues
      }, 400)
    }

    // Check if username is taken (by artist or another listener)
    const [artistExists, listenerExists] = await Promise.all([
      c.env.DB.prepare(
        'SELECT id FROM artist_profiles WHERE username = ?'
      ).bind(username).first(),
      c.env.DB.prepare(
        'SELECT wallet_address FROM listener_usernames WHERE username = ? AND wallet_address != ?'
      ).bind(username, walletAddress).first()
    ])

    if (artistExists || listenerExists) {
      return c.json({ error: 'Username already taken' }, 409)
    }

    // Upsert the username
    await c.env.DB.prepare(`
      INSERT INTO listener_usernames (wallet_address, username)
      VALUES (?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET username = excluded.username
    `).bind(walletAddress, username).run()

    return c.json({ ok: true, username })

  } catch (error) {
    console.error('Set username error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to set username'
    }, 500)
  }
})

// Get username for a wallet address
usernameRoute.get('/wallet/username/:address', async (c) => {
  try {
    const address = c.req.param('address')

    // Check listener_usernames first, then artist_profiles
    const listener = await c.env.DB.prepare(
      'SELECT username FROM listener_usernames WHERE wallet_address = ?'
    ).bind(address).first<{ username: string }>()

    if (listener) {
      return c.json({ username: listener.username, type: 'listener' })
    }

    const artist = await c.env.DB.prepare(
      'SELECT username FROM artist_profiles WHERE wallet_address = ?'
    ).bind(address).first<{ username: string }>()

    if (artist) {
      return c.json({ username: artist.username, type: 'artist' })
    }

    return c.json({ username: null })

  } catch (error) {
    console.error('Get username error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to get username'
    }, 500)
  }
})

export default usernameRoute
