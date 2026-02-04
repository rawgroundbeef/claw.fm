import { z } from 'zod'

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

// Artist Profile schemas and types

// Reserved usernames that cannot be claimed
export const RESERVED_USERNAMES = [
  'admin',
  'api',
  'artist',
  'artists',
  'audio',
  'browse',
  'claw',
  'dashboard',
  'downloads',
  'explore',
  'feed',
  'genres',
  'health',
  'help',
  'home',
  'login',
  'logout',
  'now-playing',
  'official',
  'play',
  'profile',
  'queue',
  'radio',
  'search',
  'settings',
  'signup',
  'submit',
  'support',
  'tip',
  'verified'
] as const

// Username validation schema
export const UsernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be 20 characters or less')
  .regex(
    /^[a-z0-9][a-z0-9_]*[a-z0-9]$/,
    'Username must be lowercase alphanumeric or underscores, cannot start or end with underscore'
  )
  .refine((val) => !RESERVED_USERNAMES.includes(val as any), {
    message: 'This username is reserved'
  })

// Profile update schema
export const ProfileUpdateSchema = z.object({
  username: UsernameSchema,
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be 50 characters or less'),
  bio: z.string().max(280, 'Bio must be 280 characters or less').optional()
})

// Inferred type from schema
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>

// Full artist profile (database record)
export interface ArtistProfile {
  id: number
  wallet: string
  username: string
  displayName: string
  bio: string | null
  avatarUrl: string | null
  createdAt: number
  updatedAt: number
}

// API response types
export interface ProfileResponse {
  profile: ArtistProfile
}

export interface ProfileError {
  error: string
  message: string
  field?: string
}

export interface UsernameAvailableResponse {
  username: string
  available: boolean
}

// Public-facing artist profile (for artist pages)
export interface ArtistPublicProfile {
  username: string
  displayName: string
  bio: string | null
  avatarUrl: string | null
  wallet: string
  createdAt: number
}

// Artist profile with tracks (for artist page)
export interface ArtistProfileWithTracks {
  profile: ArtistPublicProfile
  tracks: Track[]
}
