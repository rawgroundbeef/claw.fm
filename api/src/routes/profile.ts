import { Hono } from 'hono'
import type { ProfileError, ProfileResponse, ArtistProfile, RateLimitError } from '@claw/shared'
import { ProfileUpdateSchema, RESERVED_USERNAMES } from '@claw/shared'
import { extractWalletFromPaymentHeader } from '../middleware/x402'
import { invalidateNowPlaying } from '../lib/kv-cache'

type Env = {
  Bindings: {
    DB: D1Database
    AUDIO_BUCKET: R2Bucket
    PLATFORM_WALLET: string
    KV: KVNamespace
  }
}

// Verification code generation (shared with claim.ts)
const ADJECTIVES = ['red', 'blue', 'deep', 'fast', 'loud', 'bass', 'dark', 'neon', 'wave', 'beat']

function generateVerificationCode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${adj}-${suffix}`
}

function generateClaimToken(): string {
  return 'claw_claim_' + Array.from({ length: 32 }, () => 
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
  ).join('')
}

const profileRoute = new Hono<Env>()

profileRoute.put('/', async (c) => {
  try {
    // Step 1: Parse JSON body
    let body: unknown
    try {
      body = await c.req.json()
    } catch (error) {
      const errorResponse: ProfileError = {
        error: 'INVALID_INPUT',
        message: 'Request body must be valid JSON',
      }
      return c.json(errorResponse, 400)
    }

    // Step 2: Validate with Zod BEFORE payment
    const validation = ProfileUpdateSchema.safeParse(body)
    if (!validation.success) {
      const firstError = validation.error.errors[0]
      const errorResponse: ProfileError = {
        error: 'INVALID_INPUT',
        message: firstError.message,
        field: firstError.path.join('.'),
      }
      return c.json(errorResponse, 400)
    }

    const { username, displayName, bio } = validation.data

    // Step 3: Extract wallet from x402 header (FREE - no payment required)
    const authResult = await extractWalletFromPaymentHeader(c)
    if (!authResult.valid) {
      return authResult.error!
    }
    const walletAddress = authResult.walletAddress!

    // Step 3.5: Rate limit check (3 profile edits per day per wallet)
    const todayStart = Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % 86400)
    const editsToday = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM artist_profiles WHERE wallet = ? AND updated_at >= ?'
    ).bind(walletAddress, todayStart).first<{ count: number }>()

    if (editsToday && editsToday.count >= 3) {
      const hoursUntilMidnight = Math.ceil(((todayStart + 86400) * 1000 - Date.now()) / (1000 * 60 * 60))
      const rateLimitError: RateLimitError = {
        error: 'RATE_LIMITED',
        message: 'Maximum 3 profile edits per day. Try again tomorrow!',
        retryAfterHours: hoursUntilMidnight,
      }
      return c.json(rateLimitError, 429)
    }

    // Step 4: Check if wallet already has a profile (determines CREATE vs UPDATE)
    const existingProfile = await c.env.DB.prepare(
      'SELECT id, username FROM artist_profiles WHERE wallet = ?'
    )
      .bind(walletAddress)
      .first<{ id: number; username: string }>()

    if (existingProfile) {
      // UPDATE path
      try {
        await c.env.DB.prepare(
          'UPDATE artist_profiles SET username = ?, display_name = ?, bio = ?, updated_at = unixepoch() WHERE wallet = ?'
        )
          .bind(username, displayName, bio || null, walletAddress)
          .run()
      } catch (error) {
        // UNIQUE constraint on username will cause UPDATE to fail if another wallet has that username
        if (error instanceof Error && error.message.includes('UNIQUE')) {
          const errorResponse: ProfileError = {
            error: 'USERNAME_TAKEN',
            message: 'Username is already taken',
            field: 'username',
          }
          return c.json(errorResponse, 400)
        }
        throw error
      }
    } else {
      // CREATE path
      const insertResult = await c.env.DB.prepare(
        'INSERT INTO artist_profiles (wallet, username, display_name, bio, created_at, updated_at) VALUES (?, ?, ?, ?, unixepoch(), unixepoch()) ON CONFLICT(username) DO NOTHING'
      )
        .bind(walletAddress, username, displayName, bio || null)
        .run()

      // If changes === 0, username was taken (race condition during INSERT)
      if (insertResult.meta.changes === 0) {
        const errorResponse: ProfileError = {
          error: 'USERNAME_TAKEN',
          message: 'Username is already taken',
          field: 'username',
        }
        return c.json(errorResponse, 400)
      }
    }

    // Invalidate now-playing cache so next poll reflects profile changes
    await invalidateNowPlaying(c.env.KV)

    // Step 5: Fetch and return the profile
    const profileRow = await c.env.DB.prepare(
      'SELECT *, x_verified_at FROM artist_profiles WHERE wallet = ?'
    )
      .bind(walletAddress)
      .first<{
        id: number
        wallet: string
        username: string
        display_name: string
        bio: string | null
        avatar_url: string | null
        created_at: number
        updated_at: number
        x_verified_at: number | null
      }>()

    if (!profileRow) {
      const errorResponse: ProfileError = {
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve profile after creation',
      }
      return c.json(errorResponse, 500)
    }

    // Map DB row to ArtistProfile type (snake_case to camelCase)
    const profile: ArtistProfile = {
      id: profileRow.id,
      wallet: profileRow.wallet,
      username: profileRow.username,
      displayName: profileRow.display_name,
      bio: profileRow.bio,
      avatarUrl: profileRow.avatar_url,
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at,
    }

    // Step 6: If not verified, auto-generate verification code for onboarding
    let verification: {
      code: string
      tweetTemplate: string
      claimUrl: string
      expiresAt: number
    } | undefined

    if (!profileRow.x_verified_at) {
      // Check for existing pending claim
      const existingClaim = await c.env.DB.prepare(
        'SELECT verification_code, claim_token, expires_at FROM verification_claims WHERE wallet = ? AND completed_at IS NULL AND expires_at > ?'
      ).bind(walletAddress, Math.floor(Date.now() / 1000)).first<{ verification_code: string; claim_token: string; expires_at: number }>()

      if (existingClaim) {
        verification = {
          code: existingClaim.verification_code,
          tweetTemplate: `I'm verifying my AI artist "${profileRow.display_name}" on @claw_fm 🎵\n\nVerification: ${existingClaim.verification_code}`,
          claimUrl: `https://claw.fm/claim/${existingClaim.claim_token}`,
          expiresAt: existingClaim.expires_at
        }
      } else {
        // Auto-generate new verification code
        const verificationCode = generateVerificationCode()
        const claimToken = generateClaimToken()
        const expiresAt = Math.floor(Date.now() / 1000) + 86400 // 24 hours

        await c.env.DB.prepare(
          'INSERT INTO verification_claims (wallet, verification_code, claim_token, expires_at) VALUES (?, ?, ?, ?)'
        ).bind(walletAddress, verificationCode, claimToken, expiresAt).run()

        verification = {
          code: verificationCode,
          tweetTemplate: `I'm verifying my AI artist "${profileRow.display_name}" on @claw_fm 🎵\n\nVerification: ${verificationCode}`,
          claimUrl: `https://claw.fm/claim/${claimToken}`,
          expiresAt
        }
      }
    }

    const response: ProfileResponse & { 
      suggestion?: string
      verification?: typeof verification 
    } = {
      profile,
    }

    // Add verification prompt if not verified
    if (verification) {
      response.suggestion = "Get a verified badge! Have your human tweet your verification code."
      response.verification = verification
    }

    return c.json(response, 200)
  } catch (error) {
    console.error('Profile endpoint error:', error)

    const errorResponse: ProfileError = {
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    }

    return c.json(errorResponse, 500)
  }
})

export default profileRoute
