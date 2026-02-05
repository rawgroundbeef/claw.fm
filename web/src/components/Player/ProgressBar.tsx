import { useRef, useEffect } from 'react'

interface ProgressBarProps {
  currentTime: number
  duration: number
  analyser: AnalyserNode | null
  isPlaying: boolean
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
  const propsRef = useRef({ currentTime, duration, analyser, isPlaying })
  const colorsRef = useRef({ accent: '#ff6b4a', muted: '#333333' })
  const freqData = useRef<Uint8Array | null>(null)

  // Keep props ref current without restarting the loop
  propsRef.current = { currentTime, duration, analyser, isPlaying }

  // Read CSS variables once on mount + theme changes
  useEffect(() => {
    const read = () => {
      const el = canvasRef.current
      if (!el) return
      const s = getComputedStyle(el)
      colorsRef.current.accent = s.getPropertyValue('--accent').trim() || '#ff6b4a'
      colorsRef.current.muted = s.getPropertyValue('--text-faint').trim() || '#333333'
    }
    read()
    // Re-read when class changes on root (theme toggle)
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Single stable animation loop
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }

      const ctx = canvas.getContext('2d')
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return }

      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = CANVAS_H

      if (w === 0) { rafRef.current = requestAnimationFrame(draw); return }

      // Resize canvas backing store if needed
      const targetW = Math.round(w * dpr)
      const targetH = Math.round(h * dpr)
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }

      // Use scaling via setTransform each frame (avoids accumulated scale)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const { currentTime: ct, duration: dur, analyser: an, isPlaying: playing } = propsRef.current
      const progress = dur > 0 ? Math.min(ct / dur, 1) : 0
      const progressX = progress * w

      // Get frequency data
      if (an) {
        if (!freqData.current || freqData.current.length !== an.frequencyBinCount) {
          freqData.current = new Uint8Array(an.frequencyBinCount)
        }
        an.getByteFrequencyData(freqData.current as Uint8Array<ArrayBuffer>)
      }

      const { accent, muted } = colorsRef.current
      const barW = (w - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT

      for (let i = 0; i < BAR_COUNT; i++) {
        const x = i * (barW + BAR_GAP)

        let amp = 0
        if (freqData.current && playing) {
          const binStart = Math.floor((i / BAR_COUNT) * freqData.current.length * 0.5)
          const binEnd = Math.floor(((i + 1) / BAR_COUNT) * freqData.current.length * 0.5)
          let sum = 0
          let count = 0
          for (let b = binStart; b < binEnd && b < freqData.current.length; b++) {
            sum += freqData.current[b]
            count++
          }
          amp = count > 0 ? sum / count / 255 : 0
        }

        const barH = Math.max(BAR_MIN_H, BAR_MIN_H + amp * (h - BAR_MIN_H - 4))
        const y = (h - barH) / 2
        const barCenter = x + barW / 2

        ctx.fillStyle = barCenter <= progressX ? accent : muted
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(barW), Math.round(barH))
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])  // empty deps — loop runs once, reads from refs

  const remaining = duration - currentTime

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
