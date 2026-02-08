import { Hono } from 'hono'
import type { DownloadResponse } from '@claw/shared'
import { generateDownloadToken, verifyDownloadToken } from '../lib/presigned'
import { verifyMultiPayment, type MultiPaymentRequirement } from '../middleware/x402'

type Bindings = {
  DB: D1Database
  AUDIO_BUCKET: R2Bucket
  DOWNLOAD_SECRET: string
  PLATFORM_WALLET: string
  POOL_WALLET: string
}

const USDC_ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const DOWNLOAD_PRICE = 2_000_000 // $2 USDC in atomic units

const downloads = new Hono<{ Bindings: Bindings }>()

// POST /api/downloads/:trackId - Request download link (x402-gated)
downloads.post('/:trackId', async (c) => {
  try {
    const trackId = parseInt(c.req.param('trackId'))

    if (!Number.isInteger(trackId) || trackId <= 0) {
      return c.json({ error: 'Invalid trackId' }, 400)
    }

    // Look up track in D1
    const track = await c.env.DB.prepare(
      'SELECT id, file_url, title, wallet FROM tracks WHERE id = ?'
    ).bind(trackId).first()

    if (!track) {
      return c.json({ error: 'Track not found' }, 404)
    }

    const artistWallet = track.wallet as string

    // Calculate split amounts: 5% platform, 20% pool, 75% artist
    const platformAmount = Math.floor(DOWNLOAD_PRICE * 0.05)  // $0.10
    const poolAmount = Math.floor(DOWNLOAD_PRICE * 0.20)      // $0.40
    const artistAmount = DOWNLOAD_PRICE - platformAmount - poolAmount  // $1.50

    // Build 3 payment requirements
    const paymentRequirements: MultiPaymentRequirement[] = [
      {
        label: 'platform',
        requirements: {
          scheme: 'exact',
          network: 'base',
          maxAmountRequired: platformAmount.toString(),
          asset: USDC_ASSET,
          resource: `/api/downloads/${trackId}`,
          description: 'Platform fee (5% of $2)',
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
          resource: `/api/downloads/${trackId}`,
          description: 'Royalty pool (20% of $2)',
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
          resource: `/api/downloads/${trackId}`,
          description: 'Artist payment (75% of $2)',
          payTo: artistWallet,
        },
      },
    ]

    // x402 multi-payment gate — 3 separate transactions
    const paymentResult = await verifyMultiPayment(c, paymentRequirements)

    if (!paymentResult.valid) {
      return paymentResult.error!
    }

    // All 3 payments settled — log transaction
    const now = Math.floor(Date.now() / 1000)

    await c.env.DB.prepare(
      `INSERT INTO transactions (track_id, type, amount_usdc, payer_wallet, artist_wallet, created_at)
       VALUES (?, 'buy', 2, ?, ?, ?)`
    ).bind(trackId, paymentResult.walletAddress, artistWallet, now).run()

    // Log pool contribution (pool received funds on-chain, but track for analytics)
    await c.env.DB.prepare(`
      INSERT INTO pool_contributions (source_type, source_id, amount, wallet, artist_wallet, created_at)
      VALUES ('download', ?, ?, ?, ?, ?)
    `).bind(trackId, poolAmount, paymentResult.walletAddress, artistWallet, now).run()

    // Update pool balance tracking (for UI display, actual funds are on-chain)
    await c.env.DB.prepare(`
      UPDATE royalty_pool SET balance = balance + ?, updated_at = ? WHERE id = 1
    `).bind(poolAmount, now).run()

    // Generate download URL
    const fileUrl = track.file_url as string
    const r2Key = fileUrl.includes('://')
      ? new URL(fileUrl).pathname.slice(1)
      : fileUrl

    const expiresAt = Date.now() + (72 * 60 * 60 * 1000)

    const token = await generateDownloadToken(
      r2Key,
      expiresAt,
      c.env.DOWNLOAD_SECRET
    )

    const downloadUrl = `/api/downloads/${trackId}/file?token=${token}&expires=${expiresAt}`

    const response: DownloadResponse = {
      downloadUrl,
      expiresAt
    }

    return c.json(response)
  } catch (error) {
    console.error('Download request error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /api/downloads/:trackId/file - Serve the file
downloads.get('/:trackId/file', async (c) => {
  try {
    const trackId = parseInt(c.req.param('trackId'))
    const token = c.req.query('token')
    const expiresStr = c.req.query('expires')

    if (!token || !expiresStr) {
      return c.json({ error: 'Missing token or expires parameter' }, 400)
    }

    const expiresAt = parseInt(expiresStr)

    if (Date.now() >= expiresAt) {
      return c.json({ error: 'Download link has expired' }, 403)
    }

    const track = await c.env.DB.prepare(
      'SELECT id, file_url, title FROM tracks WHERE id = ?'
    ).bind(trackId).first()

    if (!track) {
      return c.json({ error: 'Track not found' }, 404)
    }

    const fileUrl = track.file_url as string
    const r2Key = fileUrl.includes('://')
      ? new URL(fileUrl).pathname.slice(1)
      : fileUrl

    const isValid = await verifyDownloadToken(
      r2Key,
      expiresAt,
      token,
      c.env.DOWNLOAD_SECRET
    )

    if (!isValid) {
      return c.json({ error: 'Invalid download token' }, 403)
    }

    const object = await c.env.AUDIO_BUCKET.get(r2Key)

    if (!object) {
      return c.json({ error: 'File not found in storage' }, 404)
    }

    const title = track.title as string
    const filename = `${title.replace(/[^a-zA-Z0-9-_ ]/g, '')}.mp3`

    return new Response(object.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': object.size.toString()
      }
    })
  } catch (error) {
    console.error('Download serve error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default downloads
