/**
 * useVisualizer.ts
 *
 * Hook that drives the waveform animation loop, connecting the Web Audio API's AnalyserNode
 * to a Canvas 2D rendering context. Handles HiDPI displays, responsive resizing, and switches
 * between live audio data and idle animation based on playback state.
 */

import { useEffect, useRef } from 'react';
import { generateIdleWaveform } from '../components/Visualizer/IdleAnimation';

interface UseVisualizerProps {
  analyserNode: AnalyserNode | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isPlaying: boolean;
  color?: string; // defaults to '#0066FF' (electric brand color)
}

interface UseVisualizerReturn {
  isActive: boolean;
}

export function useVisualizer({
  analyserNode,
  canvasRef,
  isPlaying,
  color = '#0066FF',
}: UseVisualizerProps): UseVisualizerReturn {
  const animationFrameRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const isActiveRef = useRef(false);

  // Setup HiDPI canvas dimensions
  const setupCanvas = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set actual canvas buffer size (HiDPI aware)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    // Scale context to match
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize canvas dimensions
    setupCanvas(canvas);

    // Setup ResizeObserver for responsive canvas resizing
    const resizeObserver = new ResizeObserver(() => {
      setupCanvas(canvas);
    });
    resizeObserver.observe(canvas);

    // Initialize data buffer (create once, reuse)
    if (analyserNode && !dataArrayRef.current) {
      const buffer = new ArrayBuffer(analyserNode.frequencyBinCount);
      dataArrayRef.current = new Uint8Array(buffer);
    }

    // Animation loop
    const animate = () => {
      if (!canvas || !ctx || !dataArrayRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const bufferLength = dataArrayRef.current.length;

      // Get waveform data: live audio or idle animation
      if (isPlaying && analyserNode) {
        // Type assertion needed: Web Audio API expects Uint8Array<ArrayBuffer>
        analyserNode.getByteTimeDomainData(dataArrayRef.current as any);
      } else {
        // Paused state: generate gentle breathing animation
        const time = performance.now() / 1000;
        generateIdleWaveform(dataArrayRef.current, bufferLength, time);
      }

      // Clear canvas with transparent background
      ctx.clearRect(0, 0, width, height);

      // Setup line style
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw waveform line
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // Normalize value from 0-255 range to -1 to 1
        const v = dataArrayRef.current[i] / 128.0 - 1.0;

        // Calculate y position (centered vertically)
        const y = (v * height) / 2 + height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();

      // Continue loop
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation loop
    isActiveRef.current = true;
    animate();

    // Cleanup
    return () => {
      isActiveRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, [analyserNode, canvasRef, isPlaying, color]);

  return {
    isActive: isActiveRef.current,
  };
}
