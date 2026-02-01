import { fileTypeFromBlob } from 'file-type'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * Process and upload cover art image to R2 storage
 * @param imageFile - Image file from multipart upload
 * @param trackId - Track ID to use in R2 key path
 * @param bucket - R2 bucket binding
 * @returns R2 key path (e.g., "covers/123.jpg")
 * @throws Error if validation fails or upload fails
 */
export async function processAndUploadCoverArt(
  imageFile: File,
  trackId: number,
  bucket: R2Bucket
): Promise<string> {
  // Validate image type using magic number
  const fileType = await fileTypeFromBlob(imageFile)

  if (!fileType || !ALLOWED_IMAGE_TYPES.includes(fileType.mime)) {
    throw new Error(
      `Invalid image type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`
    )
  }

  // Validate image size
  if (imageFile.size > MAX_IMAGE_SIZE) {
    throw new Error(
      `Image too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
    )
  }

  // Determine file extension from detected type
  const extension = fileType.ext

  // Generate R2 key path
  const key = `covers/${trackId}.${extension}`

  // Upload to R2 using streaming (no memory buffering)
  await bucket.put(key, imageFile.stream(), {
    httpMetadata: {
      contentType: fileType.mime,
    },
  })

  return key
}
