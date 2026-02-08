import { Hono } from 'hono'
import type { TipRequest, TipResponse } from '@claw/shared'
import { verifyMultiPayment, type MultiPaymentRequirement } from '../middleware/x402'

type Bindings = {
  DB: D1Database
  KV: KVNamespace
  PLATFORM_WALLET: string
  POOL_WALLET: string
}

const USDC_ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

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

    // Look up track in D1 (need wallet for artist share)
    const trackResult = await c.env.DB.prepare(
      'SELECT id, tip_weight, wallet FROM tracks WHERE id = ?'
    ).bind(body.trackId).first()

    if (!trackResult) {
      return c.json({ error: 'Track not found' }, 404)
    }

    const artistWallet = trackResult.wallet as string

    // Calculate split amounts in atomic units (6 decimals)
    const totalAtomic = Math.floor(body.amount * 1e6)
    const platformAmount = Math.floor(totalAtomic * 0.05)  // 5%
    const poolAmount = Math.floor(totalAtomic * 0.20)      // 20%
    const artistAmount = totalAtomic - platformAmount - poolAmount  // 75% (remainder)

    // Build 3 payment requirements
    const paymentRequirements: MultiPaymentRequirement[] = [
      {
        label: 'platform',
        requirements: {
          scheme: 'exact',
          network: 'base',
          maxAmountRequired: platformAmount.toString(),
          asset: USDC_ASSET,
          resource: '/api/tip',
          description: `Platform fee (5% of $${body.amount})`,
          payTo: c.env.PLATFORM_WALLET,
        },
      },
      {
        label: 'pool',
        requirements: {
          scheme: 'exact',
          network: 'base',
          maxAmountRequired: poolAmount.toString(),
          asset: USDC_ASSET,
          resource: '/api/tip',
          description: `Royalty pool (20% of $${body.amount})`,
          payTo: c.env.POOL_WALLET,
        },
      },
      {
        label: 'artist',
        requirements: {
          scheme: 'exact',
          network: 'base',
          maxAmountRequired: artistAmount.toString(),
          asset: USDC_ASSET,
          resource: '/api/tip',
          description: `Artist payment (75% of $${body.amount})`,
          payTo: artistWallet,
        },
      },
    ]

    // x402 multi-payment gate — 3 separate transactions
    const paymentResult = await verifyMultiPayment(c, paymentRequirements)

    if (!paymentResult.valid) {
      return paymentResult.error!
    }

    // All 3 payments settled — update tip weight
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
    const now = Math.floor(Date.now() / 1000)

    await c.env.DB.prepare(
      `INSERT INTO transactions (track_id, type, amount_usdc, payer_wallet, artist_wallet, created_at)
       VALUES (?, 'tip', ?, ?, ?, ?)`
    ).bind(body.trackId, body.amount, paymentResult.walletAddress, artistWallet, now).run()

    // Log pool contribution (pool received funds on-chain, but track for analytics)
    const poolMicro = poolAmount
    await c.env.DB.prepare(`
      INSERT INTO pool_contributions (source_type, source_id, amount, wallet, artist_wallet, created_at)
      VALUES ('tip', ?, ?, ?, ?, ?)
    `).bind(body.trackId, poolMicro, paymentResult.walletAddress, artistWallet, now).run()

    // Update pool balance tracking (for UI display, actual funds are on-chain)
    await c.env.DB.prepare(`
      UPDATE royalty_pool SET balance = balance + ?, updated_at = ? WHERE id = 1
    `).bind(poolMicro, now).run()

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
