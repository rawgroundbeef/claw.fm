/**
 * Exponential decay rotation algorithm for track selection
 *
 * Implements time-based decay weighting with tip boost multipliers.
 * Newer tracks get higher baseline weights, tips provide proportional boost.
 */

// Configuration constants
export const HALF_LIFE_DAYS = 10
export const HALF_LIFE_MS = HALF_LIFE_DAYS * 24 * 60 * 60 * 1000
export const DECAY_CONSTANT = Math.log(2) / HALF_LIFE_MS
export const ANTI_REPEAT_THRESHOLD = 5  // Disable anti-repeat below this catalog size

// Minimum weight floor to prevent zero weights
const MIN_WEIGHT = 0.001

export interface TrackCandidate {
  id: number
  created_at: number
  tip_weight: number
  wallet: string
}

/**
 * Calculate decay weight for a track
 *
 * @param track Track with created_at timestamp and tip_weight
 * @param now Current timestamp (ms)
 * @returns Weight value (higher = more likely to be selected)
 */
export function calculateDecayWeight(
  track: { created_at: number; tip_weight: number },
  now: number
): number {
  // Exponential decay: newer tracks get higher weights
  const age = now - track.created_at
  const decayWeight = Math.exp(-DECAY_CONSTANT * age)

  // Tip boost: 0.1 ETH (1e17 wei) = 2x weight
  // Formula: 1 + (tip_weight / 1e17)
  // Examples: 0 ETH = 1x, 0.1 ETH = 2x, 0.2 ETH = 3x
  const tipBoost = 1 + (track.tip_weight / 1e17)

  const finalWeight = decayWeight * tipBoost

  // Apply minimum weight floor
  return Math.max(finalWeight, MIN_WEIGHT)
}

/**
 * Select a track using weighted random selection with anti-repeat filtering
 *
 * @param tracks Available track candidates
 * @param recentTrackIds Set of recently played track IDs (anti-repeat)
 * @param recentWallets Set of recently played artist wallets (diversity)
 * @returns Selected track or null if no eligible tracks
 */
export function selectTrackWeighted(
  tracks: TrackCandidate[],
  recentTrackIds: Set<number>,
  recentWallets: Set<string>
): TrackCandidate | null {
  if (tracks.length === 0) {
    return null
  }

  // Filter out recently played tracks and wallets
  const filtered = tracks.filter(
    t => !recentTrackIds.has(t.id) && !recentWallets.has(t.wallet)
  )

  // Determine eligible candidates
  let eligible: TrackCandidate[]

  if (filtered.length === 0) {
    // If filtered list is empty, check catalog size
    if (tracks.length >= ANTI_REPEAT_THRESHOLD) {
      // Large enough catalog but no eligible tracks - genuinely stuck
      return null
    } else {
      // Small catalog fallback: use all tracks (disable anti-repeat)
      eligible = tracks
    }
  } else {
    eligible = filtered
  }

  // Calculate weights for all eligible candidates
  const now = Date.now()
  const weights = eligible.map(track => calculateDecayWeight(track, now))

  // Build cumulative weights array for binary search
  const cumulative: number[] = []
  let sum = 0
  for (const w of weights) {
    sum += w
    cumulative.push(sum)
  }

  const totalWeight = sum

  if (totalWeight <= 0) {
    // Edge case: all weights are zero (shouldn't happen with MIN_WEIGHT floor)
    // Fallback to uniform random selection
    const randomIndex = Math.floor(Math.random() * eligible.length)
    return eligible[randomIndex]
  }

  // Generate random value in [0, totalWeight)
  const randomValue = Math.random() * totalWeight

  // Binary search to find selected track
  let left = 0
  let right = cumulative.length - 1

  while (left < right) {
    const mid = Math.floor((left + right) / 2)
    if (cumulative[mid] < randomValue) {
      left = mid + 1
    } else {
      right = mid
    }
  }

  return eligible[left]
}
