import * as blockies from 'blockies-ts'

/**
 * Generate a deterministic identicon from a wallet address
 * @param walletAddress - Ethereum wallet address
 * @returns Data URL (PNG base64) of the identicon image
 */
export function generateIdenticon(walletAddress: string): string {
  // blockies-ts generates a canvas-based identicon
  // In Cloudflare Workers, we need to handle this differently
  // The library returns a data URL from the canvas

  try {
    // Create identicon with normalized wallet address as seed
    const iconDataUrl = blockies.create({
      seed: walletAddress.toLowerCase(),
      size: 8, // 8x8 grid
      scale: 8, // Each cell is 8x8 pixels, resulting in 64x64 image
    }).toDataURL()

    return iconDataUrl
  } catch (error) {
    // Fallback: create a simple SVG identicon if blockies-ts fails
    // This can happen if the library requires browser APIs not available in Workers
    return generateSvgIdenticon(walletAddress)
  }
}

/**
 * Fallback SVG identicon generator
 * Creates a simple deterministic SVG from wallet address hash
 */
function generateSvgIdenticon(walletAddress: string): string {
  // Generate deterministic colors from wallet address
  const normalized = walletAddress.toLowerCase().replace(/^0x/, '')
  const hue1 = parseInt(normalized.slice(0, 2), 16)
  const hue2 = parseInt(normalized.slice(2, 4), 16)
  const saturation = 60 + (parseInt(normalized.slice(4, 6), 16) % 40)
  const lightness = 40 + (parseInt(normalized.slice(6, 8), 16) % 30)

  // Generate 8x8 grid pattern from wallet hash
  const pattern = []
  for (let i = 0; i < 32; i++) {
    const byte = parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
    pattern.push(byte)
  }

  // Create SVG with 8x8 grid (mirrored for symmetry)
  const cells = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const index = (y * 4 + x) % 32
      if (pattern[index] % 2 === 0) {
        cells.push(`<rect x="${x * 8}" y="${y * 8}" width="8" height="8"/>`)
        cells.push(`<rect x="${(7 - x) * 8}" y="${y * 8}" width="8" height="8"/>`)
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="hsl(${hue2}, ${saturation}%, ${lightness + 20}%)"/>
    <g fill="hsl(${hue1}, ${saturation}%, ${lightness}%)">
      ${cells.join('')}
    </g>
  </svg>`

  // Convert SVG to data URL
  const base64 = btoa(svg)
  return `data:image/svg+xml;base64,${base64}`
}
