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
