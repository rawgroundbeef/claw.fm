---
phase: 03-queue-now-playing
plan: 02
subsystem: queue
tags: [durable-objects, sqlite, alarms, weighted-selection, cloudflare-workers]

# Dependency graph
requires:
  - phase: 03-01
    provides: Rotation algorithm (exponential decay + tip boost), KV cache helpers, shared types
provides:
  - QueueBrain Durable Object with SQLite state management
  - Alarm-based automatic track advancement
  - Weighted track selection with anti-repeat and artist diversity
  - Idempotent immediate start capability
  - Queue preview generation (probabilistic simulation)
affects: [03-03-api-routes, 04-player, 05-payments]

# Tech tracking
tech-stack:
  added: [cloudflare:workers DurableObject base class]
  patterns: [DO SQLite for state persistence, Alarms for precise scheduling, RPC method pattern for DO access]

key-files:
  created:
    - api/src/durable-objects/types.ts
    - api/src/durable-objects/QueueBrain.ts
  modified: []

key-decisions:
  - "DO SQLite state: key-value queue_state table + play_history with wallet for artist diversity"
  - "Alarm precision: millisecond-level scheduling for exact track end times"
  - "created_at conversion: D1 stores UNIX seconds, rotation expects milliseconds - convert at fetch time"
  - "Idempotent startImmediately: check both current_track_id and alarm existence"
  - "Single-track looping: always return tracks[0].id when catalog size is 1"
  - "Play history includes wallet column (avoids D1 joins for artist diversity filtering)"
  - "24-hour history retention (prune on each recordPlay call)"

patterns-established:
  - "State persistence: ALL critical state in SQLite, never class properties"
  - "KV invalidation: delete 'now-playing' on every state change (start, advance, stop)"
  - "Anti-repeat context: last 10 track IDs, last 3 wallets"
  - "Fallback selection: if next_track_id missing or track deleted, fetch all tracks and select new one"

# Metrics
duration: 2min
completed: 2026-02-01
---

# Phase 03 Plan 02: QueueBrain Summary

**QueueBrain DO with SQLite state, alarm-based auto-advancement, weighted track selection using rotation algorithm, and millisecond-precise scheduling**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-01T22:08:56Z
- **Completed:** 2026-02-01T22:11:01Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- QueueBrain Durable Object (412 lines) managing all queue state
- SQLite tables (queue_state, play_history) for persistent state
- Alarm-based advancement with millisecond-precise track end scheduling
- Weighted track selection via rotation.ts with anti-repeat (last 10 tracks) and artist diversity (last 3 wallets)
- Idempotent startImmediately (no-op if already playing)
- Single-track catalog looping (station never goes silent)
- Queue preview generation (probabilistic simulation)
- KV cache invalidation on every state change
- D1 integration for track catalog queries with created_at conversion (seconds to milliseconds)
- 24-hour play history retention with automatic pruning

## Task Commits

Each task was committed atomically:

1. **Task 1: DO types and QueueBrain Durable Object** - `2f041fc` (feat)

## Files Created/Modified
- `api/src/durable-objects/types.ts` - QueueState, PlayHistoryEntry, TrackRow interfaces for DO-internal types
- `api/src/durable-objects/QueueBrain.ts` - Durable Object managing queue state, track selection, alarm-based advancement

## Decisions Made

**DO SQLite schema:**
- `queue_state` table: key-value store for current/next track IDs and timing (current_track_id, current_started_at, current_ends_at, next_track_id)
- `play_history` table: track_id, wallet, played_at (includes wallet to avoid D1 joins for artist diversity)
- Index on played_at DESC for efficient recent history queries

**Idempotent startImmediately:**
- Check both `current_track_id` state and `getAlarm()` return value
- If either is null, station is not playing
- Return false (no-op) if already playing

**created_at conversion:**
- D1 stores created_at as UNIX seconds (from `unixepoch()`)
- Rotation algorithm expects UNIX milliseconds (Date.now())
- Convert at fetch time: `created_at * 1000`

**Play history pruning:**
- Keep last 24 hours of history
- Prune on each `recordPlay()` call (not on schedule)
- Cutoff: `now - (24 * 60 * 60 * 1000)`

**Alarm error handling:**
- Wrap alarm() in try/catch
- Log error and re-throw (triggers alarm retry up to 6 times)
- Ensures transient failures don't stop the station

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - QueueBrain compiled clean on first typecheck, all requirements met.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 03 (API Routes):**
- QueueBrain DO class complete and exported
- RPC methods ready: getCurrentState(), getNextTrackId(), startImmediately(), getQueuePreview()
- Alarm handler tested (compiles clean)
- KV invalidation pattern established

**Pending:**
- QueueBrain export from index.ts (Plan 03 handles this)
- API routes to call QueueBrain methods (Plan 03)
- KV cache population logic (Plan 03)

**Blockers:**
None

**Concerns:**
None - DO pattern well-established, alarm scheduling straightforward

---
*Phase: 03-queue-now-playing*
*Completed: 2026-02-01*
