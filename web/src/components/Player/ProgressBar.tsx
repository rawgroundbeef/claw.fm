import { useRef, useEffect, useCallback } from 'react'

interface ProgressBarProps {
  currentTime: number;   // seconds elapsed
  duration: number;      // total seconds
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const BAR_COUNT = 48
const BAR_GAP = 2
const BAR_MIN_H = 2
const CANVAS_H = 32

export function ProgressBar({ currentTime, duration, analyser, isPlaying }: ProgressBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const dataRef = useRef<Uint8Array | null>(null)
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0
  const remaining = duration - currentTime

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = CANVAS_H

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }

    // Get frequency data if analyser available
    if (analyser) {
      if (!dataRef.current || dataRef.current.length !== analyser.frequencyBinCount) {
        dataRef.current = new Uint8Array(analyser.frequencyBinCount)
      }
      analyser.getByteFrequencyData(dataRef.current as Uint8Array<ArrayBuffer>)
    }

    ctx.clearRect(0, 0, w, h)

    const barWidth = (w - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT
    const progressX = progress * w

    // Accent color from CSS
    const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#ff6b4a'
    const muted = getComputedStyle(canvas).getPropertyValue('--text-faint').trim() || '#333'

    for (let i = 0; i < BAR_COUNT; i++) {
      const x = i * (barWidth + BAR_GAP)

      let amplitude = 0
      if (dataRef.current && isPlaying) {
        // Map bar index to frequency bin range
        const binStart = Math.floor((i / BAR_COUNT) * dataRef.current.length * 0.5)
        const binEnd = Math.floor(((i + 1) / BAR_COUNT) * dataRef.current.length * 0.5)
        let sum = 0
        let count = 0
        for (let b = binStart; b < binEnd && b < dataRef.current.length; b++) {
          sum += dataRef.current[b]
          count++
        }
        amplitude = count > 0 ? sum / count / 255 : 0
      }

      const barH = BAR_MIN_H + amplitude * (h - BAR_MIN_H - 4)
      const y = (h - barH) / 2

      // Bar is "played" if its center is before the progress line
      const barCenter = x + barWidth / 2
      ctx.fillStyle = barCenter <= progressX ? accent : muted
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barH, 1)
      ctx.fill()
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [analyser, isPlaying, progress])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return (
    <div className="w-full max-w-md">
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: `${CANVAS_H}px`,
          display: 'block',
        }}
      />
      <div
        className="flex justify-between mt-1 tabular-nums"
        style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}
      >
        <span>{formatTime(currentTime)}</span>
        <span>{remaining > 0 ? `-${formatTime(remaining)}` : '0:00'}</span>
      </div>
    </div>
  )
}
