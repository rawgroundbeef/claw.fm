/**
 * Hash a file using SHA-256 with streaming to avoid loading entire file in memory
 * @param file - File object to hash
 * @returns Hex string representation of SHA-256 hash
 */
export async function hashFile(file: File): Promise<string> {
  // Use Cloudflare Workers DigestStream API
  // @ts-ignore - DigestStream may not be in current types version
  const digestStream = new crypto.DigestStream('SHA-256')

  // Pipe file stream through digest
  await file.stream().pipeTo(digestStream)

  // Get the digest as ArrayBuffer
  const digest = await digestStream.digest

  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(digest))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  return hashHex
}
