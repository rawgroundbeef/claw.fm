/**
 * Truncate bio text to a maximum length, preferring word boundaries.
 * Used server-side to keep KV cache payloads small and display consistent.
 */
export function truncateBio(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text
  }

  const truncated = text.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  const threshold = maxLength * 0.8

  if (lastSpace > threshold) {
    return truncated.slice(0, lastSpace) + '...'
  }

  return truncated + '...'
}
