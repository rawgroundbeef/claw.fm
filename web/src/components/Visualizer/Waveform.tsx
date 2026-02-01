/**
 * Waveform.tsx
 *
 * Canvas-based waveform visualizer component that displays live audio waveform when playing
 * or gentle breathing animation when paused. All rendering logic is delegated to the
 * useVisualizer hook - this component is purely a canvas wrapper.
 */

import { useRef } from 'react';
import { useVisualizer } from '../../hooks/useVisualizer';

interface WaveformProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
  className?: string;
}

export function Waveform({ analyserNode, isPlaying, className = '' }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hook handles all animation logic
  useVisualizer({
    analyserNode,
    canvasRef,
    isPlaying,
    // Default brand color '#0066FF' (electric) is set in hook
  });

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
