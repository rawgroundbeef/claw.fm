---
phase: 03-queue-now-playing
plan: 03
subsystem: api
tags: [hono, cloudflare-workers, durable-objects, kv-cache, rest-api]

# Dependency graph
requires:
  - phase: 03-02
    provides: QueueBrain DO with getCurrentState, getQueuePreview, startImmediately methods
  - phase: 03-01
    provides: KV cache helpers (getCachedNowPlaying, cacheNowPlaying)
  - phase: 02-submission-pipeline
    provides: Submit endpoint for track ingestion
provides:
  - GET /api/now-playing endpoint with KV cache fast path and DO fallback
  - GET /api/queue endpoint with probabilistic preview (up to 5 tracks)
  - Automatic playback start on first track submission
  - Complete API surface for queue and now-playing features
affects: [04-player, Phase 4 will consume these endpoints for real-time playback state]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KV cache-first pattern with DO fallback for read-heavy endpoints"
    - "DO RPC via 'as any' type assertion for public method access"
    - "Empty state returns 'waiting' sentinel response"

key-files:
  created:
    - api/src/routes/now-playing.ts
    - api/src/routes/queue.ts
  modified:
    - api/src/routes/submit.ts
    - api/src/index.ts

key-decisions:
  - "Queue preview not cached in KV (probabilistic result changes each call)"
  - "First-track detection via queuePosition === 1 from COUNT query"
  - "DO stub typed as 'as any' for RPC method access (TypeScript limitation)"
  - "Crossfade pre-buffer triggers at < 10s remaining"

patterns-established:
  - "DO stub pattern: c.env.QUEUE_BRAIN.idFromName('global-queue') then .get(id) as any"
  - "D1 snake_case to camelCase mapping for API responses"
  - "Waiting state returns short 5s cache TTL, playing state uses track end time"

# Metrics
duration: 3.1min
completed: 2026-02-01
---

# Phase 3 Plan 3: API Routes Summary

**GET /api/now-playing with KV caching, GET /api/queue with probabilistic preview, and automatic first-track playback trigger**

## Performance

- **Duration:** 3.1 min (188s)
- **Started:** 2026-02-01T21:47:46Z
- **Completed:** 2026-02-01T21:50:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Now-playing endpoint serves cached state (KV fast path) with DO fallback on miss
- Queue endpoint returns probabilistic preview of next 5 tracks from QueueBrain
- Submit endpoint triggers immediate playback when first track submitted (queuePosition === 1)
- QueueBrain DO exported from entry point for Cloudflare Workers discovery
- Complete Phase 3 API surface wired and ready for player integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Now-playing and queue API routes** - `8973e1c` (feat)
2. **Task 2: Submit integration and index.ts wiring** - `815b323` (feat)

## Files Created/Modified
- `api/src/routes/now-playing.ts` - GET /api/now-playing with KV cache fast path, DO fallback, crossfade pre-buffer
- `api/src/routes/queue.ts` - GET /api/queue with probabilistic preview (no caching)
- `api/src/routes/submit.ts` - Added immediate-start trigger for first track (queuePosition === 1)
- `api/src/index.ts` - Mounted new routes, exported QueueBrain DO, added QUEUE_BRAIN and KV bindings

## Decisions Made

**DO stub typing:** Used `as any` type assertion for DO stub RPC method access. TypeScript doesn't infer DO public methods on DurableObjectStub type, so explicit casting enables getCurrentState, getQueuePreview, and startImmediately calls.

**Queue preview caching:** Queue endpoint does NOT cache in KV. Probabilistic preview changes on each call (weighted random selection), so caching would freeze the preview and defeat the weighted rotation algorithm.

**First-track detection:** Submit route uses `queuePosition === 1` heuristic (from COUNT query) to trigger startImmediately. Simple and reliable - if there's exactly 1 track total, this must be the first. QueueBrain.startImmediately is idempotent, so race conditions are safe.

**Crossfade timing:** nextTrack included in now-playing response when < 10s remaining. Gives player time to pre-buffer next track for gapless crossfade transition.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

**Phase 3 complete.** All queue and now-playing infrastructure wired:
- QueueBrain DO manages state, selection, and advancement
- KV cache provides fast reads for now-playing
- API routes expose queue state to clients
- First track auto-starts playback

**Ready for Phase 4 (Player):**
- GET /api/now-playing returns current track, timing, and next track
- GET /api/queue shows upcoming 5 tracks
- Player can poll now-playing to sync playback state
- Crossfade pre-buffer data available when needed

**No blockers.** All Phase 3 features complete and verified.

---
*Phase: 03-queue-now-playing*
*Completed: 2026-02-01*
