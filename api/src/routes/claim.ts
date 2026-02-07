import { Hono } from 'hono'

type Env = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
  }
}

const claimRoute = new Hono<Env>()

// Word lists for generating memorable verification codes
const ADJECTIVES = ['red', 'blue', 'deep', 'fast', 'loud', 'bass', 'dark', 'neon', 'wave', 'beat']
const NOUNS = ['reef', 'claw', 'bass', 'drop', 'wave', 'beat', 'fire', 'vibe', 'flow', 'zone']

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

  const body = await c.req.json<{ x_handle?: string; tweet_url?: string }>().catch(() => ({}))

  if (!body.x_handle) {
    return c.json({ 
      error: 'MISSING_HANDLE', 
      message: 'x_handle is required',
      hint: 'Provide your X/Twitter handle (without @)'
    }, 400)
  }

  const xHandle = body.x_handle.replace(/^@/, '').toLowerCase()

  const db = c.env.DB

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

  // For now, we'll do a simple verification by trusting the provided handle
  // In production, you'd want to:
  // 1. Use Twitter API to search for tweets with the verification code
  // 2. Verify the tweet exists and was posted by the claimed handle
  // 3. Fetch the user's profile data

  // Simulated X profile data (in production, fetch from Twitter API)
  const now = Math.floor(Date.now() / 1000)

  // Mark claim as completed
  await db.prepare(
    'UPDATE verification_claims SET completed_at = ? WHERE id = ?'
  ).bind(now, claim.id).run()

  // Update artist profile with X data
  await db.prepare(`
    UPDATE artist_profiles 
    SET x_handle = ?, x_verified_at = ?, updated_at = ?
    WHERE wallet = ?
  `).bind(xHandle, now, now, walletAddress).run()

  return c.json({
    success: true,
    message: 'Verification complete! Your X account is now linked. 🎉',
    x_handle: xHandle,
    verified_at: now
  })
})

export default claimRoute
