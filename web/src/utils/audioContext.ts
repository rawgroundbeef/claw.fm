/**
 * Singleton AudioContext for the application.
 *
 * Web Audio API requires a single AudioContext instance per application.
 * Multiple contexts can cause performance issues and resource contention.
 */

let audioContext: AudioContext | null = null

/**
 * Get the singleton AudioContext instance.
 * Creates the context on first call.
 */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

/**
 * Resume the AudioContext if it's suspended.
 *
 * Browsers require user interaction before playing audio (autoplay policy).
 * Call this inside a click handler before attempting audio playback.
 *
 * @returns Promise that resolves when context is running
 */
export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
}
