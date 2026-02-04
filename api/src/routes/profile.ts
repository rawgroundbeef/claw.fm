import { Hono } from 'hono'
import type { ProfileError, ProfileResponse, ArtistProfile } from '@claw/shared'
import { ProfileUpdateSchema, RESERVED_USERNAMES } from '@claw/shared'
import { verifyPayment } from '../middleware/x402'
import { invalidateNowPlaying } from '../lib/kv-cache'

type Env = {
  Bindings: {
    DB: D1Database
    AUDIO_BUCKET: R2Bucket
    PLATFORM_WALLET: string
    KV: KVNamespace
  }
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

    // Step 3: Verify x402 payment
    const paymentResult = await verifyPayment(c, {
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: '10000', // 0.01 USDC (6 decimals)
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      resource: '/api/profile',
      description: 'Profile registration fee',
      payTo: c.env.PLATFORM_WALLET as string,
    })

    if (!paymentResult.valid) {
      return paymentResult.error!
    }

    const walletAddress = paymentResult.walletAddress!

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
      'SELECT * FROM artist_profiles WHERE wallet = ?'
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

    const response: ProfileResponse = {
      profile,
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
