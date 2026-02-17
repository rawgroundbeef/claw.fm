import { Hono, Context } from 'hono'
import { verifyPayment } from '../middleware/x402'
import { requireWalletAuth, extractWalletOptional } from '../middleware/auth'

interface Env {
  Bindings: {
    DB: D1Database
    AUDIO_BUCKET: R2Bucket
    PLATFORM_WALLET: string
    KV: KVNamespace
  }
}

const deleteRoute = new Hono<Env>()

/**
 * DELETE /api/tracks/:id
 * 
 * Delete a track owned by the authenticated wallet.
 * Requires x402 payment header for wallet authentication (no charge, just auth).
 * 
 * Returns 200 on success, 4xx on various error conditions.
 */
deleteRoute.delete('/:id', async (c: Context<Env>) => {
  try {
    const trackId = Number(c.req.param('id'))
    
    // Validate track ID
    if (!trackId || trackId <= 0 || !Number.isInteger(trackId)) {
      return c.json({
        error: 'INVALID_TRACK_ID',
        message: 'Track ID must be a positive integer'
      }, 400)
    }

    // Step 1: Verify x402 payment (used for authentication, not charging)
    // We use a minimal amount (1 wei equivalent in USDC decimals) that won't actually be charged
    // This is effectively a signed message proving wallet ownership
    const paymentResult = await verifyPayment(c, {
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: '1', // 0.000001 USDC - minimal for auth only
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      resource: `/api/tracks/${trackId}`,
      description: 'Track deletion authentication',
      payTo: c.env.PLATFORM_WALLET,
    })

    if (!paymentResult.valid) {
      return paymentResult.error!
    }

    const walletAddress = paymentResult.walletAddress!

    // Step 2: Verify track exists and is owned by this wallet
    const track = await c.env.DB.prepare(`
      SELECT id, wallet, file_url, cover_url 
      FROM tracks 
      WHERE id = ?
    `).bind(trackId).first<{
      id: number
      wallet: string
      file_url: string
      cover_url: string | null
    }>()

    if (!track) {
      return c.json({
        error: 'TRACK_NOT_FOUND',
        message: 'Track not found'
      }, 404)
    }

    // Case-insensitive wallet comparison (Ethereum addresses)
    if (track.wallet.toLowerCase() !== walletAddress.toLowerCase()) {
      return c.json({
        error: 'NOT_OWNER',
        message: 'Only the track owner can delete this track'
      }, 403)
    }

    // Step 3: Check if track is currently playing (prevent deletion of live tracks)
    try {
      const nowPlaying = await c.env.KV.get('now-playing')
      if (nowPlaying) {
        const current = JSON.parse(nowPlaying)
        if (current.track?.id === trackId) {
          return c.json({
            error: 'TRACK_IS_LIVE',
            message: 'Cannot delete a track that is currently playing on air'
          }, 409)
        }
      }
    } catch {
      // Ignore KV errors - proceed with deletion
    }

    // Step 4: Delete from database (cascade will handle related records)
    await c.env.DB.prepare('DELETE FROM tracks WHERE id = ?').bind(trackId).run()

    // Step 5: Delete files from R2 (non-blocking, best effort)
    c.executionCtx.waitUntil(
      (async () => {
        try {
          // Delete audio file
          if (track.file_url && !track.file_url.startsWith('data:')) {
            await c.env.AUDIO_BUCKET.delete(track.file_url)
          }
          
          // Delete cover art (if it's an R2 object, not data URI)
          if (track.cover_url && !track.cover_url.startsWith('data:')) {
            await c.env.AUDIO_BUCKET.delete(track.cover_url)
          }
        } catch (err) {
          console.error(`[delete] Failed to delete files for track ${trackId}:`, err)
          // Don't fail the request if file cleanup fails
        }
      })()
    )

    // Step 6: Clear any KV caches related to this track
    c.executionCtx.waitUntil(
      (async () => {
        try {
          // Delete track-specific cache if exists
          await c.env.KV.delete(`track:${trackId}`)
        } catch {
          // Ignore KV errors
        }
      })()
    )

    return c.json({
      success: true,
      message: 'Track deleted successfully',
      trackId,
      deletedAt: Date.now()
    }, 200)

  } catch (error) {
    console.error('[delete] Error deleting track:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    }, 500)
  }
})

/**
 * GET /api/tracks/:id/can-delete
 * 
 * Check if the authenticated wallet can delete a track (pre-flight check).
 * Useful for UI to show/hide delete buttons.
 */
deleteRoute.get('/:id/can-delete', async (c: Context<Env>) => {
  try {
    const trackId = Number(c.req.param('id'))
    const walletHeader = c.req.header('X-Wallet-Address')
    
    if (!trackId || trackId <= 0) {
      return c.json({ canDelete: false, reason: 'INVALID_TRACK_ID' }, 400)
    }

    if (!walletHeader || !walletHeader.startsWith('0x') || walletHeader.length !== 42) {
      return c.json({ canDelete: false, reason: 'NO_WALLET' }, 401)
    }

    const track = await c.env.DB.prepare(`
      SELECT id, wallet FROM tracks WHERE id = ?
    `).bind(trackId).first<{ wallet: string }>()

    if (!track) {
      return c.json({ canDelete: false, reason: 'TRACK_NOT_FOUND' }, 404)
    }

    const isOwner = track.wallet.toLowerCase() === walletHeader.toLowerCase()
    
    // Check if track is live
    let isLive = false
    try {
      const nowPlaying = await c.env.KV.get('now-playing')
      if (nowPlaying) {
        const current = JSON.parse(nowPlaying)
        isLive = current.track?.id === trackId
      }
    } catch {
      // Ignore
    }

    return c.json({
      canDelete: isOwner && !isLive,
      isOwner,
      isLive,
      reason: !isOwner ? 'NOT_OWNER' : isLive ? 'TRACK_IS_LIVE' : undefined
    }, 200)

  } catch (error) {
    console.error('[delete] Error checking can-delete:', error)
    return c.json({ canDelete: false, reason: 'INTERNAL_ERROR' }, 500)
  }
})

export default deleteRoute
