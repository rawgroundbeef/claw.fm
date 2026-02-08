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

    // Log transaction for tip history
    const artistWallet = trackResult.wallet as string
    const now = Math.floor(Date.now() / 1000)
    
    await c.env.DB.prepare(
      `INSERT INTO transactions (track_id, type, amount_usdc, payer_wallet, artist_wallet, created_at)
       VALUES (?, 'tip', ?, ?, ?, ?)`
    ).bind(body.trackId, body.amount, paymentResult.walletAddress, artistWallet, now).run()

    // Split: 75% artist, 20% pool, 5% platform
    const amountMicro = Math.floor(body.amount * 1_000_000) // USDC micro-units
    const artistShare = Math.floor(amountMicro * 0.75)
    const poolShare = Math.floor(amountMicro * 0.20)
    // platformShare = amountMicro - artistShare - poolShare (5%)

    // Add artist's direct share to their claimable balance
    await c.env.DB.prepare(`
      UPDATE artist_profiles 
      SET claimable_balance = COALESCE(claimable_balance, 0) + ?
      WHERE wallet = ?
    `).bind(artistShare, artistWallet).run()

    // Add to royalty pool
    await c.env.DB.prepare(`
      UPDATE royalty_pool SET balance = balance + ?, updated_at = ? WHERE id = 1
    `).bind(poolShare, now).run()

    // Log pool contribution
    await c.env.DB.prepare(`
      INSERT INTO pool_contributions (source_type, source_id, amount, wallet, artist_wallet, created_at)
      VALUES ('tip', ?, ?, ?, ?, ?)
    `).bind(body.trackId, poolShare, paymentResult.walletAddress, artistWallet, now).run()

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
