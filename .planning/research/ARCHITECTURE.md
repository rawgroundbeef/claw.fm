# Architecture Patterns: Artist Profiles Integration (v1.1)

**Domain:** Adding artist profiles to existing 24/7 AI music radio station (claw.fm)
**Researched:** 2026-02-03
**Overall confidence:** HIGH (based on direct codebase analysis of all 59 source files + official Cloudflare documentation)

## Executive Summary

Artist profiles integrate cleanly into the existing claw.fm architecture. The codebase already uses wallet addresses as identity (`tracks.wallet`), already has an `artist_name` column on the tracks table (denormalized), and already has R2 storage with prefix-based organization (`tracks/`, `covers/`). The main architectural challenges are: (1) introducing client-side routing to a single-page app that currently has none, (2) enriching the now-playing KV cache with profile data without introducing staleness, and (3) managing the denormalized `artist_name` on tracks when a profile's display name changes. None of these are high-risk -- they follow established patterns in the existing codebase.

---

## Current Architecture (As-Is)

### Component Map

```
                    Cloudflare Pages (web/)
                    +---------------------------+
                    | React 19 + Vite SPA       |
                    | No client-side router     |
                    | App.tsx = single view      |
                    | Polls /api/now-playing     |
                    +---------------------------+
                              |
                    Cloudflare Workers (api/)
                    +---------------------------+
                    | Hono framework             |
                    | Routes: submit, now-playing,|
                    |   queue, tip, downloads,   |
                    |   audio, genres            |
                    | Middleware: x402, validation|
                    +---------------------------+
                        |       |       |
                    +---+   +---+   +---+
                    |       |       |
                  D1      R2      KV
                (SQLite) (Storage) (Cache)
                    |
              Durable Object
              (QueueBrain)
              - SQLite state
              - Alarm scheduling
              - Track selection
```

### Current Data Flow (Now-Playing)

1. Frontend polls `GET /api/now-playing` every 2-5s
2. Route checks KV cache (key: `now-playing`, TTL: ~60s)
3. Cache miss: queries QueueBrain DO for current state
4. Fetches track metadata from D1 (`SELECT ... FROM tracks WHERE id = ?`)
5. Builds `NowPlayingTrack` with `artistName` from `tracks.artist_name`
6. Caches response in KV, returns to frontend
7. Frontend displays `artistName` or falls back to truncated wallet

### Current R2 Organization

| Prefix | Content | Written By |
|--------|---------|-----------|
| `tracks/` | MP3 audio files | `submit.ts` route |
| `covers/` | Cover art images (JPEG/PNG/WebP) | `image.ts` lib |
| (data URLs) | Identicon fallback | `identicon.ts` (not stored in R2) |

### Current Bindings (wrangler.toml)

| Binding | Type | Name |
|---------|------|------|
| `DB` | D1 | `claw-fm` |
| `AUDIO_BUCKET` | R2 | `claw-fm-audio` |
| `QUEUE_BRAIN` | Durable Object | `QueueBrain` |
| `KV` | KV Namespace | (id: 92ba53fc...) |
| `PLATFORM_WALLET` | Var | `0x276c5D...` |
| `DOWNLOAD_SECRET` | Secret | (set via wrangler secret) |

---

## Target Architecture (To-Be)

### New Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| `artists` table | D1 table | Migration 0003 | Store artist profile data |
| `profile.ts` | API route | `api/src/routes/profile.ts` | PUT /api/profile (x402-gated create/update) |
| `artist.ts` | API route | `api/src/routes/artist.ts` | GET /api/artist/:username, GET /api/artist/by-wallet/:wallet |
| `avatar.ts` | Lib | `api/src/lib/avatar.ts` | Avatar upload, validation, R2 storage |
| `ArtistProfile` page | React component | `web/src/pages/ArtistProfile.tsx` | Profile page UI |
| Router setup | React | `web/src/App.tsx` (modified) | Client-side routing with wouter |

### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `api/src/index.ts` | Add profile + artist route registrations | New API endpoints |
| `packages/shared/src/index.ts` | Add Artist types, update NowPlayingTrack | Shared type contract |
| `api/src/routes/now-playing.ts` | LEFT JOIN artists table | Enrich now-playing with profile data |
| `api/src/routes/queue.ts` | Same enrichment as now-playing | Queue preview with profile data |
| `api/src/routes/submit.ts` | Look up artist profile for artist_name | Use display_name if profile exists |
| `web/src/App.tsx` | Wrap in router, split into pages | Client-side routing |
| `web/src/main.tsx` | Potentially add router provider | Router setup (optional with wouter) |
| `web/src/hooks/useNowPlaying.ts` | Consume artistUsername, artistAvatarUrl | Profile link in player UI |

---

## Integration Point #1: D1 Schema Changes

### New `artists` Table (Migration 0003)

```sql
-- Migration: 0003_artists-table.sql

CREATE TABLE IF NOT EXISTS artists (
  wallet TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_username
  ON artists(username COLLATE NOCASE);
```

**Confidence:** HIGH -- follows exact pattern of existing migrations (`0001_tracks-schema.sql`, `0002_submission-fields.sql`). D1 migrations are sequential SQL files applied via `wrangler d1 migrations apply`.

### Relationship to Tracks Table

The `tracks.wallet` column already exists and serves as the implicit foreign key to `artists.wallet`. A formal `FOREIGN KEY` constraint is NOT recommended because:

1. Tracks can exist without an artist profile (agent submits before creating a profile)
2. The wallet column is already populated on all existing tracks
3. Adding a FK would require all existing `tracks.wallet` values to exist in `artists.wallet`, which they do not (no profiles exist yet)
4. D1 enforces FK by default (`PRAGMA foreign_keys = on`), so a FK constraint would block track submission for agents without profiles

**Recommendation:** No formal foreign key. The relationship is implicit via `tracks.wallet = artists.wallet`. Queries use explicit LEFT JOINs when needed, and LEFT JOIN handles the case where no profile exists.

### Denormalization Strategy for artist_name

The `tracks.artist_name` column already exists (added in migration 0002). Currently it is set to the wallet address at submission time (line 156 of `submit.ts`: `walletAddress, // Use wallet as artist_name for MVP`).

**Strategy: Write-through denormalization with lazy backfill.**

1. **On profile create/update (PUT /api/profile):** After upserting the `artists` row, run:
   ```sql
   UPDATE tracks SET artist_name = ? WHERE wallet = ?
   ```
   This updates all existing tracks by that wallet to use the new display_name.

2. **On track submission (POST /api/submit):** Look up the artist profile first:
   ```sql
   SELECT display_name FROM artists WHERE wallet = ?
   ```
   If found, use `display_name` as `artist_name`. If not found, continue using wallet address (existing behavior).

3. **No background migration needed.** When an agent creates a profile, all their tracks get the display_name immediately. Agents without profiles keep the wallet address, which is the current behavior.

**Why not JOIN every time instead of denormalizing?** The `artist_name` is used in the now-playing KV cache, queue preview, and track listings. The denormalized value avoids needing a JOIN for every D1 query, and the artist_name column already exists for exactly this purpose. Writes are infrequent (profile updates are rare); reads are constant (every now-playing poll).

**Note:** The LEFT JOIN on now-playing/queue queries (Integration Point #5 below) fetches the `username` and `avatar_url` -- these are NOT denormalized onto tracks because they are only needed for enriched API responses, not for the core track data. The `artist_name` denormalization serves a different purpose: it is the canonical display name embedded in the track record.

**Confidence:** HIGH -- the `artist_name` column already exists for exactly this purpose.

---

## Integration Point #2: R2 Storage for Avatars

### Same Bucket, New Prefix

**Recommendation:** Use the existing `AUDIO_BUCKET` (claw-fm-audio) R2 bucket with a new `avatars/` prefix.

| Prefix | Content | Key Convention |
|--------|---------|---------------|
| `tracks/` | MP3 audio | `tracks/{timestamp}-{uuid}.mp3` |
| `covers/` | Cover art | `covers/{trackId}.{ext}` |
| `avatars/` | Artist avatars | `avatars/{wallet}.{ext}` |

**Why same bucket:**
- One R2 binding already configured (`AUDIO_BUCKET`)
- No additional wrangler.toml changes needed
- Served via existing `/audio/*` catch-all route (which serves any R2 key)
- Logically grouped (all user-uploaded media)

**Why wallet-based key:** Avatars are per-wallet (one per artist). Using `avatars/{wallet}.{ext}` means uploading a new avatar overwrites the old one automatically (R2 `put` is idempotent). No orphan cleanup needed.

### Image Validation in Workers

The existing `processAndUploadCoverArt` function in `api/src/lib/image.ts` already validates:
- File type via magic number (`file-type` library, already a dependency)
- Allowed types: JPEG, PNG, WebP
- Max size: 5MB
- Uploads to R2 with correct content-type

**Recommendation:** Create a new `processAndUploadAvatar` function that reuses the same validation pattern but with avatar-specific constraints:

```typescript
// api/src/lib/avatar.ts
export async function processAndUploadAvatar(
  imageFile: File,
  walletAddress: string,
  bucket: R2Bucket
): Promise<string> {
  // 1. Validate type via magic number (reuse file-type, same as image.ts)
  // 2. Validate size (max 2MB for avatars -- tighter than 5MB covers)
  // 3. Upload to R2 at avatars/{wallet}.{ext}
  // 4. Return R2 key (e.g., "avatars/0x1234...abcd.png")
}
```

### Image Resizing Trade-off

**Option A: No resizing (recommended for v1.1).** Accept the image as-is after type/size validation. Serve original via `/audio/avatars/{wallet}.{ext}`. Frontend uses CSS `object-fit: cover` with fixed dimensions (e.g., 64x64 in player, 128x128 on profile page).

**Option B: Cloudflare Images binding.** Add `[images] binding = "IMAGES"` to wrangler.toml. Resize to 256x256 on upload using `env.IMAGES.input(stream).transform({ width: 256, height: 256, fit: 'cover' }).output({ format: 'webp' })`. Requires Cloudflare Images product (additional billing, ~$0.50 per 1000 transformations).

**Recommendation: Option A for v1.1.** Rationale:
- 2MB size limit keeps images reasonably small
- CSS handles display sizing perfectly
- No additional Cloudflare product dependency or billing
- Existing cover art uses the exact same approach (no server-side resizing)
- Can add resizing later if bandwidth becomes a concern (profile at scale)
- Most AI agent avatars are already appropriately sized (generated images)

**Confidence:** HIGH -- matches existing cover art pattern exactly. Cloudflare Images binding verified via official docs.

---

## Integration Point #3: API Route Structure

### Route Registration Pattern

The existing pattern in `api/src/index.ts` is straightforward Hono route mounting:

```typescript
// Existing (api/src/index.ts lines 33-39)
app.route('/api/genres', genresRoute)
app.route('/api/submit', submitRoute)
app.route('/api/now-playing', nowPlayingRoute)
app.route('/api/queue', queueRoute)
app.route('/api/tip', tipRoute)
app.route('/api/downloads', downloadsRoute)
app.route('/audio', audioRoute)
```

New routes follow the same pattern:

```typescript
import profileRoute from './routes/profile'
import artistRoute from './routes/artist'

app.route('/api/profile', profileRoute)
app.route('/api/artist', artistRoute)
```

### Route File: `api/src/routes/profile.ts`

Authenticated profile management (x402-gated).

```
PUT /api/profile
  Request: multipart/form-data
    - username (string, required)
    - display_name (string, required)
    - bio (string, optional)
    - avatar (File, optional -- JPEG/PNG/WebP, max 2MB)
  Auth: x402 payment header (0.01 USDC, proves wallet ownership)
  Behavior:
    1. Parse multipart body
    2. Validate username format (lowercase alphanumeric + hyphens, 3-30 chars)
    3. Verify x402 payment -> extract walletAddress
    4. Check username availability (SELECT 1 FROM artists WHERE username = ? AND wallet != ?)
    5. Upload avatar to R2 if provided
    6. UPSERT artists table (INSERT ... ON CONFLICT(wallet) DO UPDATE)
    7. UPDATE tracks SET artist_name = display_name WHERE wallet = walletAddress
    8. DELETE KV 'now-playing' (invalidate cache)
    9. Return { wallet, username, displayName, bio, avatarUrl }
```

**Key design note:** This is a single PUT endpoint that handles both creation and update. The x402 payment acts as both authentication AND rate limiting (costs 0.01 USDC per change). The `INSERT ... ON CONFLICT(wallet) DO UPDATE` pattern (SQLite UPSERT) makes this idempotent.

### Route File: `api/src/routes/artist.ts`

Public read-only profile access (no auth required).

```
GET /api/artist/:username
  - No auth (public)
  - Query: SELECT * FROM artists WHERE username = ?
  - Query: SELECT id, title, genre, duration, cover_url, created_at FROM tracks WHERE wallet = ?
  - Returns: { profile: ArtistProfile, tracks: TrackSummary[] }

GET /api/artist/by-wallet/:wallet
  - No auth (public, used by frontend for player UI enrichment)
  - Query: SELECT * FROM artists WHERE wallet = ?
  - Returns: { profile: ArtistProfile } or 404
```

**Why two GET endpoints:** The `:username` endpoint serves profile pages (human-friendly URL). The `by-wallet/:wallet` endpoint is used internally when the frontend has a wallet address from the now-playing API and needs to check if a profile exists (though with the enriched now-playing response from Integration Point #5, this endpoint may only be needed as a fallback).

### x402 Pattern Reuse

The existing `verifyPayment` function from `api/src/middleware/x402.ts` is designed for direct reuse. The pattern is identical to `submit.ts` (lines 49-65):

1. Parse request body
2. Validate inputs
3. Call `verifyPayment(c, requirements)` -- returns `{ valid, walletAddress, error }`
4. If `!valid`, return `paymentResult.error!`
5. Use `paymentResult.walletAddress!` as the authenticated identity
6. Perform the operation

**Profile-specific x402 requirements:**
```typescript
const paymentResult = await verifyPayment(c, {
  scheme: 'exact',
  network: 'base',
  maxAmountRequired: '10000', // 0.01 USDC (same as track submission)
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  resource: '/api/profile',
  description: 'Profile creation/update',
  payTo: c.env.PLATFORM_WALLET,
})
```

The wallet address from payment verification IS the identity -- no additional auth system needed. This is the pattern used by submit (line 65: `const walletAddress = paymentResult.walletAddress!`) and tip (line 41-49) endpoints.

**Confidence:** HIGH -- direct reuse of existing, working, proven pattern.

---

## Integration Point #4: Frontend Routing

### Current State

The frontend has NO client-side routing:
- `main.tsx` renders `<WalletProvider><App /></WalletProvider>` directly
- `App.tsx` is a single monolithic view with the player UI
- No `react-router`, `wouter`, or any routing library installed
- `web/package.json` shows no routing dependency

Cloudflare Pages serves the app as an SPA by default -- when a request does not match a static file, it serves `index.html`. There is no `404.html` in the project, so SPA fallback is active. This means refreshing on `/artist/some-username` will serve `index.html` and the client-side router takes over.

### Recommended Approach: wouter v3.9.0

| Factor | wouter | react-router v7 |
|--------|--------|-----------------|
| Bundle size | ~2.1 KB gzipped | ~18.7 KB gzipped |
| Dependencies | Zero | Multiple |
| React 19 support | Yes (v3.9.0, explicit demos) | Yes |
| API complexity | Minimal -- hooks + components | Heavy -- loaders, actions, data API |
| Setup required | Near-zero (`<Router>` component is optional) | Requires RouterProvider, createBrowserRouter |
| Fit for this project | Perfect -- 2 routes total | Overkill for 2 routes |
| Monthly downloads | 3M+ | 20M+ |

**Recommendation: wouter.** The project has exactly two routes (`/` and `/artist/:username`). wouter adds 2KB. react-router adds 19KB. The hooks API (`useRoute`, `useLocation`, `useParams`) integrates cleanly with the existing hooks-heavy codebase.

### Minimal Routing Implementation

The critical architectural constraint is that the **player bar must persist across all routes**. The player is global state -- it plays regardless of which page you are viewing. Audio hooks (`useNowPlaying`, `useCrossfade`) must run at the App level, not inside a route.

```
App.tsx (layout shell -- always mounted)
  +-- Header (always visible)
  +-- <Switch> (route-dependent content area)
  |     +-- Route "/" -> RadioView (current main content, extracted from App.tsx)
  |     +-- Route "/artist/:username" -> ArtistProfile (new page)
  +-- PlayerBar (always visible at bottom)
```

With wouter, the `<Router>` wrapper is optional. You can use `<Route>` and `<Switch>` directly:

```tsx
import { Route, Switch, Link } from 'wouter'

export default function App() {
  // Audio hooks stay here at the top level -- they run on every route
  const nowPlaying = useNowPlaying()
  const crossfade = useCrossfade()
  // ... other hooks

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Switch>
          <Route path="/">
            <RadioView crossfade={crossfade} nowPlaying={nowPlaying} ... />
          </Route>
          <Route path="/artist/:username">
            {(params) => <ArtistProfile username={params.username} />}
          </Route>
          <Route>Not Found</Route>
        </Switch>
      </main>
      <PlayerBar crossfade={crossfade} nowPlaying={nowPlaying} />
    </div>
  )
}
```

### Artist Name as Link

In the player UI, the artist name currently renders as plain text (App.tsx line 276-283). With profiles, it becomes a link:

```tsx
// Before (plain text)
<p style={{ color: 'var(--text-secondary)' }}>
  {displayArtist}
</p>

// After (link to profile, if username exists)
{crossfade.currentTrack?.artistUsername ? (
  <Link
    href={`/artist/${crossfade.currentTrack.artistUsername}`}
    style={{ color: 'var(--text-secondary)' }}
  >
    {displayArtist}
  </Link>
) : (
  <p style={{ color: 'var(--text-secondary)' }}>
    {displayArtist}
  </p>
)}
```

### Cloudflare Pages SPA Fallback

Cloudflare Pages automatically serves `index.html` for any path that does not match a static file, as long as there is no `404.html` in the build output. The current project has no `404.html`, so this works out of the box.

**No `_redirects` file needed.** No `_routes.json` needed. The default behavior is correct.

**Verification:** The Vite dev server proxy config (`web/vite.config.ts`) only proxies `/api` and `/audio` paths -- all other paths fall through to the SPA. This is consistent with the production behavior.

**Confidence:** HIGH -- verified via official Cloudflare Pages documentation. The project already relies on this SPA behavior.

---

## Integration Point #5: Now-Playing/Queue API Enrichment

### The Problem

The now-playing and queue APIs return `NowPlayingTrack` objects. Currently these include `artistName` (from the denormalized `tracks.artist_name`) and `artistWallet`. For profile features, we also need `artistUsername` and `artistAvatarUrl` so the frontend can:
- Link artist name to `/artist/:username`
- Display the avatar in the player UI and queue preview

### Strategy: LEFT JOIN at Query Time

Modify the D1 queries in `now-playing.ts` and `queue.ts` to LEFT JOIN the artists table:

```sql
-- Current query (now-playing.ts line 44-47)
SELECT id, title, wallet, artist_name, duration, file_url, cover_url, genre
FROM tracks
WHERE id = ?

-- New query (with artist profile enrichment)
SELECT
  t.id, t.title, t.wallet, t.artist_name, t.duration,
  t.file_url, t.cover_url, t.genre,
  a.username AS artist_username,
  a.avatar_url AS artist_avatar_url
FROM tracks t
LEFT JOIN artists a ON t.wallet = a.wallet
WHERE t.id = ?
```

**Why LEFT JOIN (not separate lookup):**
- Single query instead of N+1 (queue.ts fetches up to 5 tracks at once)
- D1 is SQLite -- JOINs on primary keys are extremely fast (artists.wallet is PK)
- LEFT JOIN means tracks without profiles still return (username/avatar will be NULL)
- No additional API calls from frontend
- Consistent approach for all track-fetching queries

**Queries that need this change:**
1. `now-playing.ts` line 44 -- current track fetch
2. `now-playing.ts` line 92 -- next track fetch (crossfade pre-buffer)
3. `queue.ts` line 37 -- queue preview batch fetch
4. `queue.ts` line 84 -- currently playing in queue response

### Shared Type Updates

Update `NowPlayingTrack` in `packages/shared/src/index.ts`:

```typescript
export interface NowPlayingTrack {
  id: number
  title: string
  artistWallet: string
  artistName?: string
  artistUsername?: string    // NEW: null if no profile
  artistAvatarUrl?: string   // NEW: null if no profile/no avatar
  duration: number
  coverUrl?: string
  fileUrl: string
  genre: string
}
```

New types to add:

```typescript
export interface ArtistProfile {
  wallet: string
  username: string
  displayName: string
  bio?: string
  avatarUrl?: string
  createdAt: number
  updatedAt: number
}

export interface ArtistProfileResponse {
  profile: ArtistProfile
  tracks: TrackSummary[]
}

export interface TrackSummary {
  id: number
  title: string
  genre: string
  duration: number
  coverUrl?: string
  createdAt: number
}

export interface ProfileUpdateResponse {
  wallet: string
  username: string
  displayName: string
  bio?: string
  avatarUrl?: string
}
```

The `NowPlayingTrack` fields are optional (`?`), so existing frontend code that only reads `artistName` and `artistWallet` continues to work without changes. The profile link and avatar are progressive enhancements.

**Confidence:** HIGH -- straightforward SQL JOIN, additive type changes with full backward compatibility.

---

## Integration Point #6: Cache Invalidation

### The Problem

The now-playing response is cached in KV (key: `now-playing`, TTL: ~60s via `kv-cache.ts`). When an artist updates their profile (display name, avatar), the cached now-playing response may contain stale data if that artist's track is currently playing.

### How Stale Can It Get?

KV cache TTL is 60 seconds (the KV minimum). In the worst case, after a profile update, the now-playing response shows the old display name for up to 60 seconds. This is acceptable for a radio station -- profile updates are infrequent events.

Additionally, KV's eventual consistency model means even after deletion, some edge locations may briefly serve stale data. Cloudflare's 2025 KV improvements provide read-your-own-writes consistency from the same PoP, but cross-PoP propagation may take a few seconds.

### Invalidation Strategy

**On profile update (PUT /api/profile):** Invalidate the KV cache immediately.

```typescript
// In profile.ts route, after successful upsert:
await c.env.KV.delete('now-playing')
```

The existing codebase already does this in several places:
- `QueueBrain.ts` line 126: `this.env.KV.delete('now-playing').catch(() => {})`
- `tip.ts` line 71: `await c.env.KV.delete('now-playing')`
- `kv-cache.ts` exports `invalidateNowPlaying(kv)` function for this exact purpose

So the pattern is established, tested, and there is even a dedicated helper function (`invalidateNowPlaying` from `lib/kv-cache.ts`).

**What happens after invalidation:**
1. Next poll from any frontend hits cache miss
2. `now-playing.ts` queries QueueBrain DO for current track ID
3. D1 query with LEFT JOIN picks up updated `tracks.artist_name` (from denormalization write-through) and current `artists.avatar_url`/`artists.username`
4. Fresh response is cached in KV
5. All subsequent polls get fresh data

**Edge case: Profile update when that artist's track is NOT playing.** No action needed -- the cached now-playing response does not contain that artist's data, so there is nothing stale. Still worth invalidating because the queue preview might contain that artist's tracks.

**Edge case: Profile update race with track transition.** The QueueBrain alarm already invalidates KV on track transitions. Profile update invalidation is additive -- two deletes are fine (KV delete is idempotent).

### No Complex Versioning Needed

Some architectures use cache versioning (embed a version number in the cache key) or ETags. This is unnecessary here because:
- KV TTL is already short (60s)
- Profile updates are rare (minutes/hours apart)
- Explicit invalidation handles the immediate case
- The cost of a cache miss is one D1 query + one DO call (milliseconds)
- The existing `invalidateNowPlaying` helper already exists

**Confidence:** HIGH -- exact pattern already used throughout the codebase.

---

## Integration Point #7: Migration Strategy

### Safety Requirements

1. **Zero downtime** -- no breaking changes to existing API responses
2. **No data loss** -- existing tracks and their metadata preserved
3. **Backward compatible** -- agents without profiles continue to work identically
4. **Incremental** -- can deploy database changes, API changes, and frontend changes in separate steps

### Migration File: `api/migrations/0003_artists-table.sql`

```sql
-- Create artists table for profile data
-- wallet is PRIMARY KEY (one profile per wallet)
-- username is UNIQUE with COLLATE NOCASE (case-insensitive uniqueness)

CREATE TABLE IF NOT EXISTS artists (
  wallet TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_username
  ON artists(username COLLATE NOCASE);
```

**Key safety properties:**
- `CREATE TABLE IF NOT EXISTS` -- idempotent, safe to re-run
- No `ALTER TABLE` on existing `tracks` table -- the `artist_name` column already exists from migration 0002
- No foreign key constraints -- tracks continue to work independently of profiles
- No data backfill required -- artists table starts empty, profiles are created on-demand via the API
- `COLLATE NOCASE` on username -- prevents "Alice" and "alice" from coexisting, handled at the database level
- No `BEGIN TRANSACTION` -- D1 wraps each migration in a transaction automatically

### Deployment Order

1. **Apply D1 migration** (`wrangler d1 migrations apply claw-fm --remote`) -- creates empty table, zero risk to existing data or functionality
2. **Deploy API with new routes** -- new endpoints become available (`/api/profile`, `/api/artist/*`), existing endpoints unchanged, LEFT JOINs gracefully return NULL for all profiles (none exist yet)
3. **Deploy frontend with routing** -- new pages become available (`/artist/:username`), existing player UI unchanged, profile links show only when `artistUsername` is non-null

Each step is independently safe and independently reversible. If step 2 has issues, roll back the Worker -- the empty table has no impact. If step 3 has issues, roll back Pages -- the API still works.

### Username Constraints

Validated at the API level (in the profile route handler, following the pattern of `validateSubmission` in `middleware/validation.ts`):

- Lowercase alphanumeric + hyphens only: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`
- Length: 3-30 characters
- Cannot start or end with hyphen
- Cannot be double-hyphen (`--`)
- Reserved words: `admin`, `api`, `audio`, `artist`, `artists`, `profile`, `settings`, `help`, `about`, `submit`, `queue`, `now-playing`, `health`, `dev`

**Confidence:** HIGH -- follows exact D1 migration pattern from v1.0 (`0001_tracks-schema.sql`, `0002_submission-fields.sql`).

---

## Integration Point #8: x402 Gating for Profile Endpoints

### Which Endpoints Need Payment?

| Endpoint | x402 Gated? | Rationale |
|----------|------------|-----------|
| `PUT /api/profile` | YES | Creates/updates profile, proves wallet identity, deters squatting |
| `GET /api/artist/:username` | NO | Public read, needed for profile pages by anyone |
| `GET /api/artist/by-wallet/:wallet` | NO | Public read, needed by player UI enrichment |

### Payment as Authentication

The x402 pattern provides both payment AND authentication in a single step. When `verifyPayment` succeeds, it returns `walletAddress` -- this IS the authenticated identity. No session tokens, no JWTs, no cookies, no new auth dependency.

The profile route uses this wallet address to determine which profile to upsert:

```typescript
// profile.ts
const paymentResult = await verifyPayment(c, requirements)
if (!paymentResult.valid) return paymentResult.error!

const walletAddress = paymentResult.walletAddress!
// walletAddress is now the cryptographically proven identity
// UPSERT artists WHERE wallet = walletAddress
```

This means:
- Only the wallet owner can create/update their profile (cryptographic proof via x402 payment)
- Each profile change costs 0.01 USDC (deters username squatting and rapid changes)
- No additional auth middleware, session management, or token refresh logic needed
- Pattern is identical to track submission (`submit.ts` line 49-65)
- Agent clients already know how to construct x402 payment headers (they do it for submission)

### Username Changes

Username changes use the same `PUT /api/profile` endpoint. Each call costs 0.01 USDC. The endpoint:
1. Verifies payment (extracts wallet address as identity)
2. Validates new username format
3. Checks username availability: `SELECT 1 FROM artists WHERE username = ? COLLATE NOCASE AND wallet != ?`
4. Upserts the profile with the new username
5. If `display_name` changed: `UPDATE tracks SET artist_name = ? WHERE wallet = ?`
6. Invalidates KV cache: `await invalidateNowPlaying(c.env.KV)`
7. Returns updated profile

**Confidence:** HIGH -- direct reuse of existing, proven x402 pattern.

---

## Suggested Build Order

Based on dependency analysis of the integration points above, the recommended phase structure for the v1.1 roadmap:

### Phase 1: Database + Shared Types + API Endpoints

**Build first because everything else depends on it.**

1. Write and apply migration `0003_artists-table.sql`
2. Add shared types (`ArtistProfile`, `TrackSummary`, `ProfileUpdateResponse`, updated `NowPlayingTrack`) to `@claw/shared`
3. Create `api/src/lib/avatar.ts` (avatar validation + R2 upload)
4. Create `api/src/routes/profile.ts` (PUT /api/profile with x402, multipart, upsert, avatar upload)
5. Create `api/src/routes/artist.ts` (GET /api/artist/:username with track catalog, GET /api/artist/by-wallet/:wallet)
6. Add username validation logic (format, reserved words, availability)
7. Register routes in `api/src/index.ts`

**Deliverable:** Working API endpoints that can be tested with curl or agent clients before any frontend work begins. Agents can create profiles immediately.

### Phase 2: Data Flow Enrichment (Now-Playing, Submit, Cache)

**Build second because it connects profiles to the existing data flow without frontend changes.**

1. Modify `now-playing.ts` queries to LEFT JOIN artists table (all 2 queries)
2. Modify `queue.ts` queries to LEFT JOIN artists table (all 2 queries)
3. Modify `submit.ts` to look up artist display_name on submission
4. Add KV invalidation to profile route (use existing `invalidateNowPlaying`)
5. Update `NowPlayingTrack` construction to include `artistUsername`/`artistAvatarUrl` fields
6. On profile upsert: batch-update `tracks.artist_name` for all tracks by that wallet

**Deliverable:** Existing player UI gets richer data via the same API endpoints. Even without profile pages, agents with profiles see their display name in the now-playing display. Fully backward compatible -- agents without profiles see no change.

### Phase 3: Frontend Routing + Profile Pages

**Build last because it consumes everything above.**

1. Install wouter (`npm install wouter`)
2. Extract current main content from `App.tsx` into `RadioView` component
3. Refactor `App.tsx` to use wouter `<Switch>` / `<Route>` with persistent PlayerBar
4. Create `ArtistProfile` page component (fetches `GET /api/artist/:username`, displays profile + track catalog)
5. Make artist name in player UI a `<Link>` to `/artist/:username` (when `artistUsername` is available)
6. Add avatar display in player UI (with identicon fallback when no avatar)
7. Verify Cloudflare Pages SPA fallback works for `/artist/:username` refresh

**Deliverable:** Full feature complete. Profile pages accessible at `/artist/:username`, player links to profiles, avatars displayed.

### Dependency Graph

```
Migration 0003 (artists table)
  |
  v
Shared Types (@claw/shared -- ArtistProfile, updated NowPlayingTrack)
  |
  +---> Profile API (routes/profile.ts + routes/artist.ts + lib/avatar.ts)
  |       |
  |       +---> Data Flow Enrichment (LEFT JOINs in now-playing.ts + queue.ts)
  |       |       |
  |       |       +---> Submit enrichment (lookup display_name)
  |       |       |
  |       |       +---> KV invalidation on profile update
  |       |
  +---+---+---> Frontend Routing + Profile Pages (wouter + ArtistProfile page)
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Auth System

**What:** Adding JWT tokens, session cookies, or a separate authentication layer for profile management.
**Why bad:** Adds complexity, new dependencies, new attack surface, session management, token refresh logic. The x402 payment header already cryptographically proves wallet ownership on every request.
**Instead:** Use `verifyPayment` return value as identity. Same pattern as submit.ts and tip.ts.

### Anti-Pattern 2: Foreign Key on tracks.wallet -> artists.wallet

**What:** Adding `FOREIGN KEY (wallet) REFERENCES artists(wallet)` to the tracks table.
**Why bad:** Blocks track submission for agents without profiles (the majority at launch). D1 enforces FK by default. Would require every submitting wallet to have a profile first, breaking the existing submission flow.
**Instead:** Implicit relationship via LEFT JOIN. No FK constraint. Tracks and profiles are independent.

### Anti-Pattern 3: Eager Profile Fetch in Frontend

**What:** Frontend makes separate API call to `/api/artist/by-wallet/:wallet` on every now-playing poll to get profile data.
**Why bad:** Doubles API calls per poll cycle (from 1 to 2). N+1 problem for queue preview. Adds latency and complexity to the frontend.
**Instead:** Enrich the now-playing/queue API responses with profile data via LEFT JOIN in the D1 query. One response contains everything.

### Anti-Pattern 4: Separate R2 Bucket for Avatars

**What:** Creating a new R2 bucket (`claw-fm-avatars`) and a new R2 binding for avatar storage.
**Why bad:** New wrangler.toml binding, new env type definition, new serving route. All for a handful of small images that are conceptually part of the same media storage.
**Instead:** Use existing `AUDIO_BUCKET` with `avatars/` prefix. Served via existing `/audio/*` catch-all route.

### Anti-Pattern 5: Server-Side Image Resizing for v1.1

**What:** Adding Cloudflare Images binding to resize avatars on upload.
**Why bad:** Additional product dependency (Cloudflare Images), additional billing (~$0.50/1000 transformations), additional wrangler.toml config, and complexity for a feature that serves a few hundred artists at most in v1.1.
**Instead:** Accept as-is with type + size validation (2MB limit). CSS `object-fit: cover` handles display. Add resizing later if bandwidth becomes a concern.

### Anti-Pattern 6: Complex Cache Versioning

**What:** Adding version stamps, ETags, or cache busting tokens to KV entries to handle profile-update freshness.
**Why bad:** Over-engineering. KV TTL is already 60 seconds. Profile updates are rare (once per artist per session). The existing `invalidateNowPlaying(kv)` function handles immediate invalidation.
**Instead:** Call `invalidateNowPlaying(c.env.KV)` on profile update. Same pattern used by tip.ts and QueueBrain.ts.

### Anti-Pattern 7: react-router for 2 Routes

**What:** Installing react-router v7 (18.7KB gzipped) for a project with exactly 2 routes.
**Why bad:** 9x the bundle size of wouter. Brings loaders, actions, data APIs, and complexity that is unnecessary for `/` and `/artist/:username`. The project already has bundle size concerns (1+ MB chunk noted in STATE.md).
**Instead:** Use wouter v3.9.0 (2.1KB gzipped). Zero dependencies. React 19 compatible. Hooks-based API that fits the existing pattern.

---

## Scalability Considerations

| Concern | At 100 artists | At 10K artists | At 100K artists |
|---------|---------------|---------------|-----------------|
| D1 LEFT JOIN speed | Negligible (PK lookup) | Still fast (indexed on PK) | Consider caching artist data in KV by wallet |
| R2 avatar storage | ~200MB (2MB each max) | ~20GB | ~200GB (well within R2 limits) |
| Username lookup | B-tree index, instant | B-tree index, instant | B-tree index, instant |
| tracks.artist_name update | 1-50 tracks per artist | 1-50 tracks per artist | Same (per-artist operation, not global) |
| KV invalidation | Rare (profile updates infrequent) | More frequent but still trivial | Consider per-track caching instead of single now-playing key |
| Profile page load | 1 D1 query + 1 track list query | Same | Same (per-profile, not global) |

The architecture scales well to 10K+ artists without any changes. The only concern at 100K+ would be the now-playing LEFT JOIN adding microseconds, which could be mitigated by caching artist profiles in KV (keyed by wallet, TTL of hours).

---

## Sources

**HIGH confidence (direct codebase analysis):**
- All 59 source files in the claw.fm repository examined directly
- Migration patterns from `api/migrations/0001_tracks-schema.sql` and `0002_submission-fields.sql`
- x402 payment pattern from `api/src/middleware/x402.ts` and `api/src/routes/submit.ts`
- KV cache pattern from `api/src/lib/kv-cache.ts`
- Image upload pattern from `api/src/lib/image.ts`
- R2 serving from `api/src/routes/audio.ts`
- Now-playing data flow from `api/src/routes/now-playing.ts`

**HIGH confidence (official documentation):**
- [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Foreign Keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- [Cloudflare Pages SPA Routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Cloudflare KV: How KV Works](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Cloudflare Images Binding for Workers](https://developers.cloudflare.com/images/transform-images/bindings/)
- [Transform User-Uploaded Images Before Uploading to R2](https://developers.cloudflare.com/images/tutorials/optimize-user-uploaded-image/)

**MEDIUM confidence (verified via multiple sources):**
- [wouter v3.9.0 GitHub](https://github.com/molefrog/wouter) -- React 19 compatibility, bundle size, API
- [Redesigning Workers KV for Increased Availability](https://blog.cloudflare.com/rearchitecting-workers-kv-for-redundancy/) -- RYOW consistency improvements
