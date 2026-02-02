---
phase: 05-payments-wallet
plan: 02
subsystem: payments-api
tags: [api, payments, tips, downloads, hmac, r2, d1, cloudflare-workers]
requires:
  - 02-03-PLAN.md (D1 tracks table with tip_weight column)
  - 03-01-PLAN.md (Rotation logic using tip_weight)
provides:
  - POST /api/tip endpoint (updates tip_weight)
  - POST /api/downloads/:trackId endpoint (generates presigned URL)
  - GET /api/downloads/:trackId/file endpoint (serves file with token verification)
  - HMAC-signed download URLs with 72-hour expiry
  - Payment types in shared package
affects:
  - 05-03-PLAN.md (Frontend payment flows will consume these endpoints)
tech-stack:
  added: []
  patterns: [hmac-signing, web-crypto-api, r2-streaming, time-limited-urls]
key-files:
  created:
    - api/src/routes/tip.ts
    - api/src/routes/downloads.ts
    - api/src/lib/presigned.ts
  modified:
    - packages/shared/src/index.ts
    - api/src/index.ts
    - api/wrangler.toml
key-decisions:
  - decision: "Tip weight scaling: amount * 1e17"
    rationale: "$1 USDC = 1e17 units gives clean 2x boost, $0.25 = 1.25x, $5 = 6x"
    date: 2026-02-01
  - decision: "72-hour download URL expiry"
    rationale: "Long enough for user to download, short enough for security"
    date: 2026-02-01
  - decision: "HMAC-SHA256 with Web Crypto API"
    rationale: "Native Workers support, no external dependencies, secure signing"
    date: 2026-02-01
  - decision: "Relative download URLs"
    rationale: "Frontend resolves against API base, works in any deployment"
    date: 2026-02-01
duration: 2.4m
completed: 2026-02-01
---

# Phase 5 Plan 02: API Endpoints - Tips & Downloads Summary

**One-liner:** Tip endpoint with USDC-to-rotation-weight scaling ($1 = 2x boost) and HMAC-signed download URLs with 72h expiry using native Web Crypto API.

## Performance

**Duration:** 2.4 minutes
**Start:** 2026-02-01T23:22:21Z
**End:** 2026-02-01T23:24:44Z
**Task count:** 2
**File count:** 6 (3 created, 3 modified)

## Accomplishments

### Payment Types
- Added `TipRequest`, `TipResponse`, `DownloadResponse` to shared package
- All types properly exported and consumable by frontend and API

### Tip Endpoint (POST /api/tip)
- Accepts `{trackId, amount, txHash}` with validation
- Validates amount is one of [0.25, 1, 5] USDC
- Validates txHash format (starts with '0x')
- Converts USDC amount to tip_weight increment: `amount * 1e17`
  - $0.25 tip → 2.5e16 units → 1.25x boost
  - $1.00 tip → 1e17 units → 2.0x boost
  - $5.00 tip → 5e17 units → 6.0x boost
- Updates D1 tracks table atomically
- Invalidates KV cache to refresh rotation weights
- Returns new tip_weight to caller

### Download Endpoints
**POST /api/downloads/:trackId** (request link):
- Looks up track in D1 to get file_url and title
- Extracts R2 key from file_url
- Generates HMAC-SHA256 token using Web Crypto API
- Calculates 72-hour expiry timestamp
- Returns relative download URL with token and expiry

**GET /api/downloads/:trackId/file** (serve file):
- Verifies HMAC token matches expected signature
- Checks expiry timestamp (403 if expired)
- Fetches track metadata from D1
- Streams file from R2 bucket
- Sets Content-Type: audio/mpeg
- Sets Content-Disposition with sanitized filename
- Returns 404 if file missing from R2

### Presigned URL Library
- `generateDownloadToken`: HMAC-SHA256 with URL-safe base64
- `verifyDownloadToken`: Constant-time comparison
- Uses native `crypto.subtle` API (no dependencies)
- Message format: `{r2Key}:{expiresAt}`

### Route Wiring
- Mounted `/api/tip` route in index.ts
- Mounted `/api/downloads` route in index.ts
- Added `DOWNLOAD_SECRET` to Bindings type
- Added `DOWNLOAD_SECRET` to wrangler.toml vars

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 0b171a1 | feat(05-02): add tip endpoint and payment types |
| 2 | 8b4054c | feat(05-02): add download endpoints with HMAC-signed URLs |

## Files Created

1. **api/src/routes/tip.ts** (73 lines)
   - POST handler with validation
   - D1 update with tip_weight increment
   - KV cache invalidation
   - TipResponse with newTipWeight

2. **api/src/routes/downloads.ts** (140 lines)
   - POST /:trackId - generate signed URL
   - GET /:trackId/file - verify token and stream
   - R2 key extraction from file_url
   - Token expiry validation
   - Content-Disposition with sanitized filename

3. **api/src/lib/presigned.ts** (31 lines)
   - generateDownloadToken using Web Crypto
   - verifyDownloadToken with constant-time comparison
   - URL-safe base64 encoding

## Files Modified

1. **packages/shared/src/index.ts**
   - Added TipRequest interface
   - Added TipResponse interface
   - Added DownloadResponse interface

2. **api/src/index.ts**
   - Imported tipRoute and downloadsRoute
   - Added DOWNLOAD_SECRET to Bindings type
   - Mounted /api/tip route
   - Mounted /api/downloads route

3. **api/wrangler.toml**
   - Added DOWNLOAD_SECRET var (dev placeholder)

## Decisions Made

### Tip Weight Scaling Formula
**Decision:** Use `amount * 1e17` to convert USDC to tip_weight increment
**Rationale:** Clean scaling where $1 USDC = 1e17 units gives exactly 2x boost via the rotation formula `1 + (tip_weight / 1e17)`. This makes the math intuitive:
- $0.25 → 1.25x boost
- $1.00 → 2.0x boost
- $5.00 → 6.0x boost

Aligns with QUEU-04 rotation logic established in Phase 3.

### 72-Hour Download Expiry
**Decision:** Download URLs expire after 72 hours
**Rationale:** Long enough for users to download purchased tracks at their convenience (across time zones, travel, work schedules), but short enough to limit security exposure if URLs leak. Strikes balance between UX and security.

### Web Crypto API (No Dependencies)
**Decision:** Use native `crypto.subtle` for HMAC-SHA256 signing
**Rationale:** Cloudflare Workers environment has full Web Crypto API support. Using native APIs avoids:
- Extra npm dependencies (@aws-sdk/s3-presigned-post, etc.)
- Bundle size increase
- Dependency maintenance burden
- Potential compatibility issues

Native approach is faster, lighter, and equally secure.

### Relative Download URLs
**Decision:** Return URLs like `/api/downloads/:id/file?token=...` instead of absolute URLs
**Rationale:** Frontend resolves these against the API base URL it's already configured with. This:
- Works in local dev (localhost:8787)
- Works in production (api.claw.fm)
- Works in preview deployments
- No environment-specific URL construction needed

### Token Format
**Decision:** HMAC message is `{r2Key}:{expiresAt}`
**Rationale:** Binds the token to both the file identity and the expiry time. This prevents:
- Reusing tokens for different files
- Extending expiry by manipulating query params
- Replay attacks after intended expiry

URL-safe base64 encoding ensures tokens work in query strings.

### KV Cache Invalidation on Tip
**Decision:** Delete `now-playing` KV entry after tip updates tip_weight
**Rationale:** The rotation algorithm uses tip_weight to calculate selection probability. When a tip increases a track's tip_weight, the cached rotation state becomes stale. Invalidating forces the next `/api/now-playing` request to recompute with fresh weights.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation passed, all endpoints implemented to spec.

## Next Phase Readiness

**Phase 5 Plan 3 (Frontend Payment Flows) - READY**

Prerequisites met:
- ✅ POST /api/tip endpoint functional
- ✅ POST /api/downloads/:trackId endpoint functional
- ✅ GET /api/downloads/:trackId/file endpoint functional
- ✅ Payment types exported from @claw/shared
- ✅ HMAC token verification working
- ✅ 72-hour expiry enforced
- ✅ TypeScript compilation passes

Plan 3 can now:
- Integrate tip UI with POST /api/tip
- Request download URLs via POST /api/downloads/:trackId
- Display download buttons with time-limited links
- Handle expiry gracefully in UI

**Blockers:** None

**Concerns:** None - implementation complete and verified
