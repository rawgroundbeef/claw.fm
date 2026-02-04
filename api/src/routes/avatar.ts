import { Hono } from 'hono'
import type { ProfileError } from '@claw/shared'
import { verifyPayment } from '../middleware/x402'
import { fileTypeFromBlob } from 'file-type'
import { invalidateNowPlaying } from '../lib/kv-cache'

type Env = {
  Bindings: {
    DB: D1Database
    AUDIO_BUCKET: R2Bucket
    PLATFORM_WALLET: string
    IMAGES?: any // CF Images Binding (optional)
    KV: KVNamespace
  }
}

const avatarRoute = new Hono<Env>()

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB

avatarRoute.post('/', async (c) => {
  try {
    // Step 1: Parse multipart body
    const body = await c.req.parseBody()
    const avatarFile = body['avatar']

    // Step 2: Validate image file BEFORE payment
    if (!avatarFile || !(avatarFile instanceof File)) {
      const errorResponse: ProfileError = {
        error: 'MISSING_AVATAR',
        message: 'Avatar file is required',
        field: 'avatar',
      }
      return c.json(errorResponse, 400)
    }

    // Validate file size
    if (avatarFile.size > MAX_IMAGE_SIZE) {
      const errorResponse: ProfileError = {
        error: 'IMAGE_TOO_LARGE',
        message: `Avatar must be less than ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
        field: 'avatar',
      }
      return c.json(errorResponse, 400)
    }

    // Validate image type using magic number
    const fileType = await fileTypeFromBlob(avatarFile)
    if (!fileType || !ALLOWED_IMAGE_TYPES.includes(fileType.mime)) {
      const errorResponse: ProfileError = {
        error: 'INVALID_IMAGE_TYPE',
        message: `Avatar must be JPEG, PNG, or WebP. Detected: ${fileType?.mime || 'unknown'}`,
        field: 'avatar',
      }
      return c.json(errorResponse, 400)
    }

    // Step 3: Verify x402 payment
    const paymentResult = await verifyPayment(c, {
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: '10000', // 0.01 USDC (6 decimals)
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      resource: '/api/avatar',
      description: 'Avatar upload fee',
      payTo: c.env.PLATFORM_WALLET as string,
    })

    if (!paymentResult.valid) {
      return paymentResult.error!
    }

    const walletAddress = paymentResult.walletAddress!

    // Step 4: Check wallet has a profile
    const profileCheck = await c.env.DB.prepare(
      'SELECT id FROM artist_profiles WHERE wallet = ?'
    )
      .bind(walletAddress)
      .first<{ id: number }>()

    if (!profileCheck) {
      const errorResponse: ProfileError = {
        error: 'NO_PROFILE',
        message: 'Create a profile before uploading an avatar',
      }
      return c.json(errorResponse, 400)
    }

    // Step 5: Process and upload avatar
    const buffer = await avatarFile.arrayBuffer()
    let uploadBuffer: ArrayBuffer
    let contentType: string
    let fileExtension: string

    // Use CF Images Binding if available for resizing
    if (c.env.IMAGES) {
      try {
        const transformed = await (c.env.IMAGES as any)
          .input(buffer)
          .transform({ width: 256, height: 256, fit: 'cover' })
          .output({ format: 'image/webp', quality: 85 })
        uploadBuffer = transformed
        contentType = 'image/webp'
        fileExtension = 'webp'
      } catch (error) {
        console.error('CF Images transformation failed, using original:', error)
        // Fallback to original
        uploadBuffer = buffer
        contentType = fileType.mime
        fileExtension = fileType.ext
      }
    } else {
      // Fallback: upload original without resize
      uploadBuffer = buffer
      contentType = fileType.mime
      fileExtension = fileType.ext
    }

    // Upload to R2
    const avatarKey = `avatars/${walletAddress}.${fileExtension}`
    await c.env.AUDIO_BUCKET.put(avatarKey, uploadBuffer, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000',
      },
    })

    // Step 6: Update profile with avatar URL
    await c.env.DB.prepare(
      'UPDATE artist_profiles SET avatar_url = ?, updated_at = unixepoch() WHERE wallet = ?'
    )
      .bind(avatarKey, walletAddress)
      .run()

    // Invalidate now-playing cache so avatar appears in player
    await invalidateNowPlaying(c.env.KV)

    // Step 7: Return success
    return c.json({ avatarUrl: avatarKey }, 200)
  } catch (error) {
    console.error('Avatar endpoint error:', error)

    const errorResponse: ProfileError = {
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    }

    return c.json(errorResponse, 500)
  }
})

export default avatarRoute
