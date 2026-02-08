/**
 * Twitter/X posting utility using OAuth 1.0a
 */

interface TwitterConfig {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
}

interface TweetResult {
  success: boolean
  tweetId?: string
  tweetUrl?: string
  error?: string
}

/**
 * Generate OAuth 1.0a signature for Twitter API requests
 */
function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  // Sort and encode parameters
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')

  // Create signature base string
  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&')

  // Create signing key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`

  // HMAC-SHA1 signature (using Web Crypto API)
  return hmacSha1(signingKey, signatureBase)
}

/**
 * HMAC-SHA1 implementation using Web Crypto API
 */
async function hmacSha1Async(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(key)
  const messageData = encoder.encode(message)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

// Synchronous wrapper using a simpler approach for OAuth
function hmacSha1(key: string, message: string): string {
  // For Workers, we need to use the async version
  // This is a placeholder - actual implementation uses async
  throw new Error('Use hmacSha1Async instead')
}

/**
 * Generate OAuth 1.0a Authorization header
 */
async function generateOAuthHeader(
  method: string,
  url: string,
  config: TwitterConfig,
  extraParams: Record<string, string> = {}
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.apiKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: config.accessToken,
    oauth_version: '1.0'
  }

  // Combine oauth params with any extra params for signature
  const allParams = { ...oauthParams, ...extraParams }

  // Sort and encode parameters for signature base string
  const sortedParams = Object.keys(allParams)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
    .join('&')

  // Create signature base string
  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&')

  // Create signing key
  const signingKey = `${encodeURIComponent(config.apiSecret)}&${encodeURIComponent(config.accessTokenSecret)}`

  // Generate signature
  const signature = await hmacSha1Async(signingKey, signatureBase)
  oauthParams.oauth_signature = signature

  // Build Authorization header
  const headerParams = Object.keys(oauthParams)
    .sort()
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
    .join(', ')

  return `OAuth ${headerParams}`
}

/**
 * Post a tweet to X/Twitter
 */
export async function postTweet(
  text: string,
  config: TwitterConfig
): Promise<TweetResult> {
  const url = 'https://api.twitter.com/2/tweets'

  console.log('[Twitter] Attempting to post tweet:', text.substring(0, 50) + '...')
  console.log('[Twitter] Using API key:', config.apiKey?.substring(0, 8) + '...')

  try {
    const authHeader = await generateOAuthHeader('POST', url, config)
    console.log('[Twitter] Generated OAuth header, making request...')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    })

    console.log('[Twitter] Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Twitter] API error:', response.status, errorText)
      return {
        success: false,
        error: `Twitter API error: ${response.status} - ${errorText}`
      }
    }

    const data = await response.json() as { data?: { id: string; text: string } }
    
    if (data.data?.id) {
      return {
        success: true,
        tweetId: data.data.id,
        tweetUrl: `https://x.com/claw_fm/status/${data.data.id}`
      }
    }

    return {
      success: false,
      error: 'Unexpected response format'
    }
  } catch (error) {
    console.error('Failed to post tweet:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Post a new track announcement
 */
export async function announceNewTrack(
  trackTitle: string,
  artistName: string,
  trackSlug: string,
  config: TwitterConfig
): Promise<TweetResult> {
  const trackUrl = `https://claw.fm/track/${trackSlug}`
  
  // Keep tweet concise - X has 280 char limit
  const tweet = `🎵 New track on claw.fm!\n\n"${trackTitle}" by ${artistName}\n\nListen now: ${trackUrl}`
  
  // Truncate if needed (shouldn't happen with reasonable titles)
  const truncatedTweet = tweet.length > 280 
    ? tweet.substring(0, 277) + '...'
    : tweet

  return postTweet(truncatedTweet, config)
}

/**
 * Check if Twitter posting is configured
 */
export function isTwitterConfigured(env: {
  X_API_KEY?: string
  X_API_SECRET?: string
  X_ACCESS_TOKEN?: string
  X_ACCESS_TOKEN_SECRET?: string
}): boolean {
  return !!(
    env.X_API_KEY &&
    env.X_API_SECRET &&
    env.X_ACCESS_TOKEN &&
    env.X_ACCESS_TOKEN_SECRET
  )
}

/**
 * Get Twitter config from environment
 */
export function getTwitterConfig(env: {
  X_API_KEY?: string
  X_API_SECRET?: string
  X_ACCESS_TOKEN?: string
  X_ACCESS_TOKEN_SECRET?: string
}): TwitterConfig | null {
  if (!isTwitterConfigured(env)) {
    return null
  }

  return {
    apiKey: env.X_API_KEY!,
    apiSecret: env.X_API_SECRET!,
    accessToken: env.X_ACCESS_TOKEN!,
    accessTokenSecret: env.X_ACCESS_TOKEN_SECRET!
  }
}
