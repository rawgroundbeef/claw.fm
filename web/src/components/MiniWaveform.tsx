interface MiniWaveformProps {
  peaks: number[]
  height?: number
  barCount?: number
  color?: string
}

export function MiniWaveform({ peaks, height = 24, barCount = 50, color = 'var(--text-faint)' }: MiniWaveformProps) {
  const step = peaks.length / barCount
  const gap = 1
  const barW = 1.5
  const vbWidth = barCount * (barW + gap) - gap

  return (
    <svg
      viewBox={`0 0 ${vbWidth} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: `${height}px` }}
    >
      {Array.from({ length: barCount }, (_, i) => {
        const idx = Math.min(Math.floor(i * step), peaks.length - 1)
        const amp = peaks[idx] ?? 0.1
        const barH = Math.max(0.5, amp * (height - 2))
        const x = i * (barW + gap)
        const y = (height - barH) / 2
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            fill={color}
          />
        )
      })}
    </svg>
  )
}
