/**
 * KV cache helpers for now-playing state
 *
 * Centralized caching logic for the /now-playing endpoint.
 * Key: 'now-playing'
 * TTL: Dynamic based on track state and remaining time
 */

import type { NowPlayingResponse } from '@claw/shared'

/**
 * Get cached now-playing state from KV
 *
 * @param kv KV namespace binding
 * @returns Cached response or null if not found/expired
 */
export async function getCachedNowPlaying(kv: KVNamespace): Promise<NowPlayingResponse | null> {
  const cached = await kv.get('now-playing', 'json')
  return cached as NowPlayingResponse | null
}

/**
 * Cache now-playing state with smart TTL
 *
 * @param kv KV namespace binding
 * @param response Now-playing response to cache
 * @param endsAt Optional track end timestamp (for playing state)
 */
export async function cacheNowPlaying(kv: KVNamespace, response: NowPlayingResponse, endsAt?: number): Promise<void> {
  // KV requires minimum 60s TTL
  // For 'waiting' state, skip caching (state changes when first track arrives)
  if (response.state === 'waiting') {
    return
  }

  // Cache until track ends or max 60s, with 60s minimum (KV requirement)
  let ttl = 60
  if (endsAt) {
    const secondsRemaining = Math.floor((endsAt - Date.now()) / 1000)
    ttl = Math.max(60, Math.min(secondsRemaining, 60))
  }
  await kv.put('now-playing', JSON.stringify(response), { expirationTtl: ttl })
}

/**
 * Invalidate cached now-playing state
 *
 * Called when track transitions occur to force fresh fetch
 *
 * @param kv KV namespace binding
 */
export async function invalidateNowPlaying(kv: KVNamespace): Promise<void> {
  await kv.delete('now-playing')
}
