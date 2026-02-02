// Generate HMAC-signed download URL
// Token = HMAC-SHA256(secret, trackKey:expiresAt)
export async function generateDownloadToken(
  trackKey: string,
  expiresAt: number,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const data = encoder.encode(`${trackKey}:${expiresAt}`)
  const signature = await crypto.subtle.sign('HMAC', key, data)
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') // URL-safe base64
}

export async function verifyDownloadToken(
  trackKey: string,
  expiresAt: number,
  token: string,
  secret: string
): Promise<boolean> {
  const expected = await generateDownloadToken(trackKey, expiresAt, secret)
  return token === expected
}
