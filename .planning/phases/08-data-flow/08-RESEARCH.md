# Phase 8: Data Flow Enrichment - Research

**Researched:** 2026-02-04
**Domain:** SQL LEFT JOIN data enrichment, cache invalidation, fallback display patterns
**Confidence:** HIGH

## Summary

Phase 8 enriches now-playing and queue API responses with artist profile data using SQL LEFT JOIN. The implementation adds four optional fields to `NowPlayingTrack` responses: `artistUsername`, `artistDisplayName`, `artistAvatarUrl`, and `artistBio`. Tracks from wallets without profiles gracefully fall back to truncated wallet addresses and identicon avatars.

The research confirms that D1 fully supports LEFT JOIN operations (leveraging SQLite's query engine), and the existing codebase already has wallet truncation patterns (`0x1234...abcd` format) and a server-side identicon generator using `blockies-ts`. The KV cache invalidation helper `invalidateNowPlaying()` is already used throughout the codebase for track transitions, making profile update invalidation straightforward.

Key findings indicate that LEFT JOIN with COALESCE provides clean NULL handling for missing profiles, the existing KV cache key (`now-playing`) should be invalidated when profiles are created/updated, and bio truncation should happen server-side before caching to ensure consistent display. Performance impact is minimal since JOIN only runs on cache misses (~10-20/hour as noted in architectural notes), and proper indexes on `artist_profiles.wallet` already exist from Phase 7.

**Primary recommendation:** Extend the existing D1 queries in `/api/src/routes/now-playing.ts` and `/api/src/routes/queue.ts` with LEFT JOIN to `artist_profiles` table, add profile change detection to invalidate KV cache, and use COALESCE for graceful NULL fallbacks.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| D1 | N/A | SQLite-based database with JOIN support | Already used, supports LEFT JOIN via SQLite engine |
| Workers KV | N/A | Edge cache with delete-based invalidation | Already used, existing `invalidateNowPlaying` helper |
| blockies-ts | 1.0.0 | Server-side identicon generation | Already in api/package.json, used in `identicon.ts` |
| SQLite COALESCE | N/A | NULL fallback function | Built-in, standard pattern for optional joins |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | N/A | No additional libraries needed | Existing stack covers all requirements |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| LEFT JOIN | Denormalized batch updates | LEFT JOIN is simpler, no batch job needed, always fresh |
| Server-side identicons | Client-side jdenticon | Server-side ensures consistent avatarUrl format, no client dependency |
| Per-track cache | Per-artist cache + stitching | Current per-track pattern matches existing KV structure |

**Installation:**
```bash
# No new dependencies needed
# All required libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
api/src/
├── routes/
│   ├── now-playing.ts           # Extend with LEFT JOIN
│   ├── queue.ts                 # Extend with LEFT JOIN
│   ├── profile.ts               # Add cache invalidation on update
│   └── avatar.ts                # Add cache invalidation on update
├── lib/
│   ├── kv-cache.ts              # Already has invalidateNowPlaying
│   ├── identicon.ts             # Already generates data URIs
│   └── text-utils.ts            # New: bio truncation helper
packages/shared/src/
└── index.ts                     # Extend NowPlayingTrack interface
```

### Pattern 1: LEFT JOIN with COALESCE for Enrichment
**What:** Query track data with optional artist profile JOIN, using COALESCE for NULL handling

**When to use:** Enriching primary data with optional related records where absence is valid

**Example:**
```sql
-- Source: SQLite LEFT JOIN documentation + existing D1 patterns
SELECT
  t.id,
  t.title,
  t.wallet,
  t.artist_name,
  t.duration,
  t.file_url,
  t.cover_url,
  t.genre,
  -- Profile fields (NULL if no profile exists)
  ap.username AS profile_username,
  ap.display_name AS profile_display_name,
  ap.avatar_url AS profile_avatar_url,
  ap.bio AS profile_bio
FROM tracks t
LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
WHERE t.id = ?
```

**COALESCE for fallback display:**
```typescript
// In TypeScript response builder
const track: NowPlayingTrack = {
  id: row.id,
  title: row.title,
  artistWallet: row.wallet,
  // Legacy artistName field (from submission)
  artistName: row.artist_name,
  // NEW: Profile fields (optional)
  artistUsername: row.profile_username || undefined,
  artistDisplayName: row.profile_display_name || undefined,
  artistAvatarUrl: row.profile_avatar_url || undefined,
  artistBio: row.profile_bio ? truncateBio(row.profile_bio) : undefined,
  // ... rest of fields
}
```

**Important:** The LEFT JOIN returns NULL for profile columns when no profile exists. Frontend handles NULL by falling back to wallet truncation.

### Pattern 2: Cache Invalidation on Profile Changes
**What:** Call `invalidateNowPlaying(KV)` when artist profiles are created or updated

**When to use:** After any operation that changes data included in cached responses

**Example:**
```typescript
// Source: Existing kv-cache.ts + QueueBrain.ts patterns
import { invalidateNowPlaying } from '../lib/kv-cache'

// In /api/profile PUT endpoint (after successful profile update)
await c.env.DB.prepare(`
  UPDATE artist_profiles SET display_name = ?, updated_at = unixepoch()
  WHERE wallet = ?
`).bind(displayName, walletAddress).run()

// Invalidate cache so next poll sees updated profile
await invalidateNowPlaying(c.env.KV)

return c.json({ success: true })
```

**Why:** KV cache has 60s eventual consistency. Calling `delete()` ensures stale profile data doesn't persist for a full TTL cycle. Next poll will fetch fresh data with LEFT JOIN.

**Note:** The existing `invalidateNowPlaying` helper already has best-effort error handling (`try/catch` with silent failure), so cache invalidation never blocks profile updates.

### Pattern 3: Server-Side Bio Truncation
**What:** Truncate bio text to ~100 characters on the server before caching

**When to use:** Any field that should have consistent length across all responses

**Example:**
```typescript
// Source: JavaScript string truncation best practices
function truncateBio(bio: string, maxLength: number = 100): string {
  if (bio.length <= maxLength) {
    return bio
  }

  // Truncate at word boundary if possible
  const truncated = bio.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')

  if (lastSpace > maxLength * 0.8) {
    // If last space is in final 20%, use it
    return truncated.slice(0, lastSpace) + '...'
  }

  // Otherwise, hard truncate
  return truncated + '...'
}
```

**Why server-side truncation:**
- Ensures consistent bio length in KV cache
- Reduces cache size (shorter JSON payloads)
- Frontend doesn't need to handle truncation logic
- Prevents cache bloat from extremely long bios

### Pattern 4: Identicon Fallback for Missing Avatars
**What:** Use existing identicon generator for wallets without uploaded avatars

**When to use:** Display logic in frontend when `artistAvatarUrl` is undefined

**Example:**
```typescript
// Source: Existing web/src/components/Player/NowPlaying.tsx pattern
// Frontend (React component)
function ArtistAvatar({ track }: { track: NowPlayingTrack }) {
  // If profile exists with avatar, use it
  if (track.artistAvatarUrl) {
    return <img src={track.artistAvatarUrl} alt="Artist avatar" />
  }

  // If profile exists but no avatar, or no profile at all
  // Generate identicon from wallet address
  const identiconUrl = generateIdenticon(track.artistWallet)
  return <img src={identiconUrl} alt="Artist identicon" />
}
```

**Note:** Identicon generation happens client-side for performance. The `blockies-ts` library in `api/src/lib/identicon.ts` is used during submission for cover fallbacks, but avatars use client-side generation to avoid server load.

### Pattern 5: Extended Shared Types
**What:** Add optional profile fields to `NowPlayingTrack` interface without breaking existing consumers

**When to use:** Extending API responses with backward-compatible additions

**Example:**
```typescript
// Source: Existing packages/shared/src/index.ts patterns
export interface NowPlayingTrack {
  id: number
  title: string
  artistWallet: string
  artistName?: string          // Legacy field from submission
  duration: number
  coverUrl?: string
  fileUrl: string
  genre: string

  // NEW Phase 8 fields (all optional for backward compatibility)
  artistUsername?: string       // NULL if no profile
  artistDisplayName?: string    // NULL if no profile
  artistAvatarUrl?: string      // NULL if no profile or no avatar uploaded
  artistBio?: string            // NULL if no profile, truncated to ~100 chars
}
```

**Backward compatibility:** All new fields are optional. Existing frontend code that only checks `artistName` continues to work. Phase 9 frontend can use new fields when available.

### Anti-Patterns to Avoid

- **COALESCE in JOIN condition:** Don't use `COALESCE(ap.wallet, t.wallet)` in the ON clause — it prevents index usage and causes full table scans
- **Client-side bio truncation:** Truncating in frontend means inconsistent display and larger cached payloads
- **Invalidating on every request:** Only invalidate on profile changes, not on every now-playing fetch
- **Blocking on cache invalidation:** Use existing best-effort pattern — cache delete failures should never block profile updates
- **Eager JOIN on QueueBrain:** Don't add LEFT JOIN to QueueBrain internal queries — enrichment only happens at API response layer

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Identicon generation | Custom SVG generator | blockies-ts (existing) | Already in codebase, deterministic, tested |
| Wallet truncation | Custom slice logic | Existing pattern `0x1234...abcd` | Already used in 3+ components, consistent format |
| Cache invalidation | Custom KV delete logic | `invalidateNowPlaying()` helper | Already handles best-effort error handling |
| Text truncation | Regex-based truncation | Word-boundary-aware slice | Edge cases: Unicode, emoji, CJK characters |
| NULL handling in SQL | Multiple IF statements | COALESCE function | Standard SQL, index-friendly, readable |

**Key insight:** Phase 7 and earlier phases already solved identicon generation, wallet display, and cache invalidation. Reuse these patterns rather than reimplementing.

## Common Pitfalls

### Pitfall 1: COALESCE in JOIN Condition Prevents Index Usage
**What goes wrong:** Using `LEFT JOIN artist_profiles ap ON COALESCE(ap.wallet, '') = t.wallet` prevents SQLite from using the index on `ap.wallet`, causing full table scans.

**Why it happens:** Applying a function (even COALESCE) to a column in a JOIN condition makes the optimizer unable to use indexes on that column.

**How to avoid:** Use COALESCE in the SELECT list or WHERE clause, never in the JOIN ON condition:

```sql
-- BAD: COALESCE in JOIN prevents index usage
LEFT JOIN artist_profiles ap ON COALESCE(ap.wallet, '') = t.wallet

-- GOOD: Simple equality in JOIN, COALESCE in SELECT
LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
SELECT COALESCE(ap.display_name, t.artist_name) AS display_name
```

**Warning signs:**
- Query plan shows "SCAN TABLE artist_profiles" instead of "SEARCH TABLE artist_profiles USING INDEX"
- Slow response times on enriched queries
- D1 metrics show high read units per query

### Pitfall 2: Forgetting to Invalidate Cache After Profile Updates
**What goes wrong:** User updates their display name or avatar, but now-playing still shows old data for 60+ seconds due to KV cache TTL.

**Why it happens:** KV cache is set with 60s TTL, and eventual consistency means cache entries can persist even longer in distant regions.

**How to avoid:** Call `invalidateNowPlaying(KV)` after every profile mutation:

```typescript
// After profile update
await c.env.DB.prepare(`UPDATE artist_profiles...`).run()

// CRITICAL: Invalidate cache
await invalidateNowPlaying(c.env.KV)
```

**Warning signs:**
- Users report "my profile update isn't showing in the player"
- Profile changes appear after 60+ seconds
- Test environment shows stale data after profile edits

### Pitfall 3: Client-Side Bio Truncation Creates Inconsistent Cache
**What goes wrong:** If bio truncation happens in frontend, the KV cache stores full 280-character bios, wasting space and bandwidth. Different clients might truncate differently.

**Why it happens:** Truncation logic added to React components instead of API response builder.

**How to avoid:** Truncate bio server-side before building the response object:

```typescript
// In API response builder (now-playing.ts, queue.ts)
artistBio: row.profile_bio ? truncateBio(row.profile_bio, 100) : undefined
```

**Warning signs:**
- KV cache payloads are unexpectedly large
- Frontend displays inconsistent bio lengths
- Network tab shows full bios in API responses

### Pitfall 4: Adding Profile Fields to QueueBrain Internal Queries
**What goes wrong:** Adding LEFT JOIN to QueueBrain's `fetchTrackById()` internal method adds complexity and latency to selection logic, which runs every track transition.

**Why it happens:** Misunderstanding the architecture — QueueBrain only needs track IDs and durations for selection. Enrichment happens at API response layer.

**How to avoid:** Keep QueueBrain queries minimal. Only add LEFT JOIN to:
- `/api/now-playing` route handler
- `/api/queue` route handler

**Never add enrichment to:**
- QueueBrain `fetchTrackById()` (internal use only)
- QueueBrain `fetchAllTracks()` (selection metadata only)

**Warning signs:**
- QueueBrain alarm handler latency increases
- Track transitions slow down
- QueueBrain queries fetch unused profile data

### Pitfall 5: Not Handling NULL vs Undefined in TypeScript
**What goes wrong:** D1 returns `null` for missing LEFT JOIN columns, but TypeScript interfaces use `undefined` for optional fields. Type mismatches cause runtime errors.

**Why it happens:** SQL NULL !== TypeScript undefined. Explicit conversion needed.

**How to avoid:** Convert NULL to undefined when building response objects:

```typescript
// BAD: Passes NULL through (type error in strict mode)
artistUsername: row.profile_username

// GOOD: Convert NULL to undefined
artistUsername: row.profile_username || undefined
```

**Warning signs:**
- TypeScript strict null check errors
- Frontend receives `null` instead of missing keys
- JSON payloads contain `"artistUsername": null` instead of omitting the key

### Pitfall 6: Username Change Breaks Now-Playing for Active Tracks
**What goes wrong:** User changes username while their track is playing. Next poll shows old username because cache TTL hasn't expired and invalidation only runs on profile update, not username change specifically.

**Why it happens:** Username changes are rare but need immediate cache invalidation.

**How to avoid:** Invalidate cache on ANY profile field change, including username:

```typescript
// In /api/profile PUT endpoint
// After ANY field update (username, display_name, bio, avatar_url)
await invalidateNowPlaying(c.env.KV)
```

This pattern is already planned — no special handling needed for username vs other fields.

**Warning signs:**
- User reports "username changed but player still shows old name"
- Cache serves stale username data
- Manual cache flush fixes the issue temporarily

## Code Examples

Verified patterns from official sources and existing codebase:

### Enriched Now-Playing Query
```typescript
// Source: Existing now-playing.ts + SQLite LEFT JOIN docs
// In api/src/routes/now-playing.ts

// Step 4: Current track exists -- fetch with LEFT JOIN enrichment
const currentTrack = await c.env.DB.prepare(`
  SELECT
    t.id,
    t.title,
    t.wallet,
    t.artist_name,
    t.duration,
    t.file_url,
    t.cover_url,
    t.genre,
    ap.username AS profile_username,
    ap.display_name AS profile_display_name,
    ap.avatar_url AS profile_avatar_url,
    ap.bio AS profile_bio
  FROM tracks t
  LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
  WHERE t.id = ?
`).bind(state.currentTrackId).first<{
  id: number
  title: string
  wallet: string
  artist_name: string
  duration: number
  file_url: string
  cover_url: string
  genre: string
  profile_username: string | null
  profile_display_name: string | null
  profile_avatar_url: string | null
  profile_bio: string | null
}>()

if (!currentTrack) {
  // Track was deleted, return waiting state
  const response: NowPlayingResponse = {
    state: 'waiting',
    message: 'Waiting for first track'
  }
  await cacheNowPlaying(c.env.KV, response)
  return c.json(response)
}

// Build enriched NowPlayingTrack
const track: NowPlayingTrack = {
  id: currentTrack.id,
  title: currentTrack.title,
  artistWallet: currentTrack.wallet,
  artistName: currentTrack.artist_name,
  duration: currentTrack.duration,
  coverUrl: `/audio/${currentTrack.cover_url}`,
  fileUrl: `/audio/${currentTrack.file_url}`,
  genre: currentTrack.genre,
  // NEW: Profile enrichment (NULL safe)
  artistUsername: currentTrack.profile_username || undefined,
  artistDisplayName: currentTrack.profile_display_name || undefined,
  artistAvatarUrl: currentTrack.profile_avatar_url || undefined,
  artistBio: currentTrack.profile_bio ? truncateBio(currentTrack.profile_bio) : undefined
}
```

### Queue Endpoint with Bulk Enrichment
```typescript
// Source: Existing queue.ts + LEFT JOIN pattern
// In api/src/routes/queue.ts

// Step 4: Fetch metadata for each track ID with profile enrichment
const placeholders = trackIds.map(() => '?').join(', ')
const trackResults = await c.env.DB.prepare(`
  SELECT
    t.id,
    t.title,
    t.wallet,
    t.artist_name,
    t.duration,
    t.file_url,
    t.cover_url,
    t.genre,
    ap.username AS profile_username,
    ap.display_name AS profile_display_name,
    ap.avatar_url AS profile_avatar_url,
    ap.bio AS profile_bio
  FROM tracks t
  LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet
  WHERE t.id IN (${placeholders})
`).bind(...trackIds).all<{
  id: number
  title: string
  wallet: string
  artist_name: string
  duration: number
  file_url: string
  cover_url: string
  genre: string
  profile_username: string | null
  profile_display_name: string | null
  profile_avatar_url: string | null
  profile_bio: string | null
}>()

// Build enriched track map
const trackMap = new Map<number, NowPlayingTrack>()

if (trackResults.results) {
  for (const row of trackResults.results) {
    trackMap.set(row.id, {
      id: row.id,
      title: row.title,
      artistWallet: row.wallet,
      artistName: row.artist_name,
      duration: row.duration,
      coverUrl: `/audio/${row.cover_url}`,
      fileUrl: `/audio/${row.file_url}`,
      genre: row.genre,
      // NEW: Profile enrichment
      artistUsername: row.profile_username || undefined,
      artistDisplayName: row.profile_display_name || undefined,
      artistAvatarUrl: row.profile_avatar_url || undefined,
      artistBio: row.profile_bio ? truncateBio(row.profile_bio) : undefined
    })
  }
}
```

### Bio Truncation Helper
```typescript
// Source: JavaScript string truncation best practices
// New file: api/src/lib/text-utils.ts

/**
 * Truncate bio text to a maximum length, preferring word boundaries
 *
 * @param text Bio text to truncate
 * @param maxLength Maximum character length (default: 100)
 * @returns Truncated text with ellipsis if truncated
 */
export function truncateBio(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text
  }

  // Truncate to maxLength
  const truncated = text.slice(0, maxLength)

  // Find last space in final 20% of truncated text
  const lastSpace = truncated.lastIndexOf(' ')
  const threshold = maxLength * 0.8

  if (lastSpace > threshold) {
    // Found a space in the final 20%, use it for cleaner break
    return truncated.slice(0, lastSpace) + '...'
  }

  // No suitable space found, hard truncate
  return truncated + '...'
}
```

### Cache Invalidation on Profile Update
```typescript
// Source: Existing profile.ts + kv-cache.ts pattern
// In api/src/routes/profile.ts

import { invalidateNowPlaying } from '../lib/kv-cache'

profileRoute.put('/', async (c) => {
  // ... validation and payment steps ...

  // Update profile in D1
  const result = await c.env.DB.prepare(`
    UPDATE artist_profiles
    SET username = ?, display_name = ?, bio = ?, updated_at = unixepoch()
    WHERE wallet = ?
  `).bind(username, displayName, bio || null, walletAddress).run()

  if (result.meta.changes === 0) {
    return c.json({
      error: 'PROFILE_NOT_FOUND',
      message: 'No profile found for this wallet'
    }, 404)
  }

  // CRITICAL: Invalidate now-playing cache
  // Next poll will fetch fresh profile data via LEFT JOIN
  await invalidateNowPlaying(c.env.KV)

  return c.json({ success: true })
})
```

### Cache Invalidation on Avatar Upload
```typescript
// Source: Existing avatar.ts + kv-cache.ts pattern
// In api/src/routes/avatar.ts

import { invalidateNowPlaying } from '../lib/kv-cache'

avatarRoute.post('/', async (c) => {
  // ... validation, payment, and upload steps ...

  // Update profile with avatar URL
  await c.env.DB.prepare(`
    UPDATE artist_profiles
    SET avatar_url = ?, updated_at = unixepoch()
    WHERE wallet = ?
  `).bind(avatarKey, walletAddress).run()

  // Invalidate cache so avatar appears in now-playing
  await invalidateNowPlaying(c.env.KV)

  return c.json({ avatarUrl: avatarKey }, 200)
})
```

### Extended Shared Types
```typescript
// Source: Existing packages/shared/src/index.ts
// Extend existing NowPlayingTrack interface

export interface NowPlayingTrack {
  id: number
  title: string
  artistWallet: string
  artistName?: string          // Legacy field from track submission
  duration: number             // milliseconds
  coverUrl?: string
  fileUrl: string
  genre: string

  // NEW Phase 8: Artist profile enrichment fields
  artistUsername?: string       // From artist_profiles.username (NULL if no profile)
  artistDisplayName?: string    // From artist_profiles.display_name (NULL if no profile)
  artistAvatarUrl?: string      // From artist_profiles.avatar_url (NULL if no profile/avatar)
  artistBio?: string            // From artist_profiles.bio, truncated to ~100 chars
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Denormalized batch updates | LEFT JOIN enrichment | Architecture decision (v1.1) | Simpler code, always fresh, no batch job |
| Client-side cache invalidation | Server-side `invalidateNowPlaying()` | Phase 3 (queue/now-playing) | Centralized, consistent, best-effort error handling |
| Manual NULL checks | COALESCE in SELECT | Standard SQL practice | Cleaner code, fewer conditionals |
| Frontend bio truncation | Server-side truncation | Best practice | Consistent display, smaller cache payloads |
| Custom identicon libs | blockies-ts | Phase 2 (submission) | Deterministic, tested, TypeScript support |

**Deprecated/outdated:**
- **Denormalized profile copies in tracks table:** Use LEFT JOIN instead — denormalization creates stale data and sync complexity
- **Separate cache keys per artist:** Use existing per-track cache pattern — simpler invalidation, matches now-playing structure
- **Push-based profile updates:** Use poll-based eventual consistency — matches existing frontend polling, no WebSocket needed

## Open Questions

Things that couldn't be fully resolved:

1. **Identicon generation location (client vs server)**
   - What we know: `blockies-ts` is in api/package.json, currently used for cover fallbacks during submission
   - What's unclear: Whether to generate identicon avatars server-side (add to API response) or client-side (frontend generates from wallet)
   - Recommendation: Client-side generation — reduces server load, identicons are cheap to generate, existing frontend pattern from v1.0

2. **Cache granularity (per-track vs per-artist)**
   - What we know: Existing KV cache uses single key `now-playing` for entire response
   - What's unclear: Whether to add per-artist profile caching to reduce D1 queries
   - Recommendation: Keep existing per-track pattern — LEFT JOIN only runs on cache miss (~10-20/hour), added complexity not worth it

3. **Username change grace period**
   - What we know: Username changes are paid ($0.01 USDC via x402), immediately available
   - What's unclear: Whether to preserve old username links for 30 days or break immediately
   - Recommendation: Out of scope for Phase 8 — frontend routing (Phase 9) handles username-to-wallet mapping

4. **Mid-session profile creation behavior**
   - What we know: Cache invalidation triggers on profile create/update, next poll sees new data
   - What's unclear: Whether to force refresh or wait for next scheduled poll
   - Recommendation: Wait for next poll — consistent with existing behavior, users poll every 5s anyway

5. **Bio truncation length justification**
   - What we know: Context suggests ~100 characters
   - What's unclear: Exact length (100 vs 120 vs 150) and whether to count bytes or characters
   - Recommendation: 100 characters (not bytes) — balances detail with brevity, similar to Twitter bio previews

6. **Profile data in nextTrack field**
   - What we know: `nextTrack` is included when < 10s remaining for crossfade pre-buffer
   - What's unclear: Whether nextTrack should also include profile enrichment
   - Recommendation: Yes, enrich nextTrack — same LEFT JOIN query, consistent UX

## Sources

### Primary (HIGH confidence)
- [SQLite COALESCE documentation](https://int4.com/about-coalesce-left-outer-join-null-and-the-link-between-them/) - COALESCE with LEFT JOIN patterns
- [Cloudflare D1 SQL Statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/) - D1 SQL capabilities (SQLite engine)
- [Cloudflare Workers KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/) - KV cache consistency and invalidation
- [SQLite Query Optimizer Overview](https://sqlite.org/optoverview.html) - JOIN performance and index usage
- Existing codebase: `api/src/routes/now-playing.ts`, `api/src/routes/queue.ts`, `api/src/lib/kv-cache.ts` - Current patterns

### Secondary (MEDIUM confidence)
- [SQLite LEFT JOIN Performance Best Practices](https://developer.android.com/topic/performance/sqlite-performance-best-practices) - Indexing and optimization
- [JavaScript String Truncation](https://www.geeksforgeeks.org/javascript/javascript-program-to-truncate-a-string-to-a-certain-length-and-add-ellipsis/) - Word-boundary truncation patterns
- [Optimizing SQL LEFT JOIN Performance](https://chat2db.ai/resources/blog/optimizing-performance-with-left-join-in-sql-queries) - Indexing strategies
- [Jdenticon documentation](https://jdenticon.com/) - Identicon generation (alternative to blockies-ts)

### Tertiary (LOW confidence)
- [Cloudflare Workers KV Cache Patterns](https://oneuptime.com/blog/post/2026-01-27-cloudflare-workers-kv/view) - Community patterns (2026)
- Community discussions on KV invalidation timing and consistency

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in use (D1, KV, blockies-ts), no new dependencies
- Architecture: HIGH - LEFT JOIN patterns verified in SQLite docs, existing code patterns established
- Pitfalls: HIGH - Based on SQLite optimization docs and existing codebase patterns
- Cache invalidation: HIGH - Existing `invalidateNowPlaying` helper already used throughout codebase

**Research date:** 2026-02-04
**Valid until:** 90 days (2026-05-05) — Stack is stable, patterns are standard SQL/SQLite practices
