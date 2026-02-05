import { useRef, useEffect, useState, useCallback } from 'react'
import { getAudioContext } from '../../utils/audioContext'
import { API_URL } from '../../lib/constants'

interface ProgressBarProps {
  currentTime: number
  duration: number
  analyser: AnalyserNode | null
  isPlaying: boolean
  trackId?: number  // for uploading client-computed peaks
  fileUrl?: string  // track file URL for waveform decode
  waveformPeaks?: number[]  // pre-computed peaks from API (skips client-side decode)
  onSeek?: (time: number) => void
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const BAR_W = 2       // fixed thin bar width in CSS px
const BAR_GAP = 1.5   // gap between bars
const BAR_MIN_H = 2
const CANVAS_H = 40
const UPLOAD_BAR_COUNT = 120 // resolution for server-stored peaks

/** Downsample audio buffer to peak amplitudes */
function extractPeaks(buffer: AudioBuffer, barCount: number): Float32Array {
  const channel = buffer.getChannelData(0)
  const peaks = new Float32Array(barCount)
  const samplesPerBar = Math.floor(channel.length / barCount)

  for (let i = 0; i < barCount; i++) {
    let max = 0
    const start = i * samplesPerBar
    const end = Math.min(start + samplesPerBar, channel.length)
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channel[j])
      if (abs > max) max = abs
    }
    peaks[i] = max
  }

  let globalMax = 0
  for (let i = 0; i < barCount; i++) {
    if (peaks[i] > globalMax) globalMax = peaks[i]
  }
  if (globalMax > 0) {
    for (let i = 0; i < barCount; i++) {
      peaks[i] /= globalMax
    }
  }

  return peaks
}

/** Resample source peaks array to target count */
function resamplePeaks(source: Float32Array | number[], targetCount: number): Float32Array {
  const out = new Float32Array(targetCount)
  const step = source.length / targetCount
  for (let i = 0; i < targetCount; i++) {
    out[i] = source[Math.min(Math.floor(i * step), source.length - 1)]
  }
  return out
}

// Cache decoded waveforms by URL (high-res source peaks)
const waveformCache = new Map<string, Float32Array>()

// Track IDs we've already uploaded peaks for (avoid duplicate PUTs)
const uploadedPeaks = new Set<number>()

export function ProgressBar({ currentTime, duration, analyser, isPlaying, trackId, fileUrl, waveformPeaks, onSeek }: ProgressBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const propsRef = useRef({ currentTime, duration, analyser, isPlaying })
  const colorsRef = useRef({ accent: '#ff6b4a', muted: '#333333' })
  const freqData = useRef<Uint8Array | null>(null)
  // Source peaks — high resolution, resampled per-frame to fit canvas width
  const [sourcePeaks, setSourcePeaks] = useState<Float32Array | null>(null)
  const sourcePeaksRef = useRef<Float32Array | null>(null)

  propsRef.current = { currentTime, duration, analyser, isPlaying }
  sourcePeaksRef.current = sourcePeaks

  // Load peaks: prefer API pre-computed, fallback to client decode
  useEffect(() => {
    if (waveformPeaks && waveformPeaks.length > 0) {
      setSourcePeaks(new Float32Array(waveformPeaks))
      return
    }

    if (!fileUrl) { setSourcePeaks(null); return }

    const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${API_URL}${fileUrl}`

    if (waveformCache.has(fullUrl)) {
      setSourcePeaks(waveformCache.get(fullUrl)!)
      return
    }

    let cancelled = false

    fetch(fullUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (cancelled) return
        const ctx = getAudioContext()
        return ctx.decodeAudioData(buf)
      })
      .then((decoded) => {
        if (cancelled || !decoded) return
        const p = extractPeaks(decoded, UPLOAD_BAR_COUNT)
        waveformCache.set(fullUrl, p)
        setSourcePeaks(p)

        // Upload PCM-derived peaks to server
        if (trackId && !uploadedPeaks.has(trackId)) {
          uploadedPeaks.add(trackId)
          const peaksArray = Array.from(p).map(v => Math.round(v * 100) / 100)
          fetch(`${API_URL}/api/tracks/${trackId}/waveform`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ peaks: peaksArray }),
          }).catch(() => {})
        }
      })
      .catch(() => {
        if (!cancelled) setSourcePeaks(null)
      })

    return () => { cancelled = true }
  }, [fileUrl, waveformPeaks])

  // Read CSS variables on mount + theme changes
  useEffect(() => {
    const read = () => {
      const el = canvasRef.current
      if (!el) return
      const s = getComputedStyle(el)
      colorsRef.current.accent = s.getPropertyValue('--accent').trim() || '#ff6b4a'
      colorsRef.current.muted = s.getPropertyValue('--text-faint').trim() || '#333333'
    }
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Animation loop — bar count derived from canvas width each frame
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

      const targetW = Math.round(w * dpr)
      const targetH = Math.round(h * dpr)
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const { currentTime: ct, duration: dur, analyser: an, isPlaying: playing } = propsRef.current
      const progress = dur > 0 ? Math.min(ct / dur, 1) : 0
      const progressX = progress * w

      // Compute how many bars fit at fixed width
      const barCount = Math.max(1, Math.floor((w + BAR_GAP) / (BAR_W + BAR_GAP)))

      // Get live frequency data
      if (an) {
        if (!freqData.current || freqData.current.length !== an.frequencyBinCount) {
          freqData.current = new Uint8Array(an.frequencyBinCount)
        }
        an.getByteFrequencyData(freqData.current as Uint8Array<ArrayBuffer>)
      }

      const { accent, muted } = colorsRef.current
      const src = sourcePeaksRef.current

      // Resample source peaks to current bar count
      let pk: Float32Array | null = null
      if (src) {
        pk = resamplePeaks(src, barCount)
      }

      for (let i = 0; i < barCount; i++) {
        const x = i * (BAR_W + BAR_GAP)

        const peakAmp = pk ? pk[i] : 0.15

        // Subtle live frequency boost on played bars
        let liveBoost = 0
        if (freqData.current && playing) {
          const barCenter = x + BAR_W / 2
          if (barCenter <= progressX) {
            const binIdx = Math.floor((i / barCount) * freqData.current.length * 0.4)
            liveBoost = (freqData.current[binIdx] / 255) * 0.15
          }
        }

        const totalAmp = Math.min(1, peakAmp + liveBoost)
        const barH = Math.max(BAR_MIN_H, totalAmp * (h - 4))
        const y = (h - barH) / 2

        const barCenter = x + BAR_W / 2
        ctx.fillStyle = barCenter <= progressX ? accent : muted
        ctx.fillRect(Math.round(x), Math.round(y), BAR_W, Math.round(barH))
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Click-to-seek handler
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || duration <= 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    onSeek(ratio * duration)
  }, [onSeek, duration])

  const remaining = duration - currentTime

  return (
    <div className="flex-1 min-w-0">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          width: '100%',
          height: `${CANVAS_H}px`,
          display: 'block',
          cursor: onSeek ? 'pointer' : 'default',
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
