---
phase: 03-queue-now-playing
plan: 01
subsystem: api
tags: [durable-objects, kv, rotation-algorithm, exponential-decay, weighted-selection, cloudflare]

# Dependency graph
requires:
  - phase: 02-submission-pipeline
    provides: Track schema with created_at and tip_weight fields
provides:
  - Exponential decay rotation algorithm with tip boost weighting
  - KV cache helpers for now-playing state
  - NowPlayingResponse, QueueResponse, NowPlayingTrack shared types
  - Wrangler QUEUE_BRAIN DO and KV namespace bindings
affects: [03-02-queue-brain-do, 03-03-api-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Exponential decay weighting (10-day half-life)
    - Weighted random selection with binary search
    - Anti-repeat filtering with small catalog fallback
    - Smart TTL caching (5s waiting, track-end playing)

key-files:
  created:
    - api/src/lib/rotation.ts
    - api/src/lib/kv-cache.ts
  modified:
    - packages/shared/src/index.ts
    - api/wrangler.toml

key-decisions:
  - "10-day half-life for exponential decay (gentle decay, favors newer tracks)"
  - "Tip boost formula: 1 + (tip_weight / 1e17) where 0.1 ETH = 2x weight"
  - "Anti-repeat threshold: 5 tracks (disable filtering for small catalogs)"
  - "KV cache TTL: 5s for waiting state, track-end or 60s max for playing"
  - "Placeholder KV namespace IDs for local dev (wrangler dev creates local KV)"

patterns-established:
  - "calculateDecayWeight: Combines exponential decay with tip boost multiplier"
  - "selectTrackWeighted: Weighted random with anti-repeat and small catalog fallback"
  - "Binary search for O(log n) weighted selection from cumulative weights"
  - "MIN_WEIGHT floor (0.001) prevents zero-weight edge cases"

# Metrics
duration: 1.6min
completed: 2026-02-01
---

# Phase 03 Plan 01: Foundation Summary

**Exponential decay rotation algorithm (10-day half-life), tip boost weighting (0.1 ETH = 2x), KV cache helpers, shared now-playing types, and DO/KV wrangler bindings**

## Performance

- **Duration:** 1.6 min
- **Started:** 2026-02-01T21:37:18Z
- **Completed:** 2026-02-01T21:38:56Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Rotation algorithm with exponential decay (10-day half-life) and tip boost weighting (0.1 ETH = 2x)
- Weighted random selection with anti-repeat filtering and small catalog fallback (< 5 tracks)
- KV cache helpers with smart TTL (5s waiting, track-end or 60s max playing)
- Shared types (NowPlayingResponse, QueueResponse, NowPlayingTrack) for API contract
- Wrangler config with QUEUE_BRAIN Durable Object and KV namespace bindings

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared types, rotation algorithm, and KV cache helpers** - `c647e8b` (feat)
2. **Task 2: Wrangler config for Durable Object and KV bindings** - `bae17aa` (feat)

## Files Created/Modified

**Created:**
- `api/src/lib/rotation.ts` - Exponential decay weighting and weighted random selection
- `api/src/lib/kv-cache.ts` - KV read/write/invalidate helpers for now-playing cache

**Modified:**
- `packages/shared/src/index.ts` - Added NowPlayingResponse, QueueResponse, NowPlayingTrack types
- `api/wrangler.toml` - Added QUEUE_BRAIN DO binding, KV namespace, DO migration

## Decisions Made

1. **10-day half-life for exponential decay** - Gentle decay that favors newer tracks without completely eliminating older ones. Math.log(2) / (10 days in ms) = DECAY_CONSTANT.

2. **Tip boost formula: 1 + (tip_weight / 1e17)** - Linear boost where 0.1 ETH (1e17 wei) doubles selection weight. Simple, predictable, scales proportionally.

3. **Anti-repeat threshold: 5 tracks** - Below 5 tracks in catalog, disable anti-repeat filtering to prevent starvation. Small catalog fallback uses full unfiltered list.

4. **KV cache TTL strategy** - Waiting state: 5s (might get track soon). Playing state: min(track-end seconds, 60s max). Balances freshness with cache efficiency.

5. **Placeholder KV namespace IDs** - `placeholder-dev` for local development. Wrangler dev creates local KV automatically. Production requires `wrangler kv namespace create KV` and real ID.

6. **Binary search for weighted selection** - O(log n) selection from cumulative weights array. Efficient for large catalogs.

7. **MIN_WEIGHT floor (0.001)** - Prevents zero-weight edge cases from breaking weighted selection. All tracks have non-zero probability.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation passed, all exports verified.

## User Setup Required

None - no external service configuration required. KV namespace IDs are placeholders for local dev. Production deployment will require `wrangler kv namespace create KV` and updating IDs in wrangler.toml.

## Next Phase Readiness

**Ready for Plan 02 (QueueBrain Durable Object):**
- Rotation algorithm exports ready (calculateDecayWeight, selectTrackWeighted)
- KV cache helpers ready (getCachedNowPlaying, cacheNowPlaying, invalidateNowPlaying)
- Wrangler bindings configured (QUEUE_BRAIN DO, KV namespace)
- TrackCandidate interface defined for DO state management

**Ready for Plan 03 (API Routes):**
- Shared types exported (NowPlayingResponse, QueueResponse, NowPlayingTrack)
- KV cache helpers ready for GET /now-playing endpoint
- Response contract defined (state, track, startedAt, endsAt, nextTrack, message)

**No blockers or concerns.**

---
*Phase: 03-queue-now-playing*
*Completed: 2026-02-01*
