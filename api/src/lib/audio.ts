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
    // get-mp3-duration expects a Buffer or Uint8Array
    const uint8Array = new Uint8Array(buffer)
    const duration = getMP3Duration(uint8Array)

    if (!duration || duration <= 0) {
      throw new Error('Invalid or zero duration extracted from audio file')
    }

    return duration
  } catch (error) {
    throw new Error(
      `Failed to extract audio duration: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
