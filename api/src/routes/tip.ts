import { Hono } from 'hono'
import type { TipRequest, TipResponse } from '@claw/shared'
import { verifyPayment } from '../middleware/x402'

type Bindings = {
  DB: D1Database
  KV: KVNamespace
  PLATFORM_WALLET: string
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

    // Look up track in D1 (need wallet for artist share recording)
    const trackResult = await c.env.DB.prepare(
      'SELECT id, tip_weight, wallet FROM tracks WHERE id = ?'
    ).bind(body.trackId).first()

    if (!trackResult) {
      return c.json({ error: 'Track not found' }, 404)
    }

    // Convert USDC amount to atomic units (6 decimals)
    const atomicAmount = Math.floor(body.amount * 1e6).toString()

    // x402 payment gate — amount is the tip amount, payTo is platform wallet
    const paymentResult = await verifyPayment(c, {
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: atomicAmount,
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      resource: '/api/tip',
      description: `$${body.amount} tip`,
      payTo: c.env.PLATFORM_WALLET,
    })

    if (!paymentResult.valid) {
      return paymentResult.error!
    }

    // Payment settled — update tip weight
    // $0.25 tip: 0.25 * 1e17 = 2.5e16
    // $1 tip: 1e17
    // $5 tip: 5e17
    const increment = Math.floor(body.amount * 1e17)

    await c.env.DB.prepare(
      'UPDATE tracks SET tip_weight = tip_weight + ? WHERE id = ?'
    ).bind(increment, body.trackId).run()

    // Fetch updated tip_weight
    const updatedTrack = await c.env.DB.prepare(
      'SELECT tip_weight FROM tracks WHERE id = ?'
    ).bind(body.trackId).first()

    // Invalidate KV cache (rotation weights changed)
    await c.env.KV.delete('now-playing')

    // Record artist share (95%) for later settlement
    const artistWallet = trackResult.wallet as string
    const artistShare = Math.floor(body.amount * 0.95 * 1e6) // atomic USDC
    try {
      await c.env.DB.prepare(
        `INSERT INTO artist_earnings (artist_wallet, track_id, amount_usdc, payer_wallet, created_at)
         VALUES (?, ?, ?, ?, unixepoch())`
      ).bind(artistWallet, body.trackId, artistShare, paymentResult.walletAddress).run()
    } catch {
      // Table may not exist yet — log but don't fail the tip
      console.warn('artist_earnings insert failed (table may not exist yet)')
    }

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
