/**
 * Calculate equal-power crossfade gains.
 *
 * Linear crossfade causes a volume dip in the middle where both tracks are at 50%.
 * Equal-power crossfade uses cosine curves to maintain constant perceived loudness.
 *
 * @param position - Crossfade position from 0 to 1
 *   - 0 = full track1, silent track2
 *   - 0.5 = both tracks at equal power
 *   - 1 = silent track1, full track2
 * @returns [gain1, gain2] - Gain values for track1 and track2
 */
export function calculateEqualPowerGains(position: number): [number, number] {
  // Clamp position to 0-1 range
  const pos = Math.max(0, Math.min(1, position))

  // Equal-power curve using cosine
  // At pos=0: gain1=1, gain2=0
  // At pos=0.5: gain1≈0.707, gain2≈0.707 (equal power, no dip)
  // At pos=1: gain1=0, gain2=1
  const gain1 = Math.cos(pos * 0.5 * Math.PI)
  const gain2 = Math.cos((1.0 - pos) * 0.5 * Math.PI)

  return [gain1, gain2]
}
