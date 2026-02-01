import { fileTypeFromBlob } from 'file-type'
import { getAudioDuration } from '../lib/audio'
import { GENRES } from '@claw/shared'

export interface ValidationResult {
  valid: boolean
  errorCode?: string
  message?: string
  field?: string
  data?: {
    title: string
    genre: string
    description?: string
    tags?: string[]
    audioFile: File
    audioSize: number
    audioDuration: number // milliseconds
    imageFile?: File
  }
}

const MAX_AUDIO_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_AUDIO_DURATION = 600000 // 10 minutes in milliseconds
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 1000
const MAX_TAGS = 10
const MAX_TAG_LENGTH = 50

/**
 * Validate submission multipart data
 * Returns structured result with validation errors or parsed data
 */
export async function validateSubmission(body: any): Promise<ValidationResult> {
  // a. Check audio field exists and is a File
  if (!body.audio || !(body.audio instanceof File)) {
    return {
      valid: false,
      errorCode: 'MISSING_AUDIO',
      message: 'Audio file is required',
      field: 'audio',
    }
  }

  const audioFile = body.audio as File

  // b. Check title field exists, is non-empty string, max 200 chars
  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    return {
      valid: false,
      errorCode: 'MISSING_TITLE',
      message: 'Title is required',
      field: 'title',
    }
  }

  if (body.title.length > MAX_TITLE_LENGTH) {
    return {
      valid: false,
      errorCode: 'TITLE_TOO_LONG',
      message: `Title must be ${MAX_TITLE_LENGTH} characters or less`,
      field: 'title',
    }
  }

  const title = body.title.trim()

  // c. Check genre field exists and is in GENRES array
  if (!body.genre || typeof body.genre !== 'string') {
    return {
      valid: false,
      errorCode: 'MISSING_GENRE',
      message: 'Genre is required',
      field: 'genre',
    }
  }

  if (!GENRES.includes(body.genre as any)) {
    return {
      valid: false,
      errorCode: 'INVALID_GENRE',
      message: `Genre must be one of: ${GENRES.join(', ')}`,
      field: 'genre',
    }
  }

  const genre = body.genre

  // d. Validate audio file type via magic number
  const audioFileType = await fileTypeFromBlob(audioFile)

  if (!audioFileType || audioFileType.mime !== 'audio/mpeg') {
    return {
      valid: false,
      errorCode: 'INVALID_AUDIO_TYPE',
      message: 'Audio file must be MP3 format',
      field: 'audio',
    }
  }

  // e. Validate audio file size: max 50MB
  if (audioFile.size > MAX_AUDIO_SIZE) {
    return {
      valid: false,
      errorCode: 'FILE_TOO_LARGE',
      message: `Audio file must be ${MAX_AUDIO_SIZE / 1024 / 1024}MB or less`,
      field: 'audio',
    }
  }

  // f. Extract audio duration using getAudioDuration: max 10 minutes
  let audioDuration: number
  try {
    const audioBuffer = await audioFile.arrayBuffer()
    audioDuration = getAudioDuration(audioBuffer)

    if (audioDuration > MAX_AUDIO_DURATION) {
      return {
        valid: false,
        errorCode: 'DURATION_TOO_LONG',
        message: `Audio duration must be ${MAX_AUDIO_DURATION / 60000} minutes or less`,
        field: 'audio',
      }
    }
  } catch (error) {
    return {
      valid: false,
      errorCode: 'INVALID_AUDIO_FILE',
      message: `Failed to process audio file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      field: 'audio',
    }
  }

  // g. If image field is a File, validate image type and size
  let imageFile: File | undefined
  if (body.image && body.image instanceof File) {
    const imageFileType = await fileTypeFromBlob(body.image)

    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!imageFileType || !allowedImageTypes.includes(imageFileType.mime)) {
      return {
        valid: false,
        errorCode: 'INVALID_IMAGE_TYPE',
        message: 'Cover image must be JPEG, PNG, or WebP format',
        field: 'image',
      }
    }

    if (body.image.size > MAX_IMAGE_SIZE) {
      return {
        valid: false,
        errorCode: 'IMAGE_TOO_LARGE',
        message: `Cover image must be ${MAX_IMAGE_SIZE / 1024 / 1024}MB or less`,
        field: 'image',
      }
    }

    imageFile = body.image
  }

  // h. Parse tags field if present
  let tags: string[] | undefined
  if (body.tags) {
    try {
      // Accept comma-separated string or JSON array string
      if (typeof body.tags === 'string') {
        // Try parsing as JSON first
        try {
          tags = JSON.parse(body.tags)
        } catch {
          // Fall back to comma-separated
          tags = body.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
        }
      } else if (Array.isArray(body.tags)) {
        tags = body.tags
      }

      if (tags) {
        if (tags.length > MAX_TAGS) {
          return {
            valid: false,
            errorCode: 'INVALID_TAGS',
            message: `Maximum ${MAX_TAGS} tags allowed`,
            field: 'tags',
          }
        }

        for (const tag of tags) {
          if (typeof tag !== 'string' || tag.length > MAX_TAG_LENGTH) {
            return {
              valid: false,
              errorCode: 'INVALID_TAGS',
              message: `Each tag must be ${MAX_TAG_LENGTH} characters or less`,
              field: 'tags',
            }
          }
        }
      }
    } catch (error) {
      return {
        valid: false,
        errorCode: 'INVALID_TAGS',
        message: 'Tags must be a comma-separated string or JSON array',
        field: 'tags',
      }
    }
  }

  // i. description is optional, max 1000 chars
  let description: string | undefined
  if (body.description) {
    if (typeof body.description !== 'string') {
      return {
        valid: false,
        errorCode: 'INVALID_DESCRIPTION',
        message: 'Description must be a string',
        field: 'description',
      }
    }

    if (body.description.length > MAX_DESCRIPTION_LENGTH) {
      return {
        valid: false,
        errorCode: 'DESCRIPTION_TOO_LONG',
        message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`,
        field: 'description',
      }
    }

    description = body.description.trim()
  }

  // All validation passed
  return {
    valid: true,
    data: {
      title,
      genre,
      description,
      tags,
      audioFile,
      audioSize: audioFile.size,
      audioDuration,
      imageFile,
    },
  }
}
