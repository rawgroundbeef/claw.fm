# Phase 2: Submission Pipeline - Research

**Researched:** 2026-02-01
**Domain:** Cloudflare Workers API development with multipart file uploads, payment gating, audio validation, and media storage
**Confidence:** MEDIUM

## Summary

This research investigated the technical requirements for building a track submission pipeline on Cloudflare Workers using Hono framework. The system must handle multipart file uploads (audio + metadata + optional cover art), validate files before charging, gate access with x402 payments, extract audio duration, process cover images, generate identicons, prevent duplicates, and persist metadata to D1.

The standard approach uses Hono's built-in `parseBody()` for multipart forms, streams files directly to R2 to avoid memory limits, validates MIME types server-side using the file-type library, implements x402 payment verification via middleware pattern after validation, uses lightweight MP3 header parsers for duration extraction, leverages Cloudflare's native image transformation API for cover art processing, generates identicons using blockies libraries, and hashes files with Web Crypto API's DigestStream for duplicate detection.

**Primary recommendation:** Validate all inputs (file type via magic number inspection, file size, duration) BEFORE requiring payment. Use streaming APIs to avoid 128MB Worker memory limits. Implement x402 verification as middleware that only triggers after validation passes. Use Cloudflare's native image transformation rather than heavy libraries.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.7.4 | Web framework for Cloudflare Workers | Official Cloudflare recommendation, excellent Workers integration, built-in multipart parsing |
| file-type | ^19.x | MIME type validation via magic numbers | Industry standard for server-side file validation, checks actual file content not headers, works in Workers |
| get-mp3-duration | ^1.0.0 | Extract MP3 duration from buffer | Lightweight, browser-compatible, parses headers without full decode |
| blockies-ts | Latest | Generate Ethereum-style identicons | TypeScript implementation of standard blockies algorithm, wallet address visualization |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| x402-express | Latest | x402 payment middleware for Express | Reference implementation - adapt pattern for Hono (no official Hono package) |
| @download/blockies | Latest | Alternative identicon generator | If blockies-ts has compatibility issues in Workers environment |
| music-metadata-browser | ^2.5.11 | Browser-compatible audio metadata parser | Fallback if get-mp3-duration fails, supports more formats but heavier |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| file-type | Rely on File.type property | Client can spoof Content-Type header - security risk |
| get-mp3-duration | music-metadata-browser | Heavier library, more features but slower and larger bundle |
| Cloudflare Images API | sharp library | sharp doesn't work in Workers (Node.js native dependencies) |
| DigestStream | crypto.subtle.digest() | subtle.digest requires full file in memory, hits 128MB limit |

**Installation:**
```bash
# In api/ directory
npm install file-type get-mp3-duration blockies-ts
```

## Architecture Patterns

### Recommended Project Structure
```
api/src/
├── routes/
│   ├── submit.ts         # POST /api/submit endpoint
│   └── genres.ts         # GET /api/genres endpoint
├── middleware/
│   ├── x402.ts           # x402 payment verification middleware
│   └── validation.ts     # File validation helpers
├── lib/
│   ├── audio.ts          # MP3 duration extraction
│   ├── image.ts          # Cover art processing via Cloudflare Images
│   ├── identicon.ts      # Identicon generation from wallet address
│   └── hash.ts           # File hashing with DigestStream
└── index.ts              # Hono app setup
```

### Pattern 1: Validate-First-Then-Charge Flow
**What:** Parse multipart upload, validate all inputs (file type, size, duration, duplicates), THEN require x402 payment if validation passes
**When to use:** Any paid submission where you don't want users to pay for rejected submissions
**Example:**
```typescript
// Source: Architecture pattern based on CONTEXT.md requirements
app.post('/api/submit', async (c) => {
  // Step 1: Parse multipart body
  const body = await c.req.parseBody();
  const audioFile = body.audio as File;
  const imageFile = body.image as File | undefined;

  // Step 2: Validate BEFORE payment check
  const validation = await validateSubmission(audioFile, imageFile, body);
  if (!validation.valid) {
    return c.json({
      error: validation.errorCode,
      message: validation.message,
      field: validation.field
    }, 400);
  }

  // Step 3: NOW check for payment
  const paymentHeader = c.req.header('PAYMENT-SIGNATURE');
  if (!paymentHeader) {
    return c.json({ /* 402 payment required response */ }, 402, {
      'PAYMENT-REQUIRED': /* base64 payment requirements */
    });
  }

  // Step 4: Verify payment
  const paymentValid = await verifyX402Payment(paymentHeader, c.env);
  if (!paymentValid) {
    return c.json({ error: 'PAYMENT_INVALID' }, 402);
  }

  // Step 5: Process submission (store files, persist metadata)
  const trackId = await processSubmission(validation.data, c.env);

  return c.json({ trackId, /* ... */ }, 200);
});
```

### Pattern 2: Streaming File Upload to R2
**What:** Stream uploaded file directly to R2 without buffering in Worker memory
**When to use:** Any file uploads over a few MB to avoid 128MB memory limit
**Example:**
```typescript
// Source: https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
const audioFile = body.audio as File;

// Stream directly to R2
await c.env.AUDIO_BUCKET.put(
  `tracks/${trackId}.mp3`,
  audioFile.stream(), // Use .stream() not entire File object
  {
    httpMetadata: {
      contentType: 'audio/mpeg',
      cacheControl: 'public, max-age=31536000'
    },
    customMetadata: {
      walletAddress: paymentData.wallet,
      uploadedAt: Date.now().toString()
    }
  }
);
```

### Pattern 3: Server-Side MIME Type Validation
**What:** Validate file type by reading magic number bytes, not client-provided Content-Type
**When to use:** Always - never trust client headers for security-critical validation
**Example:**
```typescript
// Source: https://www.npmjs.com/package/file-type
import { fileTypeFromBlob } from 'file-type';

const audioFile = body.audio as File;
const fileType = await fileTypeFromBlob(audioFile);

if (!fileType || fileType.mime !== 'audio/mpeg') {
  return c.json({
    error: 'INVALID_FILE_TYPE',
    message: `File type ${fileType?.mime || 'unknown'} not supported. MP3 only.`,
    field: 'audio'
  }, 400);
}
```

### Pattern 4: Cover Art Processing with Cloudflare Images
**What:** Use Cloudflare's native image transformation API via fetch subrequest
**When to use:** Any image resizing/cropping in Workers - don't use heavy libraries
**Example:**
```typescript
// Source: https://developers.cloudflare.com/images/transform-images/transform-via-workers/
// First, upload original to R2
const coverKey = `covers/${trackId}-original.${ext}`;
await c.env.AUDIO_BUCKET.put(coverKey, imageFile.stream(), {
  httpMetadata: { contentType: imageFile.type }
});

// Then transform via Images API
const imageUrl = `https://${BUCKET_DOMAIN}/${coverKey}`;
const transformedResponse = await fetch(imageUrl, {
  cf: {
    image: {
      width: 600,
      height: 600,
      fit: 'cover',
      gravity: 'auto',
      format: 'jpeg',
      quality: 85
    }
  }
});

// Store transformed version
const transformedBlob = await transformedResponse.blob();
await c.env.AUDIO_BUCKET.put(
  `covers/${trackId}.jpg`,
  transformedBlob.stream(),
  { httpMetadata: { contentType: 'image/jpeg' } }
);
```

### Pattern 5: File Hashing for Duplicate Detection
**What:** Hash audio file with SHA-256 using DigestStream, check D1 for existing hash+wallet combo
**When to use:** Prevent exact duplicate submissions from same wallet
**Example:**
```typescript
// Source: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
const digestStream = new crypto.DigestStream('SHA-256');
const fileStream = audioFile.stream();
await fileStream.pipeTo(digestStream);
const hashBuffer = await digestStream.digest;
const hashHex = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');

// Check for duplicate
const existing = await c.env.DB.prepare(
  'SELECT id FROM tracks WHERE file_hash = ? AND wallet = ?'
).bind(hashHex, walletAddress).first();

if (existing) {
  return c.json({
    error: 'DUPLICATE_SUBMISSION',
    message: 'This audio file has already been submitted from your wallet',
    field: 'audio'
  }, 400);
}
```

### Pattern 6: x402 Payment Verification Middleware
**What:** Custom Hono middleware that checks PAYMENT-SIGNATURE header, verifies with facilitator
**When to use:** After validation passes, before resource access
**Example:**
```typescript
// Source: Pattern adapted from https://www.quicknode.com/guides/infrastructure/how-to-use-x402-payment-required
// and x402 v2 spec https://www.x402.org/writing/x402-v2-launch

import { createMiddleware } from 'hono/factory';

export const requirePayment = (amount: string, network: string, asset: string) => {
  return createMiddleware(async (c, next) => {
    const paymentSignature = c.req.header('PAYMENT-SIGNATURE');

    if (!paymentSignature) {
      // Return 402 with payment requirements
      const requirements = {
        scheme: 'exact',
        network, // eip155:8453 for Base
        asset,   // USDC contract address
        payTo: c.env.PLATFORM_WALLET,
        maxAmountRequired: amount // "10000" for 0.01 USDC (6 decimals)
      };

      const encoded = btoa(JSON.stringify(requirements));
      return c.json({
        error: 'PAYMENT_REQUIRED',
        message: 'Payment of 0.01 USDC required to submit track'
      }, 402, {
        'PAYMENT-REQUIRED': encoded
      });
    }

    // Verify payment with facilitator
    const facilitatorUrl = 'https://x402.org/facilitator/verify';
    const verification = await fetch(facilitatorUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: paymentSignature,
        requirements: { /* same as above */ }
      })
    });

    if (!verification.ok) {
      return c.json({ error: 'PAYMENT_INVALID' }, 402);
    }

    const result = await verification.json();
    c.set('paymentData', result); // Store for route handler

    await next();
  });
};
```

### Anti-Patterns to Avoid
- **Buffering entire file in memory:** Use `.stream()` not entire File object - Workers have 128MB limit
- **Trusting client Content-Type:** Always validate with magic numbers (file-type library)
- **Charging before validation:** x402 verification must come AFTER file validation to avoid charging for rejected uploads
- **Using sharp or other Node.js image libraries:** These require native dependencies incompatible with Workers - use Cloudflare Images API
- **Loading full file to hash:** Use DigestStream for streaming hashes, not crypto.subtle.digest
- **Relying on client-submitted duration:** Extract from MP3 headers server-side, never trust client input

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MIME type detection | Read first few bytes manually | file-type library | Magic number detection is complex, database of signatures constantly updated, handles edge cases |
| MP3 duration parsing | Parse ID3 tags and frames | get-mp3-duration | VBR/CBR detection, Xing/VBRI header handling, frame counting algorithms are nuanced |
| Image resizing in Workers | Try to use sharp/jimp | Cloudflare Images API | Native libraries don't work in Workers, Cloudflare's API is optimized and free for transformations |
| Identicon generation | Hash to RGB values manually | blockies-ts / @download/blockies | Standard algorithm used by MetaMask, predictable patterns users recognize |
| x402 payment verification | Parse payment headers manually | Adapt x402-express pattern | Facilitator communication protocol, signature verification, error handling already solved |
| File hashing large files | crypto.subtle.digest | crypto.DigestStream | DigestStream supports streaming, subtle.digest requires full file in memory |
| Multipart form parsing | Parse headers and boundaries | Hono's c.req.parseBody() | Boundary detection, multiple files, encoding handling is error-prone |

**Key insight:** Cloudflare Workers environment has unique constraints (no Node.js native dependencies, 128MB memory limit, streaming-focused). Use Workers-specific solutions (Images API, DigestStream, Web Crypto API) rather than trying to port Node.js libraries.

## Common Pitfalls

### Pitfall 1: Memory Exhaustion on Large File Uploads
**What goes wrong:** Worker crashes with OOM error when buffering 50MB MP3 in memory
**Why it happens:** Using `await audioFile.arrayBuffer()` or similar loads entire file into Worker's 128MB memory limit
**How to avoid:** Use streaming APIs exclusively - `.stream()` for R2 uploads, DigestStream for hashing, read MP3 headers in chunks
**Warning signs:** Worker crashes under load, memory usage spikes in metrics, timeouts on large files

### Pitfall 2: Trusting Client-Provided MIME Types
**What goes wrong:** User uploads malicious file disguised as MP3, gets stored and served to other users
**Why it happens:** `File.type` comes from client's Content-Type header, easily spoofed
**How to avoid:** Always validate with file-type library which reads magic number bytes from file content
**Warning signs:** Security scanners flag uploaded files, unexpected file types in R2, playback failures

### Pitfall 3: x402 Payment Before Validation
**What goes wrong:** Agent pays 0.01 USDC, then submission rejected for invalid file - user frustration, support burden
**Why it happens:** Following typical "auth first" patterns instead of validate-first-charge-later
**How to avoid:** Validation functions BEFORE payment middleware in execution chain. Check file type, size, duration, duplicates before checking PAYMENT-SIGNATURE header
**Warning signs:** User complaints about charged for rejected uploads, high payment volume but low track creation

### Pitfall 4: Cloudflare Images API Infinite Loops
**What goes wrong:** Worker makes image transformation request to itself, triggers another Worker execution, infinite loop
**Why it happens:** Image transformation fetch() goes through same Worker route if not scoped properly
**How to avoid:** Check `Via` header for "image-resizing" before making transformation requests, or use dedicated /images/* path
**Warning signs:** Sudden spike in Worker invocations, identical transformation requests repeating, high costs

### Pitfall 5: VBR MP3 Duration Miscalculation
**What goes wrong:** 10-minute track shows as 3 minutes, or vice versa
**Why it happens:** Variable bitrate MP3s need special handling (Xing/VBRI headers), frame counting differs from CBR
**How to avoid:** Use get-mp3-duration which handles VBR detection. Test with both CBR and VBR files. Fall back to music-metadata-browser if get-mp3-duration fails
**Warning signs:** Duration mismatches between actual playback and stored metadata, user reports of truncated tracks

### Pitfall 6: D1 Query Performance Without Indexes
**What goes wrong:** Duplicate check query scans entire tracks table, gets slower as table grows
**Why it happens:** No index on (wallet, file_hash) combo, D1 does full table scan
**How to avoid:** Create composite index on (wallet, file_hash) for duplicate detection query. Run PRAGMA optimize after creating indexes
**Warning signs:** Increasing submission latency over time, high rows_read in D1 metrics, queryEfficiency < 0.5

### Pitfall 7: nodejs_compat Flag Missing
**What goes wrong:** NPM packages fail with "Buffer is not defined" or "process is not defined"
**Why it happens:** Many NPM packages expect Node.js globals, Workers don't provide them by default
**How to avoid:** Add `nodejs_compat` compatibility flag to wrangler.toml, ensure compatibility_date is 2024-09-23 or later
**Warning signs:** Runtime errors about missing globals, packages that work locally but fail in deployed Workers

## Code Examples

Verified patterns from official sources:

### Complete File Validation Function
```typescript
// Source: Combined patterns from file-type docs and CONTEXT.md requirements
import { fileTypeFromBlob } from 'file-type';
import getMP3Duration from 'get-mp3-duration';

interface ValidationResult {
  valid: boolean;
  errorCode?: string;
  message?: string;
  field?: string;
  data?: {
    audioType: string;
    audioSize: number;
    audioDuration: number;
    imageType?: string;
    imageSize?: number;
  };
}

async function validateSubmission(
  audioFile: File,
  imageFile: File | undefined,
  metadata: { title?: string; genre?: string }
): Promise<ValidationResult> {
  // Validate required fields
  if (!metadata.title || metadata.title.trim().length === 0) {
    return {
      valid: false,
      errorCode: 'MISSING_TITLE',
      message: 'Title is required',
      field: 'title'
    };
  }

  if (!metadata.genre) {
    return {
      valid: false,
      errorCode: 'MISSING_GENRE',
      message: 'Genre is required',
      field: 'genre'
    };
  }

  // Validate audio file type
  const audioType = await fileTypeFromBlob(audioFile);
  if (!audioType || audioType.mime !== 'audio/mpeg') {
    return {
      valid: false,
      errorCode: 'INVALID_AUDIO_TYPE',
      message: `Audio must be MP3 format. Got: ${audioType?.mime || 'unknown'}`,
      field: 'audio'
    };
  }

  // Validate audio file size (max 50MB)
  const MAX_AUDIO_SIZE = 50 * 1024 * 1024;
  if (audioFile.size > MAX_AUDIO_SIZE) {
    return {
      valid: false,
      errorCode: 'FILE_TOO_LARGE',
      message: `File is ${(audioFile.size / 1024 / 1024).toFixed(1)}MB, max is 50MB`,
      field: 'audio'
    };
  }

  // Extract and validate duration (max 10 minutes)
  const audioBuffer = await audioFile.arrayBuffer();
  const durationMs = getMP3Duration(audioBuffer);
  const durationMinutes = durationMs / 1000 / 60;

  if (durationMinutes > 10) {
    return {
      valid: false,
      errorCode: 'DURATION_TOO_LONG',
      message: `Duration is ${durationMinutes.toFixed(1)} minutes, max is 10 minutes`,
      field: 'audio'
    };
  }

  // Validate cover image if provided
  let imageData;
  if (imageFile) {
    const imageType = await fileTypeFromBlob(imageFile);
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!imageType || !validImageTypes.includes(imageType.mime)) {
      return {
        valid: false,
        errorCode: 'INVALID_IMAGE_TYPE',
        message: `Image must be JPG, PNG, or WebP. Got: ${imageType?.mime || 'unknown'}`,
        field: 'image'
      };
    }

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
    if (imageFile.size > MAX_IMAGE_SIZE) {
      return {
        valid: false,
        errorCode: 'IMAGE_TOO_LARGE',
        message: `Image is ${(imageFile.size / 1024 / 1024).toFixed(1)}MB, max is 5MB`,
        field: 'image'
      };
    }

    imageData = {
      imageType: imageType.mime,
      imageSize: imageFile.size
    };
  }

  return {
    valid: true,
    data: {
      audioType: audioType.mime,
      audioSize: audioFile.size,
      audioDuration: durationMs,
      ...imageData
    }
  };
}
```

### Identicon Generation from Wallet Address
```typescript
// Source: https://www.npmjs.com/package/blockies-ts
import * as blockies from 'blockies-ts';

function generateIdenticon(walletAddress: string): string {
  // Generate 8x8 grid, 10px per block = 80x80 image
  const icon = blockies.create({
    seed: walletAddress.toLowerCase(),
    size: 8,
    scale: 10
  });

  // Returns data URL: "data:image/png;base64,..."
  return icon.toDataURL();
}

// Alternative: Upload to R2 instead of storing data URL
async function generateAndUploadIdenticon(
  walletAddress: string,
  trackId: string,
  bucket: R2Bucket
): Promise<string> {
  const icon = blockies.create({
    seed: walletAddress.toLowerCase(),
    size: 8,
    scale: 10
  });

  const canvas = icon as HTMLCanvasElement;
  const blob = await canvas.toBlob('image/png');

  const key = `covers/${trackId}-identicon.png`;
  await bucket.put(key, blob.stream(), {
    httpMetadata: { contentType: 'image/png' }
  });

  return `https://${BUCKET_DOMAIN}/${key}`;
}
```

### Genre List Endpoint
```typescript
// Source: Architecture pattern based on CONTEXT.md requirements
// and https://developer.spotify.com/documentation/web-api/reference/get-recommendation-genres

const GENRES = [
  'electronic',
  'hip-hop',
  'indie',
  'rock',
  'pop',
  'ambient',
  'techno',
  'house',
  'experimental',
  'jazz',
  'r&b',
  'soul',
  'afrobeats',
  'latin',
  'other'
] as const;

app.get('/api/genres', (c) => {
  return c.json({
    genres: GENRES,
    count: GENRES.length
  });
});

// In submission validation
function validateGenre(genre: string): boolean {
  return GENRES.includes(genre as any);
}
```

### D1 Schema with Indexes for Submission Pipeline
```sql
-- Source: https://developers.cloudflare.com/d1/best-practices/use-indexes/
-- Combined with CONTEXT.md requirements

CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  genre TEXT NOT NULL,
  description TEXT,
  tags TEXT, -- JSON array stored as string
  wallet TEXT NOT NULL,
  artist_name TEXT,
  duration INTEGER NOT NULL, -- milliseconds
  file_url TEXT NOT NULL,
  file_hash TEXT NOT NULL, -- SHA-256 hex
  cover_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  play_count INTEGER DEFAULT 0,
  tip_weight REAL DEFAULT 0.0
);

-- Index for duplicate detection (used in WHERE wallet = ? AND file_hash = ?)
CREATE INDEX idx_tracks_wallet_hash ON tracks(wallet, file_hash);

-- Index for wallet-specific queries (used in WHERE wallet = ?)
CREATE INDEX idx_tracks_wallet ON tracks(wallet);

-- Index for queue ordering (used in ORDER BY created_at)
CREATE INDEX idx_tracks_created_at ON tracks(created_at);

-- Run optimization after creating indexes
PRAGMA optimize;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| x402 v1 with X-* headers | x402 v2 with PAYMENT-* headers | January 2026 | Payment data in headers not body, supports sessions/subscriptions, CAIP standards for multi-chain |
| Node.js crypto library | Web Crypto API + DigestStream | 2024-2025 | Workers-native streaming hash support, no polyfills needed |
| Manual multipart parsing | Hono c.req.parseBody() | Hono 4.0+ | Built-in support, no external libraries |
| R2 put() with entire file | R2 put() with .stream() | Always supported but often overlooked | Avoid memory limits, handle large files |
| Sharp for image processing | Cloudflare Images API via fetch | 2023+ | Native Workers support, no dependencies, optimized transformations |

**Deprecated/outdated:**
- **x402 v1 X-PAYMENT header:** v2 uses PAYMENT-SIGNATURE header (changed January 2026)
- **music-metadata (full package):** Use music-metadata-browser for Workers, but get-mp3-duration is lighter for MP3-only
- **node_compat flag:** Replaced by nodejs_compat (nodejs_compat_v2 as of 2024-09-23)
- **WAV support in MVP:** CONTEXT.md removed WAV, MP3-only for phase 2

## Open Questions

Things that couldn't be fully resolved:

1. **@openfacilitator/sdk package existence**
   - What we know: CONTEXT.md specifies using @openfacilitator/sdk, x402 docs mention facilitator SDKs
   - What's unclear: Package not found on npm, may be internal or documentation ahead of release
   - Recommendation: Use x402-express pattern as reference, implement facilitator verification via direct fetch to https://x402.org/facilitator/verify endpoint. Flag for validation during planning.

2. **get-mp3-duration Workers compatibility**
   - What we know: Package is 8 years old, claims browser support, uses buffer operations
   - What's unclear: Not explicitly tested in Cloudflare Workers environment, may need nodejs_compat flag
   - Recommendation: MEDIUM confidence - plan to test during implementation, have music-metadata-browser as fallback. Consider implementing custom MP3 header parser if both fail.

3. **Exact bitrate/quality thresholds for MP3**
   - What we know: CONTEXT.md lists as "Claude's Discretion", industry standard is 128kbps minimum for streaming
   - What's unclear: Whether to enforce minimum bitrate, how to extract bitrate from VBR files
   - Recommendation: Phase 2 could skip bitrate validation (accept any valid MP3), add in later phase if quality issues arise. Document in PLAN as optional nice-to-have.

4. **x402 v2 session/subscription support for validate-first pattern**
   - What we know: v2 supports sessions, validate-first-charge-later is architectural requirement
   - What's unclear: How sessions interact with pre-validation requirements, whether facilitator caches validation state
   - Recommendation: Implement as stateless (each submission requires new payment) for MVP, investigate sessions for future optimization if agent UX suffers from repeated payments.

5. **Cloudflare Images API billing for transformations**
   - What we know: "Each unique transformation is billed only once per 30 days" per docs
   - What's unclear: Cost implications for one-off cover art transformations (each track unique), whether R2-sourced transformations are free tier
   - Recommendation: Verify pricing in planning phase, may need to cache transformed images in R2 and serve directly rather than re-transforming.

## Sources

### Primary (HIGH confidence)
- [Hono File Upload Documentation](https://hono.dev/examples/file-upload) - parseBody() API and multipart handling
- [Hono Request API Reference](https://hono.dev/docs/api/request) - File metadata access patterns
- [Cloudflare Workers R2 API Reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) - R2 put() with streaming and metadata
- [Cloudflare Images Transform via Workers](https://developers.cloudflare.com/images/transform-images/transform-via-workers/) - Image transformation API and options
- [Cloudflare D1 Index Best Practices](https://developers.cloudflare.com/d1/best-practices/use-indexes/) - Composite indexes and query optimization
- [Cloudflare Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) - DigestStream for file hashing
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) - 128MB memory limit, streaming recommendations
- [Cloudflare Workers Node.js Compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) - nodejs_compat flag and supported packages

### Secondary (MEDIUM confidence)
- [x402 v2 Launch Announcement](https://www.x402.org/writing/x402-v2-launch) - v2 features and header changes (verified with multiple sources)
- [x402 Protocol GitHub](https://github.com/coinbase/x402) - Payment flow and verification process
- [QuickNode x402 Implementation Guide](https://www.quicknode.com/guides/infrastructure/how-to-use-x402-payment-required) - Seller implementation pattern with x402-express
- [file-type npm package](https://www.npmjs.com/package/file-type) - MIME type detection via magic numbers (widely used, well-documented)
- [get-mp3-duration npm package](https://www.npmjs.com/package/get-mp3-duration) - MP3 duration extraction (older package but purpose-built)
- [blockies-ts npm package](https://www.npmjs.com/package/blockies-ts) - TypeScript identicon generation (verified against Ethereum ecosystem usage)
- [Revelator Genre Metadata Best Practices](https://revelator.com/blog/genre-metadata-best-practices) - Genre taxonomy recommendations

### Tertiary (LOW confidence)
- WebSearch results on music genres 2026 trends (multiple sources but marketing-focused, not technical standards)
- @openfacilitator/sdk references (mentioned in CONTEXT.md and WebSearch but package not found - needs validation)
- music-metadata-browser Workers compatibility (package exists but not explicitly Workers-tested)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Hono/R2/D1 proven (HIGH), file-type/get-mp3-duration Workers-compatibility needs testing (MEDIUM), @openfacilitator/sdk existence unclear (LOW)
- Architecture: HIGH - Patterns based on official Cloudflare docs, x402 verified with multiple sources, streaming/validation patterns well-documented
- Pitfalls: HIGH - Memory limits, MIME validation, and streaming requirements documented in official sources, VBR handling verified in library docs
- x402 implementation: MEDIUM - v2 spec confirmed, example code from QuickNode verified, but @openfacilitator/sdk package not found in npm

**Research date:** 2026-02-01
**Valid until:** 2026-02-28 (30 days - x402 v2 is new, rapidly evolving; Workers compatibility flags updated frequently)
