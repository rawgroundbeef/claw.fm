---
phase: 08-data-flow
plan: 02
subsystem: api
tags: [sql, left-join, data-enrichment, cache-invalidation, kv-cache]

# Dependency graph
requires:
  - phase: 08-data-flow
    plan: 01
    provides: NowPlayingTrack interface with optional profile fields and truncateBio utility
  - phase: 07-schema-api
    provides: artist_profiles table schema
provides:
  - Enriched now-playing API responses with artist profile data
  - Enriched queue API responses with artist profile data
  - KV cache invalidation on profile mutations
affects: [frontend-player-ui, frontend-queue-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [left-join-enrichment, cache-invalidation-on-mutation]

key-files:
  created: []
  modified:
    - api/src/routes/now-playing.ts
    - api/src/routes/queue.ts
    - api/src/routes/profile.ts
    - api/src/routes/avatar.ts

key-decisions:
  - "LEFT JOIN on wallet field (no COALESCE in JOIN condition for index efficiency)"
  - "Profile fields converted with || undefined (not ?? undefined) to also convert empty strings"
  - "Cache invalidation happens after DB write but before response fetch"
  - "All 4 D1 queries enriched: currentTrack, nextTrack, queue tracks, currentlyPlaying"

patterns-established:
  - "LEFT JOIN enrichment pattern: API layer enriches responses without denormalizing data"
  - "Cache invalidation on mutation: Write endpoints invalidate related KV cache keys"
  - "|| undefined for nullable SQL fields: Clean JSON output (omit undefined fields)"

# Metrics
duration: 2min
completed: 2026-02-04
---

# Phase 08 Plan 02: LEFT JOIN Enrichment and Cache Invalidation Summary

**Now-playing and queue endpoints enriched with artist profiles via LEFT JOIN; profile mutations invalidate KV cache**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-04T16:23:51Z
- **Completed:** 2026-02-04T16:25:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added LEFT JOIN artist_profiles to all D1 queries in now-playing.ts (currentTrack + nextTrack)
- Added LEFT JOIN artist_profiles to all D1 queries in queue.ts (queue tracks + currentlyPlaying)
- Profile updates invalidate now-playing KV cache after successful DB write
- Avatar uploads invalidate now-playing KV cache after successful DB write
- All profile fields use || undefined for clean JSON output (nulls become omitted fields)
- TypeScript compiles cleanly across all modified files

## Task Commits

Each task was committed atomically:

1. **Task 1: Add LEFT JOIN enrichment to now-playing and queue endpoints** - `b140f11` (feat)
2. **Task 2: Add KV cache invalidation to profile and avatar endpoints** - `154e017` (feat)

**Plan metadata:** (will be committed with STATE.md update)

## Files Created/Modified

- `api/src/routes/now-playing.ts` - Added LEFT JOIN enrichment for currentTrack and nextTrack queries, imported truncateBio
- `api/src/routes/queue.ts` - Added LEFT JOIN enrichment for queue tracks and currentlyPlaying queries, imported truncateBio
- `api/src/routes/profile.ts` - Added invalidateNowPlaying call after profile create/update
- `api/src/routes/avatar.ts` - Added invalidateNowPlaying call after avatar upload, added KV binding to Env type

## Decisions Made

**LEFT JOIN without COALESCE in JOIN condition:**
- Rationale: COALESCE in the ON clause prevents SQLite from using wallet index, hurting performance
- Pattern: `LEFT JOIN artist_profiles ap ON t.wallet = ap.wallet` (not `ON COALESCE(t.wallet, '') = ap.wallet`)
- All 4 queries follow this pattern for consistency

**|| undefined (not ?? undefined) for nullable fields:**
- Rationale: SQL NULL should become omitted JSON field, not `null` value
- Also converts empty strings to undefined for consistency
- Pattern: `artistUsername: row.profile_username || undefined`
- Cleaner API responses (consumers check field existence, not null values)

**Cache invalidation placement:**
- Invalidation happens after successful DB write but before response fetch
- Rationale: Ensures cache is cleared even if response generation fails
- Best-effort error handling in invalidateNowPlaying never blocks the mutation response

**All 4 queries enriched:**
- now-playing.ts: currentTrack + nextTrack (2 queries)
- queue.ts: queue tracks + currentlyPlaying (2 queries)
- Rationale: Complete profile data across all player surfaces for consistent UX

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward LEFT JOIN additions and cache invalidation calls.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 03 (frontend integration):**
- Now-playing API returns artistUsername, artistDisplayName, artistAvatarUrl, artistBio when profile exists
- Fields are omitted (not null) when no profile exists - clean JSON for frontend consumption
- Queue API returns enriched tracks and currentlyPlaying with same profile fields
- Profile updates reflected within one polling cycle (cache invalidation working)
- No breaking changes - existing consumers continue to work (new fields are optional)

**Integration notes:**
- Frontend can check `if (track.artistUsername)` to decide whether to show profile link
- Avatar URLs are R2 keys - prefix with `/audio/` route for browser display
- Bio is pre-truncated server-side to ~100 chars with word boundaries
- Username is guaranteed lowercase via COLLATE NOCASE (safe for URL routing)

---
*Phase: 08-data-flow*
*Completed: 2026-02-04*
