import { useEffect, useCallback, useRef } from 'react'
import ReactCanvasConfetti from 'react-canvas-confetti'
import type { TCanvasConfettiInstance } from 'react-canvas-confetti/dist/types'

interface ConfettiCelebrationProps {
  fire: boolean
}

export function ConfettiCelebration({ fire }: ConfettiCelebrationProps) {
  const refAnimationInstance = useRef<TCanvasConfettiInstance | null>(null)

  const onInitHandler = useCallback(({ confetti }: { confetti: TCanvasConfettiInstance }) => {
    refAnimationInstance.current = confetti
  }, [])

  useEffect(() => {
    if (fire && refAnimationInstance.current) {
      refAnimationInstance.current({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899']
      })
    }
  }, [fire])

  return (
    <ReactCanvasConfetti
      onInit={onInitHandler}
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        zIndex: 9999
      }}
    />
  )
}
