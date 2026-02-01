/**
 * Server time synchronization utilities.
 *
 * Client and server clocks may drift. These utilities calculate the offset
 * between server and client time using round-trip compensation, then use
 * that offset to determine correct playback positions.
 */

/**
 * Calculate the offset between server and client clocks.
 *
 * Uses round-trip time compensation to estimate server time at the moment
 * the client received the response.
 *
 * @param serverTime - Server timestamp from response (milliseconds)
 * @param clientSendTime - Client time when request was sent
 * @param clientReceiveTime - Client time when response was received
 * @returns Offset in milliseconds to add to client time to get server time
 */
export function calculateServerOffset(
  serverTime: number,
  clientSendTime: number,
  clientReceiveTime: number
): number {
  const roundTripTime = clientReceiveTime - clientSendTime

  // Estimate server time at the moment we received the response
  // Assume half the round trip time was spent on the return journey
  const estimatedServerTime = serverTime + (roundTripTime / 2)

  // Calculate offset: how much to add to client time to match server time
  return estimatedServerTime - clientReceiveTime
}

/**
 * Get the correct playback position for a track based on server time.
 *
 * @param startedAt - Server timestamp when track started (milliseconds)
 * @param durationMs - Track duration in milliseconds
 * @param serverOffset - Offset from calculateServerOffset()
 * @returns Current playback position in seconds
 */
export function getCorrectPlaybackPosition(
  startedAt: number,
  durationMs: number,
  serverOffset: number
): number {
  // Calculate current server time
  const serverNow = Date.now() + serverOffset

  // Calculate elapsed time since track started
  const elapsedMs = serverNow - startedAt

  // Clamp to valid range (0 to duration)
  const clampedMs = Math.max(0, Math.min(durationMs, elapsedMs))

  // Return position in seconds
  return clampedMs / 1000
}
