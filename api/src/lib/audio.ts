// @ts-ignore - No type definitions available
import getMP3Duration from 'get-mp3-duration'

/**
 * Extract audio duration from an MP3 file buffer
 * @param buffer - ArrayBuffer containing MP3 file data
 * @returns Duration in milliseconds
 * @throws Error if duration cannot be extracted
 */
export function getAudioDuration(buffer: ArrayBuffer): number {
  try {
    // Try get-mp3-duration first (may not work in Workers runtime)
    const uint8Array = new Uint8Array(buffer)
    const duration = getMP3Duration(uint8Array)

    if (!duration || duration <= 0) {
      throw new Error('Invalid or zero duration extracted from audio file')
    }

    return duration
  } catch (error) {
    // Fallback to manual MP3 frame parsing if get-mp3-duration fails
    // This is needed for Cloudflare Workers which lacks Node.js Buffer methods
    try {
      return parseMP3DurationManually(buffer)
    } catch (fallbackError) {
      throw new Error(
        `Failed to extract audio duration: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
}

/**
 * Fallback MP3 duration parser for Cloudflare Workers
 * Parses MP3 frame headers to calculate duration
 */
function parseMP3DurationManually(buffer: ArrayBuffer): number {
  const data = new Uint8Array(buffer)

  // MP3 bitrate table (kbps) indexed by [version][layer][bitrate_index]
  const bitrates: Record<string, number[]> = {
    'V1L1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    'V1L2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    'V1L3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    'V2L1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    'V2L2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    'V2L3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  }

  // Sample rates indexed by [version][sample_rate_index]
  const sampleRates: Record<string, number[]> = {
    'V1': [44100, 48000, 32000],
    'V2': [22050, 24000, 16000],
    'V25': [11025, 12000, 8000],
  }

  let offset = 0
  let totalFrames = 0
  let sampleRate = 0

  // Skip ID3v2 tag if present
  if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    const tagSize =
      ((data[6] & 0x7f) << 21) |
      ((data[7] & 0x7f) << 14) |
      ((data[8] & 0x7f) << 7) |
      (data[9] & 0x7f)
    offset = 10 + tagSize
  }

  // Parse MP3 frames
  while (offset < data.length - 4) {
    // Look for frame sync (11 bits set to 1)
    if (data[offset] !== 0xff || (data[offset + 1] & 0xe0) !== 0xe0) {
      offset++
      continue
    }

    const header =
      (data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]

    // Extract header fields
    const version = (header >> 19) & 0x03
    const layer = (header >> 17) & 0x03
    const bitrateIndex = (header >> 12) & 0x0f
    const sampleRateIndex = (header >> 10) & 0x03
    const padding = (header >> 9) & 0x01

    // Skip invalid frames
    if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      offset++
      continue
    }

    // Map version and layer
    const versionKey = version === 3 ? 'V1' : (version === 2 ? 'V2' : 'V25')
    const layerKey = layer === 3 ? 'L1' : (layer === 2 ? 'L2' : 'L3')
    const bitrateKey = `${versionKey}${layerKey}`

    const bitrate = bitrates[bitrateKey]?.[bitrateIndex]
    if (!bitrate) {
      offset++
      continue
    }

    if (!sampleRate) {
      sampleRate = sampleRates[versionKey]?.[sampleRateIndex] || 0
    }

    // Calculate frame size
    const samplesPerFrame = layer === 3 ? 384 : 1152
    const frameSize = Math.floor((samplesPerFrame * bitrate * 1000 / 8) / sampleRate) + padding

    if (frameSize <= 0 || offset + frameSize > data.length) {
      break
    }

    totalFrames++
    offset += frameSize
  }

  if (totalFrames === 0 || sampleRate === 0) {
    throw new Error('No valid MP3 frames found')
  }

  // Calculate duration: each frame is 1152 samples (Layer 2/3) or 384 samples (Layer 1)
  // Duration = (frames * samples_per_frame / sample_rate) * 1000 ms
  const samplesPerFrame = 1152 // Most common (Layer 3)
  const durationMs = Math.floor((totalFrames * samplesPerFrame / sampleRate) * 1000)

  if (durationMs <= 0) {
    throw new Error('Calculated duration is invalid')
  }

  return durationMs
}

/**
 * Extract waveform peaks from MP3 buffer for visualization.
 * Computes per-frame energy by averaging byte magnitudes in each frame's
 * audio data, then downsamples to the requested number of bars.
 * Works in Cloudflare Workers (no AudioContext needed).
 *
 * @param buffer - ArrayBuffer containing MP3 data
 * @param barCount - Number of output bars (default 80)
 * @returns Array of normalized amplitudes (0-1), or null on failure
 */
export function extractWaveformPeaks(buffer: ArrayBuffer, barCount = 80): number[] | null {
  const data = new Uint8Array(buffer)

  const bitrates: Record<string, number[]> = {
    'V1L1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    'V1L2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    'V1L3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    'V2L1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    'V2L2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    'V2L3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  }

  const sampleRates: Record<string, number[]> = {
    'V1': [44100, 48000, 32000],
    'V2': [22050, 24000, 16000],
    'V25': [11025, 12000, 8000],
  }

  let offset = 0

  // Skip ID3v2 tag
  if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    const tagSize =
      ((data[6] & 0x7f) << 21) |
      ((data[7] & 0x7f) << 14) |
      ((data[8] & 0x7f) << 7) |
      (data[9] & 0x7f)
    offset = 10 + tagSize
  }

  // Collect per-frame energy values
  const frameEnergies: number[] = []

  while (offset < data.length - 4) {
    if (data[offset] !== 0xff || (data[offset + 1] & 0xe0) !== 0xe0) {
      offset++
      continue
    }

    const header =
      (data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]

    const version = (header >> 19) & 0x03
    const layer = (header >> 17) & 0x03
    const bitrateIndex = (header >> 12) & 0x0f
    const sampleRateIndex = (header >> 10) & 0x03
    const padding = (header >> 9) & 0x01

    if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      offset++
      continue
    }

    const versionKey = version === 3 ? 'V1' : (version === 2 ? 'V2' : 'V25')
    const layerKey = layer === 3 ? 'L1' : (layer === 2 ? 'L2' : 'L3')
    const bitrateKey = `${versionKey}${layerKey}`

    const bitrate = bitrates[bitrateKey]?.[bitrateIndex]
    if (!bitrate) { offset++; continue }

    const sr = sampleRates[versionKey]?.[sampleRateIndex] || 0
    if (!sr) { offset++; continue }

    const samplesPerFrame = layer === 3 ? 384 : 1152
    const frameSize = Math.floor((samplesPerFrame * bitrate * 1000 / 8) / sr) + padding

    if (frameSize <= 4 || offset + frameSize > data.length) break

    // Compute energy: average of absolute byte deviation from 128 in frame body
    let sum = 0
    const bodyStart = offset + 4
    const bodyEnd = offset + frameSize
    const sampleStep = Math.max(1, Math.floor((bodyEnd - bodyStart) / 32))
    let count = 0
    for (let i = bodyStart; i < bodyEnd; i += sampleStep) {
      sum += Math.abs(data[i] - 128)
      count++
    }
    frameEnergies.push(count > 0 ? sum / count : 0)

    offset += frameSize
  }

  if (frameEnergies.length === 0) return null

  // Downsample frame energies to barCount bars using RMS for better dynamic range
  const peaks: number[] = new Array(barCount)
  const framesPerBar = frameEnergies.length / barCount

  for (let i = 0; i < barCount; i++) {
    const start = Math.floor(i * framesPerBar)
    const end = Math.floor((i + 1) * framesPerBar)
    let sumSquares = 0
    let count = 0
    for (let j = start; j < end && j < frameEnergies.length; j++) {
      sumSquares += frameEnergies[j] * frameEnergies[j]
      count++
    }
    peaks[i] = count > 0 ? Math.sqrt(sumSquares / count) : 0
  }

  // Normalize to 0-1
  let globalMax = 0
  for (let i = 0; i < barCount; i++) {
    if (peaks[i] > globalMax) globalMax = peaks[i]
  }
  if (globalMax > 0) {
    for (let i = 0; i < barCount; i++) {
      peaks[i] = Math.round((peaks[i] / globalMax) * 100) / 100
    }
  }

  return peaks
}
