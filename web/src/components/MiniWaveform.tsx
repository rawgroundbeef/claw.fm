interface MiniWaveformProps {
  peaks: number[]
  height?: number
  barCount?: number
  color?: string
}

/** 3-point moving average for smoother waveform shape */
function smoothPeaks(raw: number[], passes = 1): number[] {
  let arr = raw.slice()
  for (let p = 0; p < passes; p++) {
    const next = new Array(arr.length)
    for (let i = 0; i < arr.length; i++) {
      const prev = arr[i - 1] ?? arr[i]
      const nxt = arr[i + 1] ?? arr[i]
      next[i] = prev * 0.25 + arr[i] * 0.5 + nxt * 0.25
    }
    arr = next
  }
  return arr
}

export function MiniWaveform({ peaks, height = 24, barCount = 50, color = 'var(--text-faint)' }: MiniWaveformProps) {
  const step = peaks.length / barCount
  const gap = 1.5
  const barW = 2
  const vbWidth = barCount * (barW + gap) - gap
  const radius = barW / 2

  // Resample then smooth
  const sampled = Array.from({ length: barCount }, (_, i) => {
    const idx = Math.min(Math.floor(i * step), peaks.length - 1)
    return peaks[idx] ?? 0.1
  })
  const smooth = smoothPeaks(sampled, 2)

  return (
    <svg
      viewBox={`0 0 ${vbWidth} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: `${height}px` }}
    >
      {smooth.map((amp, i) => {
        const barH = Math.max(1, amp * (height - 2))
        const x = i * (barW + gap)
        const y = (height - barH) / 2
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={radius}
            ry={radius}
            fill={color}
          />
        )
      })}
    </svg>
  )
}
