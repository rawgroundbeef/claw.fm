import { Hono } from 'hono'
import type { DownloadResponse } from '@claw/shared'
import { generateDownloadToken, verifyDownloadToken } from '../lib/presigned'

type Bindings = {
  DB: D1Database
  AUDIO_BUCKET: R2Bucket
  DOWNLOAD_SECRET: string
}

const downloads = new Hono<{ Bindings: Bindings }>()

// POST /api/downloads/:trackId - Request download link
downloads.post('/:trackId', async (c) => {
  try {
    const trackId = parseInt(c.req.param('trackId'))

    if (!Number.isInteger(trackId) || trackId <= 0) {
      return c.json({ error: 'Invalid trackId' }, 400)
    }

    // Look up track in D1
    const track = await c.env.DB.prepare(
      'SELECT id, file_url, title FROM tracks WHERE id = ?'
    ).bind(trackId).first()

    if (!track) {
      return c.json({ error: 'Track not found' }, 404)
    }

    // Extract R2 key from file_url
    // file_url format: https://{bucket}.r2.dev/{key} or just the key
    const fileUrl = track.file_url as string
    const r2Key = fileUrl.includes('://')
      ? new URL(fileUrl).pathname.slice(1) // Remove leading slash
      : fileUrl

    // Calculate expiry (72 hours from now)
    const expiresAt = Date.now() + (72 * 60 * 60 * 1000)

    // Generate HMAC token
    const token = await generateDownloadToken(
      r2Key,
      expiresAt,
      c.env.DOWNLOAD_SECRET
    )

    // Construct download URL (relative to API base)
    const downloadUrl = `/api/downloads/${trackId}/file?token=${token}&expires=${expiresAt}`

    const response: DownloadResponse = {
      downloadUrl,
      expiresAt
    }

    return c.json(response)
  } catch (error) {
    console.error('Download request error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /api/downloads/:trackId/file - Serve the file
downloads.get('/:trackId/file', async (c) => {
  try {
    const trackId = parseInt(c.req.param('trackId'))
    const token = c.req.query('token')
    const expiresStr = c.req.query('expires')

    if (!token || !expiresStr) {
      return c.json({ error: 'Missing token or expires parameter' }, 400)
    }

    const expiresAt = parseInt(expiresStr)

    // Check if expired
    if (Date.now() >= expiresAt) {
      return c.json({ error: 'Download link has expired' }, 403)
    }

    // Look up track to get file_url
    const track = await c.env.DB.prepare(
      'SELECT id, file_url, title FROM tracks WHERE id = ?'
    ).bind(trackId).first()

    if (!track) {
      return c.json({ error: 'Track not found' }, 404)
    }

    // Extract R2 key from file_url
    const fileUrl = track.file_url as string
    const r2Key = fileUrl.includes('://')
      ? new URL(fileUrl).pathname.slice(1)
      : fileUrl

    // Verify token
    const isValid = await verifyDownloadToken(
      r2Key,
      expiresAt,
      token,
      c.env.DOWNLOAD_SECRET
    )

    if (!isValid) {
      return c.json({ error: 'Invalid download token' }, 403)
    }

    // Fetch from R2
    const object = await c.env.AUDIO_BUCKET.get(r2Key)

    if (!object) {
      return c.json({ error: 'File not found in storage' }, 404)
    }

    // Stream the file with download headers
    const title = track.title as string
    const filename = `${title.replace(/[^a-zA-Z0-9-_ ]/g, '')}.mp3`

    return new Response(object.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': object.size.toString()
      }
    })
  } catch (error) {
    console.error('Download serve error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default downloads
