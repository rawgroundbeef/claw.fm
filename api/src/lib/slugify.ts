/**
 * Convert a track title to a URL-safe slug
 * - lowercase
 * - replace spaces and non-alphanumeric with hyphens
 * - collapse multiple hyphens
 * - trim leading/trailing hyphens
 * - max 80 characters
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')             // Collapse multiple hyphens
    .replace(/^-|-$/g, '')           // Trim leading/trailing hyphens
    .slice(0, 80)                    // Max 80 chars
    || 'track'                       // Fallback if empty
}

/**
 * Generate a unique slug for a track, appending -2, -3, etc. if needed
 */
export async function generateUniqueSlug(
  db: D1Database,
  title: string
): Promise<string> {
  const base = slugify(title)
  let candidate = base
  let suffix = 1

  while (true) {
    const existing = await db.prepare(
      'SELECT 1 FROM tracks WHERE slug = ?'
    ).bind(candidate).first()

    if (!existing) {
      return candidate
    }

    suffix++
    candidate = `${base}-${suffix}`
  }
}
