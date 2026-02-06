/**
 * Simple deterministic identicon generator
 * Creates a unique 5x5 pattern based on a seed string
 */

interface IdenticonProps {
  seed: string
  size?: number
  className?: string
}

// Simple hash function
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// Generate HSL color from hash
function hashToColor(hash: number): string {
  const hue = hash % 360
  return `hsl(${hue}, 65%, 55%)`
}

// Generate background color (darker variant)
function hashToBgColor(hash: number): string {
  const hue = hash % 360
  return `hsl(${hue}, 30%, 20%)`
}

export function Identicon({ seed, size = 48, className = '' }: IdenticonProps) {
  const hash = hashCode(seed)
  const fgColor = hashToColor(hash)
  const bgColor = hashToBgColor(hash)
  
  // Generate 5x5 grid pattern (mirrored for symmetry)
  // We only need to generate 3 columns, mirror for the other 2
  const pattern: boolean[][] = []
  let bitIndex = 0
  
  for (let y = 0; y < 5; y++) {
    const row: boolean[] = []
    for (let x = 0; x < 3; x++) {
      // Use different bits of the hash
      const bit = (hash >> (bitIndex % 32)) & 1
      row.push(bit === 1)
      bitIndex += 7 // Prime number for better distribution
    }
    // Mirror: [0,1,2] -> [0,1,2,1,0]
    pattern.push([row[0], row[1], row[2], row[1], row[0]])
  }
  
  const cellSize = size / 5
  
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ borderRadius: '4px' }}
    >
      <rect width={size} height={size} fill={bgColor} />
      {pattern.map((row, y) =>
        row.map((filled, x) =>
          filled ? (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill={fgColor}
            />
          ) : null
        )
      )}
    </svg>
  )
}
