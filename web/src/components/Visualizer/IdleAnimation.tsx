/**
 * IdleAnimation.tsx
 *
 * Generates synthetic waveform data for gentle breathing/drift animation when audio is paused.
 * This is NOT a React component - it's a pure utility function that fills a Uint8Array buffer
 * with animated sine wave values to create a subtle "alive" effect when no audio is playing.
 */

/**
 * Fills dataArray with gentle breathing sine wave pattern for idle state
 *
 * @param dataArray - Uint8Array buffer to fill (0-255 range, 128 = center)
 * @param bufferLength - Number of samples to generate
 * @param time - Monotonic time in seconds (e.g., performance.now() / 1000)
 */
export function generateIdleWaveform(
  dataArray: Uint8Array<ArrayBuffer>,
  bufferLength: number,
  time: number
): void {
  // Breathing effect: amplitude oscillates gently between 1 and 5
  const breathingAmplitude = 3 + 2 * Math.sin(time * 0.5);

  // Two full sine waves across the width
  const frequency = 2 * Math.PI * 2;

  // Slow drift: wave moves laterally over time
  const phase = time * 0.3;

  for (let i = 0; i < bufferLength; i++) {
    // Base value at center (128 in 0-255 range)
    const baseValue = 128;

    // Add subtle sine wave oscillation
    const offset = breathingAmplitude * Math.sin(frequency * i / bufferLength + phase);

    // Clamp to valid Uint8Array range
    dataArray[i] = Math.max(0, Math.min(255, baseValue + offset));
  }
}
