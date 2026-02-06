import { Hono } from 'hono'
import type { SubmitResponse, SubmissionError } from '@claw/shared'
import { validateSubmission } from '../middleware/validation'
import { verifyPayment } from '../middleware/x402'
import { generateIdenticon } from '../lib/identicon'
import { processAndUploadCoverArt } from '../lib/image'
import { extractWaveformPeaks } from '../lib/audio'
import { generateUniqueSlug } from '../lib/slugify'

type Env = {
  Bindings: {
    DB: D1Database
    AUDIO_BUCKET: R2Bucket
    PLATFORM_WALLET: string
    QUEUE_BRAIN: DurableObjectNamespace
    KV: KVNamespace
  }
}

const submitRoute = new Hono<Env>()

submitRoute.post('/', async (c) => {
  try {
    // Step 1: Parse multipart body
    const body = await c.req.parseBody()

    // Step 2: Validate all inputs BEFORE payment
    const validationResult = await validateSubmission(body)

    if (!validationResult.valid) {
      const error: SubmissionError = {
        error: validationResult.errorCode!,
        message: validationResult.message!,
        field: validationResult.field,
      }
      return c.json(error, 400)
    }

    const { title, genre, description, tags, audioFile, audioDuration, imageFile } = validationResult.data!

    // Step 3: Hash audio file for duplicate detection
    // Note: We need the audio data for both hashing and R2 upload
    // Read file into ArrayBuffer once and reuse it
    const audioBuffer = await audioFile.arrayBuffer()

    // Hash using crypto.subtle since we already have the buffer
    const hashBuffer = await crypto.subtle.digest('SHA-256', audioBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Step 4: Verify x402 payment
    const paymentResult = await verifyPayment(c, {
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: '10000', // 0.01 USDC (6 decimals)
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      resource: '/api/submit',
      description: 'Track submission fee',
      payTo: c.env.PLATFORM_WALLET as string,
    })

    if (!paymentResult.valid) {
      // verifyPayment already constructed the response with proper headers
      return paymentResult.error!
    }

    const walletAddress = paymentResult.walletAddress!

    // Step 4.5: Rate limit check (5 submissions per hour per wallet)
    const rateCheck = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM tracks WHERE wallet = ? AND created_at > unixepoch() - 3600'
    ).bind(walletAddress).first<{ count: number }>()

    if (rateCheck && rateCheck.count >= 5) {
      const error: SubmissionError = {
        error: 'RATE_LIMITED',
        message: 'Maximum 5 submissions per hour. Please try again later.',
      }
      return c.json(error, 429)
    }

    // Step 5: Check for duplicates (now we have wallet)
    const duplicateCheck = await c.env.DB.prepare(
      'SELECT id FROM tracks WHERE file_hash = ? AND wallet = ?'
    )
      .bind(fileHash, walletAddress)
      .first()

    if (duplicateCheck) {
      const error: SubmissionError = {
        error: 'DUPLICATE_SUBMISSION',
        message: 'This audio file has already been submitted from your wallet',
        field: 'audio',
      }
      return c.json(error, 400)
    }

    // Step 6: Upload audio to R2
    const trackKey = `tracks/${Date.now()}-${crypto.randomUUID()}.mp3`

    await c.env.AUDIO_BUCKET.put(trackKey, audioBuffer, {
      httpMetadata: {
        contentType: 'audio/mpeg',
        cacheControl: 'public, max-age=31536000',
      },
    })

    // Step 6.5: Extract waveform peaks for visualization
    const waveformPeaks = extractWaveformPeaks(audioBuffer)
    const waveformJson = waveformPeaks ? JSON.stringify(waveformPeaks) : null

    // Step 7: Handle cover art
    let coverUrl: string

    // We need trackId for image upload, but don't have it yet
    // Generate a unique key prefix that we'll use for both audio and cover
    const uniqueId = crypto.randomUUID()

    if (imageFile) {
      try {
        // For cover art, use the same UUID as the track key
        // We'll upload with a temporary key and update after we get the trackId
        // Actually, let's use the UUID as a stable identifier
        const imageKey = await processAndUploadCoverArt(
          imageFile,
          Date.now(), // Use timestamp as trackId substitute
          c.env.AUDIO_BUCKET
        )
        coverUrl = imageKey
      } catch (error) {
        // If cover art upload fails, fall back to identicon
        coverUrl = generateIdenticon(walletAddress)
      }
    } else {
      coverUrl = generateIdenticon(walletAddress)
    }

    // Step 7.5: Generate unique slug
    const slug = await generateUniqueSlug(c.env.DB, title)

    // Step 8: Persist metadata in D1
    const tagsJson = tags ? JSON.stringify(tags) : null

    const insertResult = await c.env.DB.prepare(`
      INSERT INTO tracks (
        title,
        slug,
        genre,
        description,
        tags,
        wallet,
        artist_name,
        duration,
        file_url,
        file_hash,
        cover_url,
        waveform_peaks,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    `)
      .bind(
        title,
        slug,
        genre,
        description || null,
        tagsJson,
        walletAddress,
        walletAddress, // Use wallet as artist_name for MVP
        audioDuration,
        trackKey,
        fileHash,
        coverUrl,
        waveformJson
      )
      .run()

    const trackId = insertResult.meta.last_row_id as number

    // Step 9: Calculate queue position
    const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM tracks').first<{ count: number }>()
    const queuePosition = countResult?.count || 1

    // Step 9.5: Trigger immediate start if this is the first track
    if (queuePosition === 1) {
      try {
        const queueId = c.env.QUEUE_BRAIN.idFromName('global-queue')
        const queueStub = c.env.QUEUE_BRAIN.get(queueId) as any
        await queueStub.startImmediately(trackId)
      } catch (err) {
        // Don't fail the submission if queue start fails
        console.error('Failed to trigger immediate start:', err)
      }
    }

    // Step 10: Return success response
    const response: SubmitResponse = {
      trackId,
      trackUrl: trackKey,
      slug,
      queuePosition,
    }

    return c.json(response, 200)
  } catch (error) {
    console.error('Submit endpoint error:', error)

    const errorResponse: SubmissionError = {
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    }

    return c.json(errorResponse, 500)
  }
})

export default submitRoute
