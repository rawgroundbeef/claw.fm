import { Hono } from 'hono'
import type { TipRequest, TipResponse } from '@claw/shared'

type Bindings = {
  DB: D1Database
  KV: KVNamespace
}

const tip = new Hono<{ Bindings: Bindings }>()

tip.post('/', async (c) => {
  try {
    const body = await c.req.json() as TipRequest

    // Validate trackId
    if (!Number.isInteger(body.trackId) || body.trackId <= 0) {
      return c.json({ error: 'trackId must be a positive integer' }, 400)
    }

    // Validate amount (must be one of the allowed tiers)
    const allowedAmounts = [0.25, 1, 5]
    if (!allowedAmounts.includes(body.amount)) {
      return c.json({ error: 'amount must be one of: 0.25, 1, 5' }, 400)
    }

    // Validate txHash
    if (typeof body.txHash !== 'string' || !body.txHash.startsWith('0x')) {
      return c.json({ error: 'txHash must be a string starting with 0x' }, 400)
    }

    // Look up track in D1
    const trackResult = await c.env.DB.prepare(
      'SELECT id, tip_weight FROM tracks WHERE id = ?'
    ).bind(body.trackId).first()

    if (!trackResult) {
      return c.json({ error: 'Track not found' }, 404)
    }

    // Convert USDC amount to tip_weight increment
    // $1 USDC = 1e17 units
    // $0.25 tip: 0.25 * 1e17 = 2.5e16 -> boost = 1 + (2.5e16 / 1e17) = 1.25x
    // $1 tip: 1e17 -> boost = 1 + 1 = 2x
    // $5 tip: 5e17 -> boost = 1 + 5 = 6x
    const increment = Math.floor(body.amount * 1e17)

    // Update tip_weight in D1
    await c.env.DB.prepare(
      'UPDATE tracks SET tip_weight = tip_weight + ? WHERE id = ?'
    ).bind(increment, body.trackId).run()

    // Fetch updated tip_weight
    const updatedTrack = await c.env.DB.prepare(
      'SELECT tip_weight FROM tracks WHERE id = ?'
    ).bind(body.trackId).first()

    // Invalidate KV cache (rotation weights changed)
    await c.env.KV.delete('now-playing')

    const response: TipResponse = {
      success: true,
      newTipWeight: updatedTrack?.tip_weight as number || 0
    }

    return c.json(response)
  } catch (error) {
    console.error('Tip endpoint error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default tip
