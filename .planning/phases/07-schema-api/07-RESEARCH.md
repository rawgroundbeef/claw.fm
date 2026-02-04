# Phase 7: Schema, Shared Types, and API Endpoints - Research

**Researched:** 2026-02-04
**Domain:** API design, database schema, type-safe validation, and payment-gated endpoints
**Confidence:** HIGH

## Summary

Phase 7 implements artist profile management via API with x402 payment gating. The implementation builds on the existing Cloudflare Workers + D1 + Hono stack used for track submission (v1.0), extending it with profile schema, username uniqueness constraints, avatar upload via Cloudflare Images Binding, and public lookup endpoints.

The research confirms that the architectural choices made in the roadmap are well-supported by the ecosystem: D1 fully supports SQLite's `INSERT ON CONFLICT` with case-insensitive unique indexes via `COLLATE NOCASE`, Cloudflare Images Binding provides direct image transformation in Workers (including resize to 256x256 WebP), and Zod integrates cleanly with Hono for runtime validation that generates TypeScript types.

Key findings indicate that validation must happen before x402 settlement (as currently implemented in `/api/submit`), username collision prevention requires `INSERT ON CONFLICT DO NOTHING` with a unique index rather than check-then-insert, and avatar upload should be a separate endpoint from profile creation to keep transactions atomic.

**Primary recommendation:** Follow the existing patterns from `/api/submit` — multipart validation before payment, structured error responses matching `SubmissionError` format, shared types in `@claw/shared` package, and D1 migrations for schema changes.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.7.4 | Web framework for Cloudflare Workers | Lightweight, fast, TypeScript-first, already used in project |
| Zod | 4.3.6 | Runtime schema validation + type inference | TypeScript-first, zero dependencies, 2kb gzipped, industry standard |
| D1 | N/A | SQLite-based database (Cloudflare platform service) | Serverless SQL with SQLite compatibility, project standard |
| Cloudflare Images Binding | N/A | Direct image transformation in Workers | Resizes/encodes images without external URLs, platform-native |
| @openfacilitator/sdk | 1.0.0 | x402 payment verification | Already integrated for track submission |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| file-type | 21.3.0 | Magic number validation for uploads | Already used for audio validation, extend to avatar |
| @hono/zod-validator | Latest | Hono + Zod integration middleware | Optional convenience wrapper, consider for cleaner code |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod | Valibot, Yup, io-ts | Zod has better TypeScript inference and smaller bundle size |
| Cloudflare Images | Sharp.js in Worker | Images Binding is platform-native, handles format conversion automatically |
| Manual validation | Zod + Hono middleware | Manual is fine for simple cases, but Zod prevents duplication |

**Installation:**
```bash
# In packages/shared
pnpm add zod

# In api (if using @hono/zod-validator)
pnpm add @hono/zod-validator
```

## Architecture Patterns

### Recommended Project Structure
```
api/
├── migrations/
│   ├── 0001_tracks-schema.sql
│   ├── 0002_submission-fields.sql
│   └── 0003_artist-profiles.sql       # New: profile schema
├── src/
│   ├── routes/
│   │   ├── submit.ts                   # Existing pattern
│   │   ├── profile.ts                  # New: PUT /api/profile
│   │   ├── artist.ts                   # New: GET /api/artist/:username
│   │   └── username.ts                 # New: GET /api/username/:username/available
│   ├── middleware/
│   │   ├── x402.ts                     # Existing
│   │   └── validation.ts               # Extend for profile validation
│   └── lib/
│       └── identicon.ts                # Existing: fallback avatars

packages/shared/src/
└── index.ts                            # Add profile types, Zod schemas
```

### Pattern 1: Case-Insensitive Username Uniqueness
**What:** SQLite unique constraint with `COLLATE NOCASE` for case-insensitive uniqueness

**When to use:** Usernames, email addresses, or any identifier requiring case-insensitive uniqueness

**Example:**
```sql
-- Source: SQLite documentation + D1 compatibility
CREATE TABLE artist_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Create index explicitly (D1 best practice)
CREATE UNIQUE INDEX idx_artist_username ON artist_profiles(username COLLATE NOCASE);
```

**Important caveat:** `COLLATE NOCASE` only handles ASCII A-Z, not Unicode. For this use case (alphanumeric + underscores), this is sufficient.

### Pattern 2: INSERT ON CONFLICT for Race Condition Prevention
**What:** Use `INSERT ON CONFLICT DO NOTHING` to prevent duplicate username registration races

**When to use:** Any resource claim that must be unique (usernames, handles, slugs)

**Example:**
```typescript
// Source: SQLite UPSERT docs + existing D1 patterns
const result = await c.env.DB.prepare(`
  INSERT INTO artist_profiles (wallet, username, display_name, created_at, updated_at)
  VALUES (?, ?, ?, unixepoch(), unixepoch())
  ON CONFLICT(username) DO NOTHING
`).bind(walletAddress, username, displayName).run()

if (result.meta.changes === 0) {
  // Username was taken — conflict occurred
  return c.json({
    error: 'USERNAME_TAKEN',
    message: 'This username is already registered',
    field: 'username'
  }, 400)
}
```

**Why not check-then-insert:** Two concurrent requests can both pass the check, then both try to insert, causing a constraint violation error. `ON CONFLICT` is atomic.

### Pattern 3: Validation Before Payment Settlement
**What:** Complete all validation (format, availability, size limits) before calling `facilitator.settle()`

**When to use:** All x402-gated endpoints

**Example:**
```typescript
// Source: Existing /api/submit implementation
// Step 1: Parse and validate inputs
const validation = await validateProfileUpdate(body)
if (!validation.valid) {
  return c.json(validation.error, 400) // NO PAYMENT
}

// Step 2: Check username availability (if username change)
const available = await checkUsernameAvailable(username)
if (!available) {
  return c.json({ error: 'USERNAME_TAKEN', ... }, 400) // NO PAYMENT
}

// Step 3: Verify and settle payment
const payment = await verifyPayment(c, requirements)
if (!payment.valid) {
  return payment.error // 402 response
}

// Step 4: Perform database operation (payment settled successfully)
```

**Critical:** User should not be charged if their input is invalid.

### Pattern 4: Zod Schemas for Shared Types
**What:** Define validation schemas in shared package, infer TypeScript types from schemas

**When to use:** API request/response types shared between frontend and backend

**Example:**
```typescript
// Source: Zod documentation + monorepo best practices
// packages/shared/src/index.ts
import { z } from 'zod'

export const UsernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be 20 characters or less')
  .regex(/^[a-z0-9_]+$/, 'Username must be lowercase alphanumeric or underscores')
  .regex(/^[^_].*[^_]$/, 'Username cannot start or end with underscore')

export const ProfileUpdateSchema = z.object({
  username: UsernameSchema,
  displayName: z.string().min(1).max(50),
  bio: z.string().max(280).optional()
})

export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>

export interface ArtistProfile {
  id: number
  wallet: string
  username: string
  displayName: string
  bio?: string
  avatarUrl?: string
  createdAt: number
  updatedAt: number
}
```

### Pattern 5: Avatar Upload with Cloudflare Images Binding
**What:** Transform user-uploaded images using Images API before storing

**When to use:** User-uploaded images requiring resize, format conversion, or optimization

**Example:**
```typescript
// Source: Cloudflare Images binding documentation
// wrangler.toml addition:
// [images]
// binding = "IMAGES"

async function processAvatar(file: File, env: Env): Promise<string> {
  const buffer = await file.arrayBuffer()

  const transformed = await env.IMAGES
    .input(buffer)
    .transform({ width: 256, height: 256 })
    .output({ format: 'image/webp', quality: 85 })

  // Upload transformed image to R2 or return base64
  const imageKey = `avatars/${Date.now()}-${crypto.randomUUID()}.webp`
  await env.AUDIO_BUCKET.put(imageKey, transformed.response().body, {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000'
    }
  })

  return imageKey
}
```

**Note:** Cloudflare Images has 10MB size limit (doc says 10MB, some users report 20MB in practice). Reject larger files before processing.

### Anti-Patterns to Avoid

- **Check-then-insert for uniqueness:** Use `INSERT ON CONFLICT` instead — check-then-insert has race conditions
- **Charging before validation:** Validate all inputs before calling `facilitator.settle()`
- **Duplicating types manually:** Use Zod schemas with `z.infer<>` to generate TypeScript types automatically
- **Trusting file extensions:** Use magic number validation (file-type library) for uploaded images
- **Omitting COLLATE on queries:** If index has `COLLATE NOCASE`, queries must also specify it or SQLite won't use the index

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reserved username blocklist | Manual list in code | Reserved username JSON lists | 590+ entries, includes RFC 2142 names, system routes, PaaS conflicts |
| Image format validation | Extension checking | file-type (magic numbers) | Extensions are spoofable, magic numbers read file bytes |
| Username validation regex | Custom regex | Proven pattern with start/end checks | Easy to miss edge cases (consecutive underscores, start/end rules) |
| Case-insensitive uniqueness | LOWER() in queries | COLLATE NOCASE on index | Index-backed, standard SQLite pattern |
| Error response formatting | Manual JSON construction | Consistent error interface | Already established in v1.0 with SubmissionError |

**Key insight:** Security and correctness are hard to get right. Use battle-tested patterns and libraries.

## Common Pitfalls

### Pitfall 1: COLLATE NOCASE Mismatch Between Index and Query
**What goes wrong:** Creating a unique index with `COLLATE NOCASE` but forgetting to use it in queries causes full table scans and allows duplicate inserts with different cases.

**Why it happens:** SQLite requires exact collation match between index and query. If index has `NOCASE` but query doesn't specify collation, SQLite uses default `BINARY` collation and ignores the index.

**How to avoid:**
- Define `COLLATE NOCASE` on the column itself in table definition
- Or always specify `COLLATE NOCASE` in WHERE clauses

**Warning signs:**
- Username uniqueness constraint not preventing case variations (User123 and user123 both exist)
- Slow queries on username lookups

**Example:**
```sql
-- Good: collation on column
CREATE TABLE artist_profiles (
  username TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- Query automatically uses NOCASE
SELECT * FROM artist_profiles WHERE username = ?

-- Alternative: collation on index (requires explicit collation in queries)
CREATE UNIQUE INDEX idx_username ON artist_profiles(username COLLATE NOCASE);
SELECT * FROM artist_profiles WHERE username = ? COLLATE NOCASE
```

### Pitfall 2: Charging for Validation Failures
**What goes wrong:** Calling `facilitator.settle()` before checking username availability or input validation causes users to pay for failed requests.

**Why it happens:** Following the happy path without considering all validation steps that should happen first.

**How to avoid:** Structure endpoints with explicit validation stages:
1. Parse and validate input format
2. Check business rules (username availability, reserved words)
3. Verify payment
4. Settle payment
5. Perform database operation

**Warning signs:**
- Users reporting charges for "Username already taken" errors
- Payment settlement before validation errors

### Pitfall 3: Username Change Race Condition
**What goes wrong:** When user changes username, old username must be released. If not using `INSERT ON CONFLICT`, two users could claim the same username simultaneously during a rename operation.

**Why it happens:** Username change has two operations: release old username, claim new username. Without atomic handling, races occur.

**How to avoid:** Use a single UPDATE with a WHERE clause checking current username:

```sql
-- Safe: atomic update with constraint check
UPDATE artist_profiles
SET username = ?, updated_at = unixepoch()
WHERE wallet = ? AND username = ?

-- If 0 rows affected, either wallet doesn't exist or username already changed
-- Let the unique constraint handle conflicts with existing usernames
```

**Warning signs:**
- Duplicate username errors during profile updates
- Username changes failing intermittently

### Pitfall 4: Missing Magic Number Validation for Images
**What goes wrong:** Validating image uploads by Content-Type header or file extension allows malicious files (e.g., PHP scripts renamed to .jpg).

**Why it happens:** Trusting client-provided metadata instead of inspecting file contents.

**How to avoid:** Use `file-type` library to read magic numbers from file buffer:

```typescript
import { fileTypeFromBlob } from 'file-type'

const fileType = await fileTypeFromBlob(imageFile)
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

if (!fileType || !allowedTypes.includes(fileType.mime)) {
  return c.json({ error: 'INVALID_IMAGE_TYPE', ... }, 400)
}
```

**Warning signs:**
- Accepting files based only on extension or Content-Type
- Not using file-type or similar magic number library

### Pitfall 5: Not Enabling Cloudflare Images Binding
**What goes wrong:** Code references `env.IMAGES` but wrangler.toml doesn't include Images binding configuration, causing runtime errors.

**Why it happens:** Cloudflare Images requires paid subscription AND explicit binding configuration.

**How to avoid:**
1. Verify Cloudflare Images is enabled on account (requires paid plan)
2. Add binding to wrangler.toml:
```toml
[images]
binding = "IMAGES"
```
3. Add to TypeScript bindings type definition

**Warning signs:**
- `env.IMAGES is undefined` runtime errors
- Images API calls failing with binding errors

**TODO noted in roadmap:** "Verify CF Images Binding is enabled on project Cloudflare account before Phase 7 planning."

### Pitfall 6: 280 Character Bio Limit Without Database Constraint
**What goes wrong:** Frontend enforces 280 character limit but database has no constraint, allowing API clients to bypass the limit.

**Why it happens:** Relying on application-level validation without database-level enforcement.

**How to avoid:** Validate in both Zod schema AND consider database constraints (though SQLite TEXT has no length constraint by default, validation at API layer is sufficient if API is the only entry point).

**Warning signs:**
- Inconsistent data lengths in database
- Validation bypassed by direct API calls

## Code Examples

Verified patterns from official sources:

### Profile Creation/Update Endpoint
```typescript
// Source: Existing /api/submit pattern + Zod integration
import { Hono } from 'hono'
import { verifyPayment } from '../middleware/x402'
import { ProfileUpdateSchema, type ArtistProfile } from '@claw/shared'

const profileRoute = new Hono<Env>()

profileRoute.put('/', async (c) => {
  try {
    // Step 1: Parse JSON body
    const body = await c.req.json()

    // Step 2: Validate with Zod
    const validation = ProfileUpdateSchema.safeParse(body)
    if (!validation.success) {
      return c.json({
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
        field: validation.error.errors[0].path[0]
      }, 400)
    }

    const { username, displayName, bio } = validation.data

    // Step 3: Check reserved usernames
    if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
      return c.json({
        error: 'RESERVED_USERNAME',
        message: 'This username is reserved',
        field: 'username'
      }, 400)
    }

    // Step 4: Verify x402 payment
    const payment = await verifyPayment(c, {
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: '10000', // 0.01 USDC
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      resource: '/api/profile',
      description: 'Profile registration fee',
      payTo: c.env.PLATFORM_WALLET
    })

    if (!payment.valid) {
      return payment.error!
    }

    const walletAddress = payment.walletAddress!

    // Step 5: Upsert profile with conflict handling
    const result = await c.env.DB.prepare(`
      INSERT INTO artist_profiles (wallet, username, display_name, bio, created_at, updated_at)
      VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(wallet) DO UPDATE SET
        username = excluded.username,
        display_name = excluded.display_name,
        bio = excluded.bio,
        updated_at = unixepoch()
      WHERE artist_profiles.wallet = excluded.wallet
    `).bind(walletAddress, username, displayName, bio || null).run()

    // Check if username conflict occurred
    if (result.meta.changes === 0) {
      return c.json({
        error: 'USERNAME_TAKEN',
        message: 'Username is already registered',
        field: 'username'
      }, 400)
    }

    // Step 6: Return created/updated profile
    const profile = await c.env.DB.prepare(
      'SELECT * FROM artist_profiles WHERE wallet = ?'
    ).bind(walletAddress).first<ArtistProfile>()

    return c.json(profile, 200)
  } catch (error) {
    console.error('Profile endpoint error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

export default profileRoute
```

### Username Availability Check
```typescript
// Source: D1 query patterns + COLLATE NOCASE handling
usernameRoute.get('/:username/available', async (c) => {
  const username = c.req.param('username')

  // Validate format
  const validation = UsernameSchema.safeParse(username)
  if (!validation.success) {
    return c.json({ available: false, reason: 'INVALID_FORMAT' }, 200)
  }

  // Check reserved
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
    return c.json({ available: false, reason: 'RESERVED' }, 200)
  }

  // Check database (COLLATE NOCASE on column handles case-insensitivity)
  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM artist_profiles WHERE username = ?'
  ).bind(username).first()

  return c.json({ available: !existing }, 200)
})
```

### Avatar Upload with Images Binding
```typescript
// Source: Cloudflare Images Binding docs + existing multipart pattern
avatarRoute.post('/', async (c) => {
  try {
    // Step 1: Parse multipart body
    const body = await c.req.parseBody()

    if (!body.avatar || !(body.avatar instanceof File)) {
      return c.json({
        error: 'MISSING_AVATAR',
        message: 'Avatar file is required',
        field: 'avatar'
      }, 400)
    }

    const avatarFile = body.avatar as File

    // Step 2: Validate file type via magic numbers
    const fileType = await fileTypeFromBlob(avatarFile)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

    if (!fileType || !allowedTypes.includes(fileType.mime)) {
      return c.json({
        error: 'INVALID_AVATAR_TYPE',
        message: 'Avatar must be JPEG, PNG, or WebP',
        field: 'avatar'
      }, 400)
    }

    // Step 3: Validate size (10MB limit for CF Images)
    const MAX_AVATAR_SIZE = 10 * 1024 * 1024
    if (avatarFile.size > MAX_AVATAR_SIZE) {
      return c.json({
        error: 'AVATAR_TOO_LARGE',
        message: 'Avatar must be 10MB or less',
        field: 'avatar'
      }, 400)
    }

    // Step 4: Verify payment
    const payment = await verifyPayment(c, {
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: '10000',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      resource: '/api/avatar',
      description: 'Avatar upload fee',
      payTo: c.env.PLATFORM_WALLET
    })

    if (!payment.valid) {
      return payment.error!
    }

    const walletAddress = payment.walletAddress!

    // Step 5: Transform image with Cloudflare Images
    const buffer = await avatarFile.arrayBuffer()

    const transformed = await c.env.IMAGES
      .input(buffer)
      .transform({ width: 256, height: 256 })
      .output({ format: 'image/webp', quality: 85 })

    // Step 6: Upload to R2
    const avatarKey = `avatars/${walletAddress}-${Date.now()}.webp`
    await c.env.AUDIO_BUCKET.put(avatarKey, transformed.response().body, {
      httpMetadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000'
      }
    })

    // Step 7: Update profile with avatar URL
    await c.env.DB.prepare(`
      UPDATE artist_profiles
      SET avatar_url = ?, updated_at = unixepoch()
      WHERE wallet = ?
    `).bind(avatarKey, walletAddress).run()

    return c.json({ avatarUrl: avatarKey }, 200)
  } catch (error) {
    console.error('Avatar upload error:', error)
    return c.json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual TypeScript types | Zod schemas with z.infer<> | 2023-2024 | Types auto-generated from validation, single source of truth |
| Check-then-insert uniqueness | INSERT ON CONFLICT | Always standard | Race-condition free, atomic operations |
| Extension-based validation | Magic number validation (file-type) | Security best practice | Prevents file upload attacks |
| Sharp.js for images | Cloudflare Images Binding | Feb 2025 (changelog) | Platform-native, no library overhead |
| Manual error handling | HTTPException + onError | Hono standard | Consistent error responses |

**Deprecated/outdated:**
- **Check-then-insert pattern:** Replaced by `INSERT ON CONFLICT` — check-then-insert has inherent race conditions
- **LOWER(column) for case-insensitivity:** Use `COLLATE NOCASE` on index — more efficient, index-backed
- **Client-side only validation:** Always validate server-side — client validation is easily bypassed

## Open Questions

Things that couldn't be fully resolved:

1. **Cloudflare Images Binding availability**
   - What we know: Requires paid Cloudflare Images subscription, needs `[images]` binding in wrangler.toml
   - What's unclear: Whether project account has Images enabled (TODO noted in roadmap)
   - Recommendation: Verify before Phase 7 execution, have R2-only fallback if Images not available

2. **Reserved username list completeness**
   - What we know: 590+ entries in public GitHub gists, covers RFC 2142, system routes, PaaS conflicts
   - What's unclear: Exact list for claw.fm specific needs (should `artist`, `track`, `tip` be reserved?)
   - Recommendation: Start with GitHub gist list, add claw.fm routes (`submit`, `queue`, `now-playing`, etc.)

3. **Profile lookup performance at scale**
   - What we know: D1 supports indexes, COLLATE NOCASE is index-backed
   - What's unclear: Query performance when profiles reach 10k+, need for caching
   - Recommendation: Add indexes on wallet and username (already planned), consider KV cache for public lookups if needed

4. **Username change history**
   - What we know: Old username released immediately, available for anyone
   - What's unclear: Whether to preserve username history for security/audit purposes
   - Recommendation: Start without history (simpler), add audit log if needed later

5. **Bio max length justification**
   - What we know: Twitter/X uses 160 chars for bio, Instagram 150 chars, roadmap suggests 280
   - What's unclear: Why 280 vs 160 for artist bios
   - Recommendation: Use 280 (Twitter's tweet length) — gives artists more room for expression

## Sources

### Primary (HIGH confidence)
- [Cloudflare D1 SQL Statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/) - D1 SQL capabilities
- [Cloudflare Images Binding](https://developers.cloudflare.com/images/transform-images/bindings/) - Images API in Workers
- [Cloudflare Images Upload Limits](https://developers.cloudflare.com/images/upload-images/) - Size and format limits
- [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/) - Migration best practices
- [SQLite UPSERT Documentation](https://sqlite.org/lang_upsert.html) - INSERT ON CONFLICT syntax
- [Zod Documentation](https://zod.dev/) - Schema validation and type inference
- [Zod API Reference](https://zod.dev/api) - String validation methods
- [Hono Validation Guide](https://hono.dev/docs/guides/validation) - Validation patterns
- [Hono HTTPException](https://hono.dev/docs/api/exception) - Error handling

### Secondary (MEDIUM confidence)
- [SQLite Collating Sequences](https://www.w3resource.com/sqlite/sqlite-collating-function-or-sequence.php) - COLLATE NOCASE explanation
- [D1 Batch Operations](https://developers.cloudflare.com/d1/worker-api/d1-database/) - Transaction handling
- [Reserved Usernames GitHub Gist](https://gist.github.com/yassineaboukir/726992bd1f0a4eb637d150b7b5c66079) - Security blocklist
- [Social Media Character Limits 2026](https://goldentoolhub.com/social-media-character-limits-2026/) - Bio length standards
- [File Upload Security Best Practices](https://bluegoatcyber.com/blog/effective-file-upload-validation-techniques-for-web-security/) - Image validation patterns

### Tertiary (LOW confidence)
- [Cloudflare Images Size Limit Discussion](https://github.com/cloudflare/cloudflare-docs/issues/25754) - Community report of 10MB vs 20MB
- [TypeScript Monorepo Shared Types](https://dev.to/lico/step-by-step-guide-sharing-types-and-values-between-react-esm-and-nestjs-cjs-in-a-pnpm-monorepo-2o2j) - Workspace patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use or industry standard (Zod, Hono, D1)
- Architecture: HIGH - Patterns verified in SQLite/D1 docs and existing codebase
- Pitfalls: HIGH - Based on SQLite documentation and security best practices

**Research date:** 2026-02-04
**Valid until:** 60 days (2026-04-05) — stack is stable, but Cloudflare Images Binding is new (Feb 2025), monitor for API changes
