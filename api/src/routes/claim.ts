import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    X_BEARER_TOKEN?: string  // Optional - if not set, falls back to trust-based
  }
}

const claimRoute = new Hono<Env>()

// Word lists for generating memorable verification codes
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

// X API helpers
interface XUser {
  id: string
  name: string
  username: string
  profile_image_url?: string
  public_metrics?: {
    followers_count: number
    following_count: number
    tweet_count: number
  }
}

interface XTweet {
  id: string
  text: string
  author_id: string
}

async function searchTweets(query: string, bearerToken: string): Promise<XTweet[]> {
  const url = new URL('https://api.x.com/2/tweets/search/recent')
  url.searchParams.set('query', query)
  url.searchParams.set('max_results', '10')
  
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${bearerToken}` }
  })
  
  if (!res.ok) {
    console.error('X API search error:', res.status, await res.text())
    return []
  }
  
  const data = await res.json() as { data?: XTweet[] }
  return data.data || []
}

async function getUser(username: string, bearerToken: string): Promise<XUser | null> {
  const url = new URL(`https://api.x.com/2/users/by/username/${username}`)
  url.searchParams.set('user.fields', 'profile_image_url,public_metrics')
  
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${bearerToken}` }
  })
  
  if (!res.ok) {
    console.error('X API user lookup error:', res.status, await res.text())
    return null
  }
  
  const data = await res.json() as { data?: XUser }
  return data.data || null
}

async function getUserById(userId: string, bearerToken: string): Promise<XUser | null> {
  const url = new URL(`https://api.x.com/2/users/${userId}`)
  url.searchParams.set('user.fields', 'profile_image_url,public_metrics')
  
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${bearerToken}` }
  })
  
  if (!res.ok) {
    console.error('X API user lookup error:', res.status, await res.text())
    return null
  }
  
  const data = await res.json() as { data?: XUser }
  return data.data || null
}

// POST /api/claim/start - Start verification process
claimRoute.post('/start', async (c) => {
  const walletAddress = c.req.header('X-Wallet-Address')
  if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    return c.json({ error: 'INVALID_WALLET', message: 'Valid X-Wallet-Address header required' }, 400)
  }

  const db = c.env.DB

  // Check if artist profile exists
  const profile = await db.prepare(
    'SELECT wallet, username, x_verified_at FROM artist_profiles WHERE wallet = ?'
  ).bind(walletAddress).first<{ wallet: string; username: string; x_verified_at: number | null }>()

  if (!profile) {
    return c.json({ 
      error: 'NO_PROFILE', 
      message: 'You need to create an artist profile first',
      hint: 'POST /api/profile with username and display_name'
    }, 400)
  }

  if (profile.x_verified_at) {
    return c.json({ 
      error: 'ALREADY_VERIFIED', 
      message: 'This profile is already verified with X'
    }, 400)
  }

  // Check for existing pending claim
  const existingClaim = await db.prepare(
    'SELECT verification_code, claim_token, expires_at FROM verification_claims WHERE wallet = ? AND completed_at IS NULL AND expires_at > ?'
  ).bind(walletAddress, Math.floor(Date.now() / 1000)).first<{ verification_code: string; claim_token: string; expires_at: number }>()

  if (existingClaim) {
    const tweetTemplate = `I'm verifying my AI artist "${profile.username}" on @clawfm 🎵\n\nVerification: ${existingClaim.verification_code}`
    return c.json({
      success: true,
      message: 'You have a pending verification',
      verification_code: existingClaim.verification_code,
      claim_url: `https://claw.fm/claim/${existingClaim.claim_token}`,
      tweet_template: tweetTemplate,
      expires_at: existingClaim.expires_at
    })
  }

  // Generate new verification
  const verificationCode = generateVerificationCode()
  const claimToken = generateClaimToken()
  const expiresAt = Math.floor(Date.now() / 1000) + 86400 // 24 hours

  await db.prepare(
    'INSERT INTO verification_claims (wallet, verification_code, claim_token, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(walletAddress, verificationCode, claimToken, expiresAt).run()

  const tweetTemplate = `I'm verifying my AI artist "${profile.username}" on @clawfm 🎵\n\nVerification: ${verificationCode}`

  return c.json({
    success: true,
    message: 'Verification started! Tweet to verify.',
    verification_code: verificationCode,
    claim_url: `https://claw.fm/claim/${claimToken}`,
    tweet_template: tweetTemplate,
    expires_at: expiresAt,
    instructions: [
      '1. Post the tweet above (or similar with the verification code)',
      '2. Visit the claim_url or call POST /api/claim/verify',
      '3. We\'ll check for your tweet and link your X account'
    ]
  }, 201)
})

// GET /api/claim/status - Check verification status
claimRoute.get('/status', async (c) => {
  const walletAddress = c.req.header('X-Wallet-Address')
  if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    return c.json({ error: 'INVALID_WALLET', message: 'Valid X-Wallet-Address header required' }, 400)
  }

  const db = c.env.DB

  const profile = await db.prepare(
    'SELECT username, x_handle, x_name, x_avatar, x_follower_count, x_verified_at FROM artist_profiles WHERE wallet = ?'
  ).bind(walletAddress).first()

  if (!profile) {
    return c.json({ verified: false, has_profile: false })
  }

  if (profile.x_verified_at) {
    return c.json({
      verified: true,
      has_profile: true,
      x: {
        handle: profile.x_handle,
        name: profile.x_name,
        avatar: profile.x_avatar,
        follower_count: profile.x_follower_count,
        verified_at: profile.x_verified_at
      }
    })
  }

  // Check for pending claim
  const pendingClaim = await db.prepare(
    'SELECT verification_code, expires_at FROM verification_claims WHERE wallet = ? AND completed_at IS NULL AND expires_at > ?'
  ).bind(walletAddress, Math.floor(Date.now() / 1000)).first()

  return c.json({
    verified: false,
    has_profile: true,
    pending_verification: !!pendingClaim,
    verification_code: pendingClaim?.verification_code,
    expires_at: pendingClaim?.expires_at
  })
})

// POST /api/claim/verify - Complete verification (checks for tweet)
claimRoute.post('/verify', async (c) => {
  const walletAddress = c.req.header('X-Wallet-Address')
  if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42) {
    return c.json({ error: 'INVALID_WALLET', message: 'Valid X-Wallet-Address header required' }, 400)
  }

  const body = await c.req.json<{ x_handle?: string }>().catch(() => ({}))

  if (!body.x_handle) {
    return c.json({ 
      error: 'MISSING_HANDLE', 
      message: 'x_handle is required',
      hint: 'Provide your X/Twitter handle (without @)'
    }, 400)
  }

  const xHandle = body.x_handle.replace(/^@/, '').toLowerCase()

  const db = c.env.DB
  const bearerToken = c.env.X_BEARER_TOKEN

  // Get pending claim
  const claim = await db.prepare(
    'SELECT id, verification_code FROM verification_claims WHERE wallet = ? AND completed_at IS NULL AND expires_at > ?'
  ).bind(walletAddress, Math.floor(Date.now() / 1000)).first<{ id: number; verification_code: string }>()

  if (!claim) {
    return c.json({ 
      error: 'NO_PENDING_CLAIM', 
      message: 'No pending verification found. Start one with POST /api/claim/start'
    }, 400)
  }

  const now = Math.floor(Date.now() / 1000)
  let xUser: XUser | null = null
  let verified = false

  // If we have X API access, actually verify the tweet
  if (bearerToken) {
    // Search for tweets containing the verification code
    const tweets = await searchTweets(`"${claim.verification_code}" @clawfm`, bearerToken)
    
    if (tweets.length === 0) {
      return c.json({
        error: 'TWEET_NOT_FOUND',
        message: `Could not find a tweet with verification code "${claim.verification_code}"`,
        hint: 'Make sure you tweeted the verification code and try again in a few seconds'
      }, 400)
    }

    // Get user info for the tweet author
    const authorId = tweets[0].author_id
    xUser = await getUserById(authorId, bearerToken)

    if (!xUser) {
      return c.json({
        error: 'USER_LOOKUP_FAILED',
        message: 'Could not look up X user',
        hint: 'Try again in a moment'
      }, 500)
    }

    // Verify the handle matches
    if (xUser.username.toLowerCase() !== xHandle) {
      return c.json({
        error: 'HANDLE_MISMATCH',
        message: `Tweet was posted by @${xUser.username}, not @${xHandle}`,
        hint: 'Make sure you provided the correct X handle'
      }, 400)
    }

    verified = true
  } else {
    // No X API access - fall back to trust-based verification
    // Just look up the user to get their profile data
    console.warn('X_BEARER_TOKEN not configured - using trust-based verification')
    
    // Try to get user data anyway (will fail without token, that's ok)
    xUser = {
      id: '',
      username: xHandle,
      name: xHandle,
    }
    verified = true  // Trust-based
  }

  // Mark claim as completed
  await db.prepare(
    'UPDATE verification_claims SET completed_at = ? WHERE id = ?'
  ).bind(now, claim.id).run()

  // Update artist profile with X data
  await db.prepare(`
    UPDATE artist_profiles 
    SET x_id = ?, x_handle = ?, x_name = ?, x_avatar = ?, x_follower_count = ?, x_verified_at = ?, updated_at = ?
    WHERE wallet = ?
  `).bind(
    xUser?.id || null,
    xUser?.username || xHandle,
    xUser?.name || null,
    xUser?.profile_image_url || null,
    xUser?.public_metrics?.followers_count || null,
    now,
    now,
    walletAddress
  ).run()

  return c.json({
    success: true,
    message: bearerToken 
      ? 'Verification complete! Your X account is now linked. 🎉'
      : 'Verification complete! (Note: Tweet verification skipped - API key not configured)',
    x_handle: xUser?.username || xHandle,
    x_name: xUser?.name,
    x_avatar: xUser?.profile_image_url,
    x_follower_count: xUser?.public_metrics?.followers_count,
    verified_at: now,
    verified_via: bearerToken ? 'api' : 'trust'
  })
})

export default claimRoute
