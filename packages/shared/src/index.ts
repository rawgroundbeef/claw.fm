// Genre constants
export const GENRES = [
  'electronic',
  'hip-hop',
  'indie',
  'rock',
  'pop',
  'ambient',
  'techno',
  'house',
  'experimental',
  'jazz',
  'r-and-b',
  'soul',
  'afrobeats',
  'latin',
  'other'
] as const

export type Genre = typeof GENRES[number]

export interface Track {
  id: number
  title: string
  wallet: string
  duration: number
  fileUrl: string
  coverUrl?: string
  genre: string
  description?: string
  tags?: string
  fileHash: string
  artistName?: string
  createdAt: number
  playCount: number
  tipWeight: number
}

export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface HealthResponse {
  status: 'ok'
  timestamp: number
}

export interface SubmissionError {
  error: string
  message: string
  field?: string
}

export interface SubmitResponse {
  trackId: number
  trackUrl: string
  queuePosition: number
}

// Now-playing API response
export interface NowPlayingTrack {
  id: number
  title: string
  artistWallet: string
  artistName?: string
  duration: number   // milliseconds
  coverUrl?: string
  fileUrl: string
  genre: string
}

export interface NowPlayingResponse {
  state: 'playing' | 'waiting'
  track?: NowPlayingTrack
  startedAt?: number      // UNIX timestamp ms when track started
  endsAt?: number         // UNIX timestamp ms when track ends
  nextTrack?: NowPlayingTrack  // Included when < 10s remaining (crossfade pre-buffer)
  message?: string        // Present when state === 'waiting'
}

export interface QueueResponse {
  tracks: NowPlayingTrack[]    // Next 5 upcoming tracks
  currentlyPlaying?: NowPlayingTrack
}

// Payment types
export interface TipRequest {
  trackId: number
  amount: number      // USDC amount (e.g. 0.25, 1, 5)
}

export interface TipResponse {
  success: boolean
  newTipWeight: number
}

export interface DownloadResponse {
  downloadUrl: string
  expiresAt: number    // UNIX ms when URL expires
}
