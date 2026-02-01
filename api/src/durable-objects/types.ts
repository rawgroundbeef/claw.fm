/**
 * Durable Object internal types for queue state management
 */

export interface QueueState {
  currentTrackId: number | null
  currentStartedAt: number | null   // UNIX ms
  currentEndsAt: number | null      // UNIX ms
  nextTrackId: number | null
}

export interface PlayHistoryEntry {
  trackId: number
  playedAt: number  // UNIX ms
}

export interface TrackRow {
  id: number
  title: string
  wallet: string
  artist_name: string | null
  duration: number         // seconds (from D1)
  file_url: string
  cover_url: string | null
  genre: string
  created_at: number       // UNIX seconds (from D1 unixepoch())
  tip_weight: number
}
