import { Hono } from 'hono'

type Env = {
  Bindings: {
    AUDIO_BUCKET: R2Bucket
  }
}

const audioRoute = new Hono<Env>()

/**
 * Serve audio files from R2 bucket.
 * GET /audio/:key - streams the R2 object with proper Content-Type and caching headers.
 */
audioRoute.get('/*', async (c) => {
  // Extract the R2 key from the URL path (everything after /audio/)
  const r2Key = c.req.path.replace(/^\/audio\//, '')

  if (!r2Key) {
    return c.json({ error: 'Missing audio key' }, 400)
  }

  const object = await c.env.AUDIO_BUCKET.get(r2Key)

  if (!object) {
    return c.json({ error: 'Audio not found' }, 404)
  }

  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType || 'audio/mpeg')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Accept-Ranges', 'bytes')

  if (object.size) {
    headers.set('Content-Length', object.size.toString())
  }

  return new Response(object.body, { headers })
})

export default audioRoute
