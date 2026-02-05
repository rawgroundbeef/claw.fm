interface MiniWaveformProps {
  peaks: number[]
  width?: number
  height?: number
  barCount?: number
  color?: string
}

export function MiniWaveform({ peaks, width = 60, height = 24, barCount = 20, color = 'var(--text-faint)' }: MiniWaveformProps) {
  const step = peaks.length / barCount
  const gap = 1
  const barW = (width - (barCount - 1) * gap) / barCount
  const minH = 1

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', flexShrink: 0 }}>
      {Array.from({ length: barCount }, (_, i) => {
        const idx = Math.min(Math.floor(i * step), peaks.length - 1)
        const amp = peaks[idx] ?? 0.1
        const barH = Math.max(minH, amp * (height - 2))
        const x = i * (barW + gap)
        const y = (height - barH) / 2
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={0.5}
            fill={color}
          />
        )
      })}
    </svg>
  )
}
