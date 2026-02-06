const WORKER_URL = 'https://claw-fm-api.mail-753.workers.dev'

// Bot User-Agent patterns to serve OG meta tags to
const BOT_USER_AGENTS = [
  'Twitterbot',
  'facebookexternalhit',
  'LinkedInBot',
  'Slackbot',
  'Discordbot',
  'WhatsApp',
  'TelegramBot',
  'Applebot',
  'Googlebot',
  'bingbot',
  'Baiduspider',
]

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false
  return BOT_USER_AGENTS.some(bot => userAgent.includes(bot))
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const userAgent = context.request.headers.get('User-Agent')

  // Only intercept /track/:slug routes for bots
  const trackMatch = url.pathname.match(/^\/track\/([^/]+)$/)

  if (trackMatch && isBot(userAgent)) {
    const slug = trackMatch[1]

    try {
      // Fetch track data from API
      const apiResponse = await fetch(`${WORKER_URL}/api/track/${slug}`)

      if (!apiResponse.ok) {
        // Let it fall through to SPA for 404s
        return context.next()
      }

      const data = await apiResponse.json() as {
        track: {
          title: string
          slug: string
          genre: string
          duration: number
          coverUrl?: string
          fileUrl: string
          artistProfile?: {
            displayName: string
            username: string
          } | null
          wallet: string
        }
        stats: {
          playCount: number
          tipTotal: number
        }
      }

      const { track, stats } = data

      // Build artist name
      const artistName = track.artistProfile?.displayName
        || `${track.wallet.slice(0, 6)}...${track.wallet.slice(-4)}`

      // Build description
      const durationSec = Math.floor(track.duration / 1000)
      const minutes = Math.floor(durationSec / 60)
      const seconds = durationSec % 60
      const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`
      const description = `${track.genre} track by ${artistName} - ${stats.playCount.toLocaleString()} plays - ${durationStr}`

      // Build cover URL (make absolute)
      const coverUrl = track.coverUrl
        ? (track.coverUrl.startsWith('http')
            ? track.coverUrl
            : `https://claw.fm${track.coverUrl}`)
        : 'https://claw.fm/og-default.png'

      // Build audio URL (for og:audio)
      const audioUrl = track.fileUrl.startsWith('http')
        ? track.fileUrl
        : `https://claw.fm${track.fileUrl}`

      // Build canonical URL
      const canonicalUrl = `https://claw.fm/track/${track.slug}`

      // Generate HTML with OG meta tags
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(track.title)} by ${escapeHtml(artistName)} - claw.fm</title>
  <meta name="description" content="${escapeHtml(description)}">

  <!-- Open Graph -->
  <meta property="og:type" content="music.song">
  <meta property="og:site_name" content="claw.fm">
  <meta property="og:title" content="${escapeHtml(track.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(coverUrl)}">
  <meta property="og:audio" content="${escapeHtml(audioUrl)}">
  <meta property="og:audio:type" content="audio/mpeg">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@clawfm">
  <meta name="twitter:title" content="${escapeHtml(track.title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(coverUrl)}">

  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
</head>
<body>
  <h1>${escapeHtml(track.title)}</h1>
  <p>by ${escapeHtml(artistName)}</p>
  <p>${escapeHtml(description)}</p>
  <p><a href="${escapeHtml(canonicalUrl)}">Listen on claw.fm</a></p>
</body>
</html>`

      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } catch (error) {
      // On error, fall through to SPA
      console.error('OG middleware error:', error)
      return context.next()
    }
  }

  // Non-bot or non-track route: pass through to SPA
  return context.next()
}
