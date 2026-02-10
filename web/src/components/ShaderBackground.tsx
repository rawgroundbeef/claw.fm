import { useEffect, useState, useRef } from 'react'
import { NeuroNoise, MeshGradient } from '@paper-design/shaders-react'

interface ShaderBackgroundProps {
  /** Which shader effect to render */
  variant?: 'neuro-noise' | 'mesh-gradient'
  /** Current theme for color adaptation */
  theme: 'dark' | 'light'
  /** Height of the shader area */
  height?: string
  /** Animation speed multiplier */
  speed?: number
}

// Color palettes per theme
const PALETTES = {
  dark: {
    neuroNoise: {
      colorFront: '#ff6b4a',  // coral highlight
      colorMid: '#cc4422',    // deeper red mid
      colorBack: '#1a0a06',   // warm black background
    },
    meshGradient: ['#ff6b4a', '#cc4422', '#991a0a', '#1a0a06'],
  },
  light: {
    neuroNoise: {
      colorFront: '#ff6b4a',  // coral highlight
      colorMid: '#ffa573',    // peach mid
      colorBack: '#faf5f0',   // warm white background
    },
    meshGradient: ['#ff6b4a', '#ffa573', '#ffb8a3', '#faf5f0'],
  },
}

export function ShaderBackground({
  variant = 'neuro-noise',
  theme,
  height = '55vh',
  speed = 0.15,
}: ShaderBackgroundProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // Check WebGL support
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      setIsSupported(!!gl)
    } catch {
      setIsSupported(false)
    }
  }, [])

  // Pause animation when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      setIsVisible(document.visibilityState === 'visible')
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])


  // If WebGL not supported, fall back to CSS gradient
  if (!isSupported) {
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height,
          zIndex: 0,
          background: 'radial-gradient(ellipse 800px 600px at center 20%, var(--accent-dim) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
    )
  }

  const palette = PALETTES[theme]
  const shouldAnimate = isVisible && !prefersReducedMotion
  const animationSpeed = shouldAnimate ? speed : 0

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100vw',
        height,
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {/* Shader canvas */}
      <div style={{ width: '100%', height: '100%' }}>
        {variant === 'neuro-noise' && (
          <NeuroNoise
            colorFront={palette.neuroNoise.colorFront}
            colorMid={palette.neuroNoise.colorMid}
            colorBack={palette.neuroNoise.colorBack}
            brightness={0.5}
            contrast={0.7}
            scale={1.5}
            speed={animationSpeed}
            style={{ width: '100%', height: '100%' }}
          />
        )}
        {variant === 'mesh-gradient' && (
          <MeshGradient
            colors={palette.meshGradient}
            distortion={0.4}
            swirl={0.3}
            speed={animationSpeed * 2}
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>

      {/* Fade overlay - blends shader into page background */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60%',
          background: `linear-gradient(to bottom, transparent 0%, var(--bg-primary) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
